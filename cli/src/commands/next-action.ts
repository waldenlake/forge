import { existsSync } from "node:fs";
import type { Command } from "commander";
import type { ForgeConfig } from "../state/config.js";
import { configPath, readConfig } from "../state/config.js";
import type { ForgeProgress, ForgeTask, ProgressStatus } from "../state/progress.js";
import { readProgressLoose, readRawConfigVersion } from "../state/looseRead.js";
import { triggeredGuards } from "../lib/guard.js";
import type { TriggeredGuard } from "../lib/guard.js";
import { evaluateContextCheckpoint } from "../plugins/context-manager.js";

// ── Output schema (discriminated union) ────────────────────────────────

export type AfterInstruction =
  | { type: "call-next-action" }
  | { type: "invoke-skill"; skill: string; args?: Record<string, unknown> }
  | { type: "wait-human"; reason: string };

export type RecordInstruction = {
  command: "forge guard:record";
  args: { type: string; status: "passed" | "failed"; tasks: string; notes?: string };
};

export type CliAction = {
  ok: true;
  phase: ProgressStatus;
  action: "run-cli";
  command: string;
  args: Record<string, unknown>;
  reason: string;
  after: AfterInstruction;
  record?: RecordInstruction;
  reminder: string;
};

export type SkillAction = {
  ok: true;
  phase: ProgressStatus;
  action: "invoke-skill";
  skill: string;
  args: Record<string, unknown>;
  record?: RecordInstruction;
  reason: string;
  reminder: string;
};

export type WaitAction = {
  ok: true;
  phase: ProgressStatus | "idle";
  action: "wait-human";
  reason: string;
  recovery?: string;
  reminder: string;
};

export type ErrorAction = {
  ok: false;
  error: string;
  recovery?: string;
  migration_required?: true;
};

export type NextActionOutput = CliAction | SkillAction | WaitAction | ErrorAction;

// ── Constants ──────────────────────────────────────────────────────────

const REMINDER =
  "You are a Forge execution agent. Run forge next-action, execute exactly what it returns, then call forge next-action again. Do not improvise.";

const INLINE_GUARDS = new Set(["security-scan", "dependency-audit", "coverage-gate"]);

const VALID_STATUSES: ReadonlySet<string> = new Set<ProgressStatus>([
  "idle",
  "planning",
  "executing",
  "execution_complete",
  "verified",
]);

// ── Helpers ────────────────────────────────────────────────────────────

function rangeToCsv(range: [number, number]): string {
  const ids: number[] = [];
  for (let i = range[0]; i <= range[1]; i++) {
    ids.push(i);
  }
  return ids.join(",");
}

// ── Phase handlers ─────────────────────────────────────────────────────

function handleIdle(): WaitAction {
  return {
    ok: true,
    phase: "idle",
    action: "wait-human",
    reason: "no active feature — run /start <requirement>",
    reminder: REMINDER,
  };
}

function handlePlanning(): SkillAction {
  return {
    ok: true,
    phase: "planning",
    action: "invoke-skill",
    skill: "forge_planning",
    args: {},
    reason: "feature registered, planning not complete",
    reminder: REMINDER,
  };
}

function handleExecutionComplete(): SkillAction {
  return {
    ok: true,
    phase: "execution_complete",
    action: "invoke-skill",
    skill: "forge_verify",
    args: {},
    reason: "execution complete, verification required",
    reminder: REMINDER,
  };
}

function handleVerified(): SkillAction {
  return {
    ok: true,
    phase: "verified",
    action: "invoke-skill",
    skill: "forge_done",
    args: {},
    reason: "verification passed, ready to finish",
    reminder: REMINDER,
  };
}

// ── Guard detection ────────────────────────────────────────────────────

type DueGuard = TriggeredGuard & { task_range: [number, number] };

function dueGuard(config: ForgeConfig, progress: ForgeProgress): DueGuard | undefined {
  // Keyword-triggered guards (security-scan with trigger:"keyword") and manual
  // guards (human-review with trigger:"manual") fire at task:done time, bound to
  // the specific completed task. They are handled by the task:done flow in task.ts,
  // not by next-action. Here we only detect batch-style guards (every_n_tasks)
  // which depend solely on progress.completed_tasks + guard_history.
  // A dummy task with empty title ensures keyword/manual triggers don't false-fire.
  const dummyTask: ForgeTask = { id: 0, title: "", status: "done" };
  const guards = triggeredGuards(config, progress, dummyTask);

  // Return the first guard with a task_range (batch-style guards always have one).
  for (const g of guards) {
    if (g.task_range) {
      return g as DueGuard;
    }
  }

  return undefined;
}

// ── Executing-phase priority router ────────────────────────────────────

