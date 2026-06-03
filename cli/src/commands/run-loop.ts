import { spawnSync } from "node:child_process";
import { join } from "node:path";
import type { Command } from "commander";
import type { ProgressStatus } from "../state/progress.js";
import {
  computeNextAction,
  type CliAction,
  type NextActionOutput,
  type RecordInstruction,
} from "./next-action.js";

// ── Output schema ──────────────────────────────────────────────────────

export type StepEntry = {
  command: string;
  ok: boolean;
  detail?: string;
};

type SkillOutput = {
  ok: true;
  action: "invoke-skill";
  phase: ProgressStatus;
  skill: string;
  args: Record<string, unknown>;
  record?: RecordInstruction;
  reason: string;
  reminder: string;
  steps_executed: StepEntry[];
};

type WaitOutput = {
  ok: true;
  action: "wait-human";
  phase: ProgressStatus | "idle";
  reason: string;
  recovery?: string;
  reminder: string;
  steps_executed: StepEntry[];
};

type ErrorOutput = {
  ok: false;
  error: string;
  recovery?: string;
  failed_step?: string;
  steps_executed: StepEntry[];
};

export type RunLoopOutput = SkillOutput | WaitOutput | ErrorOutput;

// ── Constants ──────────────────────────────────────────────────────────

const MAX_ITERATIONS = 20;

// ── Helpers ────────────────────────────────────────────────────────────

function buildCliArgs(command: string, args: Record<string, unknown>): string[] {
  // command is e.g. "forge guard:run" → extract subcommand "guard:run"
  const subcommand = command.startsWith("forge ")
    ? command.slice(6)
    : command;

  const result = [subcommand];
  for (const [key, value] of Object.entries(args)) {
    const flag = `--${key.replace(/_/g, "-")}`;
    result.push(flag, String(value));
  }
  return result;
}

function buildRecordArgs(record: RecordInstruction): string[] {
  const result = ["guard:record"];
  for (const [key, value] of Object.entries(record.args)) {
    if (value === undefined) continue;
    const flag = `--${key.replace(/_/g, "-")}`;
    result.push(flag, String(value));
  }
  return result;
}

type CmdResult = { ok: boolean; stdout: string; error?: string; recovery?: string };

function execForgeCommand(cliBin: string, args: string[], cwd: string): CmdResult {
  const result = spawnSync(process.execPath, [cliBin, ...args], {
    cwd,
    encoding: "utf8",
  });

  const stdout = result.stdout ?? "";
  if (result.error || result.status !== 0) {
    // Try to parse JSON output for error details
    try {
      const parsed = JSON.parse(stdout.trim()) as Record<string, unknown>;
      return {
        ok: false,
        stdout,
        error: (parsed.error as string) ?? (parsed.blocked_by as string) ?? "command failed",
        recovery: parsed.recovery as string | undefined,
      };
    } catch {
      return {
        ok: false,
        stdout,
        error: result.error?.message ?? `exit code ${result.status}`,
      };
    }
  }

  return { ok: true, stdout };
}

// ── Core loop ──────────────────────────────────────────────────────────

export function runLoopCore(cwd: string): RunLoopOutput {
  const cliBin = join(import.meta.dirname, "../index.js");
  const steps: StepEntry[] = [];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const action: NextActionOutput = computeNextAction(cwd);

    // ── Terminal conditions (exit to LLM) ──────────────────────────
    if (!action.ok) {
      steps.push({ command: "next-action", ok: false, detail: action.error });
      return {
        ok: false,
        error: action.error,
        recovery: action.recovery,
        steps_executed: steps,
      };
    }

    if (action.action === "wait-human") {
      steps.push({ command: "next-action", ok: true, detail: `wait-human: ${action.reason}` });
      return {
        ok: true,
        action: "wait-human",
        phase: action.phase,
        reason: action.reason,
        recovery: action.recovery,
        reminder: action.reminder,
        steps_executed: steps,
      };
    }

    if (action.action === "invoke-skill") {
      steps.push({ command: "next-action", ok: true, detail: `invoke-skill ${action.skill}` });
      return {
        ok: true,
        action: "invoke-skill",
        phase: action.phase,
        skill: action.skill,
        args: action.args,
        record: action.record,
        reason: action.reason,
        reminder: action.reminder,
        steps_executed: steps,
      };
    }

    // ── run-cli: execute internally ────────────────────────────────
    const cliAction = action as CliAction;
    steps.push({ command: "next-action", ok: true, detail: `run-cli ${cliAction.command}` });

    // Execute the command
    const cmdArgs = buildCliArgs(cliAction.command, cliAction.args);
    const cmdResult = execForgeCommand(cliBin, cmdArgs, cwd);
    steps.push({ command: `forge ${cmdArgs.join(" ")}`, ok: cmdResult.ok });

    if (!cmdResult.ok) {
      return {
        ok: false,
        error: `${cliAction.command} failed: ${cmdResult.error}`,
        recovery: cmdResult.recovery,
        failed_step: cliAction.command,
        steps_executed: steps,
      };
    }

    // Execute record if present
    if (cliAction.record) {
      const recordArgs = buildRecordArgs(cliAction.record);
      const recordResult = execForgeCommand(cliBin, recordArgs, cwd);
      steps.push({ command: `forge ${recordArgs.join(" ")}`, ok: recordResult.ok });

      if (!recordResult.ok) {
        return {
          ok: false,
          error: `guard:record failed: ${recordResult.error}`,
          failed_step: "forge guard:record",
          steps_executed: steps,
        };
      }
    }

    // Handle after instruction
    if (cliAction.after.type === "call-next-action") {
      continue; // loop back
    }

    if (cliAction.after.type === "invoke-skill") {
      const after = cliAction.after;
      steps.push({ command: "after", ok: true, detail: `invoke-skill ${after.skill}` });
      return {
        ok: true,
        action: "invoke-skill",
        phase: cliAction.phase,
        skill: after.skill,
        args: after.args ?? {},
        reason: cliAction.reason,
        reminder: cliAction.reminder,
        steps_executed: steps,
      };
    }

    if (cliAction.after.type === "wait-human") {
      steps.push({ command: "after", ok: true, detail: `wait-human: ${cliAction.after.reason}` });
      return {
        ok: true,
        action: "wait-human",
        phase: cliAction.phase,
        reason: cliAction.after.reason,
        reminder: cliAction.reminder,
        steps_executed: steps,
      };
    }
  }

  // Iteration limit reached
  return {
    ok: false,
    error: "run-loop iteration limit reached (20)",
    steps_executed: steps,
  };
}

// ── Command registration ───────────────────────────────────────────────

function writeJson(payload: RunLoopOutput): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

export function registerRunLoopCommand(program: Command): void {
  program.command("run-loop").action(() => {
    const output = runLoopCore(process.cwd());
    if (!output.ok) process.exitCode = 1;
    writeJson(output);
  });
}