function handleExecuting(config: ForgeConfig, progress: ForgeProgress): NextActionOutput {
  // Priority 1: failed task → wait-human
  const failed = progress.tasks.find((t) => t.status === "failed");
  if (failed) {
    return {
      ok: true,
      phase: "executing",
      action: "wait-human",
      reason: `task ${failed.id} failed: ${failed.failure_reason ?? "unknown"}`,
      recovery: `forge task:reset --id ${failed.id} --reason '<your reason>'`,
      reminder: REMINDER,
    };
  }

  // Priority 2: guard due
  const guard = dueGuard(config, progress);
  if (guard) {
    const tasks = rangeToCsv(guard.task_range);
    const lastTaskId = guard.task_range[1];
    const record: RecordInstruction = {
      command: "forge guard:record",
      args: { type: guard.type, status: "passed", tasks },
    };

    if (INLINE_GUARDS.has(guard.type)) {
      return {
        ok: true,
        phase: "executing",
        action: "run-cli",
        command: "forge guard:run",
        args: { type: guard.type, task_id: lastTaskId },
        reason: `${guard.type} guard due after task ${lastTaskId}`,
        record,
        after: { type: "call-next-action" },
        reminder: REMINDER,
      };
    }

    // Delegated guard
    return {
      ok: true,
      phase: "executing",
      action: "invoke-skill",
      skill: "forge_executing",
      args: {
        guard: guard.type,
        delegated_actions: guard.actions,
        task_range: guard.task_range,
      },
      reason: `${guard.type} guard due after task ${lastTaskId}`,
      record,
      reminder: REMINDER,
    };
  }

  // Priority 3: context-manager checkpoint — if over threshold, suggest handoff
  // instead of dispatching the next task. This fires only when:
  //   - plugin is enabled
  //   - platform supports context reading
  //   - usage_pct > threshold
  // The checkpoint is here (between guards and next-task dispatch) because
  // this is the only clean seam where task N is done and task N+1 hasn't started.
  const cwd = process.cwd();
  const contextDecision = evaluateContextCheckpoint(cwd);
  if (contextDecision.action === "handoff-session") {
    return {
      ok: true,
      phase: "executing",
      action: "handoff-session",
      method: contextDecision.method,
      reason: contextDecision.reason,
      reminder: REMINDER,
    } as any;
  }
  if (contextDecision.action === "suggest-compact") {
    return {
      ok: true,
      phase: "executing",
      action: "suggest-compact",
      reason: contextDecision.reason,
      reminder: REMINDER,
    } as any;
  }

  // Priority 4: in_progress or pending task → forge_executing
  const task =
    progress.tasks.find((t) => t.status === "in_progress") ??
    progress.tasks.find((t) => t.status === "pending");
  if (task) {
    return {
      ok: true,
      phase: "executing",
      action: "invoke-skill",
      skill: "forge_executing",
      args: { task_id: task.id, task_title: task.title },
      reason: `task ${task.id} is ${task.status}`,
      reminder: REMINDER,
    };
  }

  // Priority 5: all tasks done/deferred → phase:complete
  return {
    ok: true,
    phase: "executing",
    action: "run-cli",
    command: "forge phase:complete",
    args: {},
    reason: "all tasks done or deferred",
    after: { type: "call-next-action" },
    reminder: REMINDER,
  };
}

// ── Core logic (callable by run-loop) ──────────────────────────────────

export function computeNextAction(cwd: string): NextActionOutput {
  // Missing config → project not initialized
  if (!existsSync(configPath(cwd))) {
    return {
      ok: true,
      phase: "idle",
      action: "wait-human",
      reason: "project not initialized",
      recovery: "forge init --auto-detect",
      reminder: REMINDER,
    };
  }

  // Config version mismatch (also handles corrupt config.json)
  let rawVersion: string | null;
  try {
    rawVersion = readRawConfigVersion(cwd);
  } catch (e) {
    return {
      ok: false,
      error: `config.json invalid: ${(e as Error).message}`,
      recovery: "forge reset --backup",
    };
  }
  if (rawVersion !== "2.0") {
    return {
      ok: false,
      error: "config version is not 2.0",
      migration_required: true,
      recovery: "forge migrate --from 1.0 --to 2.0",
    };
  }

  // Progress parse/validation failure
  const progressResult = readProgressLoose(cwd);
  if (!progressResult.ok) {
    return {
      ok: false,
      error: `progress.json invalid: ${progressResult.error}`,
      recovery: "forge reset --backup",
    };
  }

  const config = readConfig(cwd);
  const progress = progressResult.progress;

  // Route by status
  if (!VALID_STATUSES.has(progress.status)) {
    return {
      ok: false,
      error: `unrecognized status: "${progress.status}"`,
      recovery: "forge reset --backup",
    };
  }

  switch (progress.status) {
    case "idle":
      return handleIdle();
    case "planning":
      return handlePlanning();
    case "executing":
      return handleExecuting(config, progress);
    case "execution_complete":
      return handleExecutionComplete();
    case "verified":
      return handleVerified();
    default:
      return {
        ok: false,
        error: `unrecognized status: "${progress.status as string}"`,
        recovery: "forge reset --backup",
      };
  }
}

// ── Command registration ───────────────────────────────────────────────

function writeJson(payload: NextActionOutput): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

export function registerNextActionCommand(program: Command): void {
  program.command("next-action").action(() => {
    const output = computeNextAction(process.cwd());
    if (!output.ok) process.exitCode = 1;
    writeJson(output);
  });
}
