import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Command } from "commander";
import { detectBuildCommand } from "../lib/buildCheck.js";
import { isWorkingTreeClean } from "../lib/gitStatus.js";
import { gitNexusUpdate, isGitNexusInstalled } from "../lib/gitnexus.js";
import { runShellCommand } from "../lib/runner.js";
import { readConfig } from "../state/config.js";
import {
  type ForgeProgress,
  idleProgress,
  nowIso,
  readProgress,
  writeProgress,
} from "../state/progress.js";
import { clearWorkflowRules, memoryPath } from "../state/memory.js";

type ScenarioFile = {
  scenarios?: Array<{
    priority?: unknown;
  }>;
};

const PHASE_COMPLETE_RETRY_LIMIT = 3;

function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function block(
  from: ForgeProgress["status"],
  blockedBy: string,
  extra: Record<string, unknown> = {},
): void {
  process.exitCode = 1;
  writeJson({
    ok: false,
    from,
    blocked_by: blockedBy,
    ...extra,
  });
}

function hasP0Scenario(
  cwd: string,
): { ok: true; hasP0: boolean } | { ok: false; error: string } {
  let raw: string;
  try {
    raw = readFileSync(join(cwd, ".forge", "scenarios.json"), "utf8");
  } catch (e) {
    return { ok: false, error: `scenarios.json read error: ${(e as Error).message}` };
  }

  let scenarios: ScenarioFile;
  try {
    // Strip BOM if present (Windows editors sometimes add one); JSON.parse
    // rejects it as invalid input.
    const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
    scenarios = JSON.parse(text) as ScenarioFile;
  } catch (e) {
    return { ok: false, error: `scenarios.json parse error: ${(e as Error).message}` };
  }

  const hasP0 =
    Array.isArray(scenarios.scenarios) &&
    scenarios.scenarios.some((scenario) => scenario.priority === "P0");
  return { ok: true, hasP0 };
}

export function registerPhaseCommand(program: Command): void {
  program.command("phase:advance").action(() => {
    const cwd = process.cwd();
    const progress = readProgress(cwd);

    if (progress.status !== "planning") {
      block(progress.status, "status is not planning");
      return;
    }

    if (!existsSync(join(cwd, ".forge", "scenarios.json"))) {
      block(progress.status, "scenarios.json not found");
      return;
    }

    const scenarioCheck = hasP0Scenario(cwd);
    if (!scenarioCheck.ok) {
      block(progress.status, scenarioCheck.error);
      return;
    }
    if (!scenarioCheck.hasP0) {
      block(progress.status, "no P0 scenario found");
      return;
    }

    if (!progress.spec_path) {
      block(progress.status, "spec_path missing");
      return;
    }

    writeProgress(cwd, {
      ...progress,
      status: "executing",
      updated_at: nowIso(),
    });
    writeJson({
      ok: true,
      from: "planning",
      to: "executing",
      checks: {
        scenarios: true,
        p0_scenario: true,
        spec_path: true,
      },
    });
  });

  program.command("phase:complete").action(() => {
    const cwd = process.cwd();
    const progress = readProgress(cwd);

    if (progress.status !== "executing") {
      block(progress.status, "status is not executing");
      return;
    }

    const unfinishedTask = progress.tasks.find(
      (task) => task.status !== "done" && task.status !== "deferred",
    );
    if (unfinishedTask) {
      block(progress.status, "tasks not finished");
      return;
    }

    // Retry budget: holistic spec-compliance review can re-enter subagent up
    // to PHASE_COMPLETE_RETRY_LIMIT - 1 times. Past that, force human review.
    const previousAttempts = progress.phase_complete_attempts;
    if (previousAttempts >= PHASE_COMPLETE_RETRY_LIMIT) {
      block(progress.status, "retry_exhausted", {
        phase_complete_attempts: previousAttempts,
        retry_limit: PHASE_COMPLETE_RETRY_LIMIT,
      });
      return;
    }

    // Working-tree gate: every task must be committed before promoting to
    // execution_complete. Otherwise the verification snapshot would not match
    // the source of truth (git history).
    const treeCheck = isWorkingTreeClean(cwd);
    if (!treeCheck.ok) {
      block(progress.status, "git_status_failed", { error: treeCheck.error });
      return;
    }
    if (!treeCheck.clean) {
      block(progress.status, "git_dirty", {
        dirty_paths: treeCheck.dirty_paths,
      });
      return;
    }

    // Build gate: the project must compile / build at this point. /verify will
    // run a fuller suite, but build failure is fast-fail and needs no test
    // setup, so we surface it here before transitioning state.
    const buildCommand = detectBuildCommand(cwd);
    if (buildCommand) {
      const build = runShellCommand(
        cwd,
        buildCommand.working_dir,
        buildCommand.command,
      );
      if (!build.ok) {
        // Increment attempts on a failed gate so /executing knows how much
        // budget remains for retries.
        const nextAttempts = previousAttempts + 1;
        writeProgress(cwd, {
          ...progress,
          updated_at: nowIso(),
          phase_complete_attempts: nextAttempts,
        });
        block(progress.status, "build_failed", {
          phase_complete_attempts: nextAttempts,
          retry_limit: PHASE_COMPLETE_RETRY_LIMIT,
          build: {
            command: build.command,
            ok: build.ok,
            status: build.status,
            stderr_excerpt: build.stderr.slice(0, 500),
          },
        });
        return;
      }
    }

    writeProgress(cwd, {
      ...progress,
      status: "execution_complete",
      completed_tasks: progress.tasks.filter((task) => task.status === "done")
        .length,
      // Reset both retry counters: phase_complete attempts can only matter
      // again if we cycle back to executing; verification.attempts always
      // starts fresh at execution_complete.
      phase_complete_attempts: 0,
      verification: {
        ...progress.verification,
        status: "pending",
        attempts: 0,
        last_run: null,
        report_path: null,
      },
      updated_at: nowIso(),
    });
    writeJson({
      ok: true,
      from: "executing",
      to: "execution_complete",
    });
  });

  // phase:verify-pass — promote execution_complete + verification.passed → verified.
  // This is the explicit "verification has passed, ready to finish" contract.
  program.command("phase:verify-pass").action(() => {
    const cwd = process.cwd();
    const progress = readProgress(cwd);

    if (progress.status !== "execution_complete") {
      block(progress.status, "status is not execution_complete");
      return;
    }

    if (progress.verification.status !== "passed") {
      block(progress.status, "verification not passed");
      return;
    }

    writeProgress(cwd, {
      ...progress,
      status: "verified",
      updated_at: nowIso(),
    });
    writeJson({
      ok: true,
      from: "execution_complete",
      to: "verified",
    });
  });

  program.command("phase:finish").action(() => {
    const cwd = process.cwd();
    const progress = readProgress(cwd);

    if (progress.status !== "verified") {
      block(progress.status, "status is not verified");
      return;
    }

    // GitNexus final index update before resetting state. Non-blocking.
    if (isGitNexusInstalled()) {
      gitNexusUpdate(cwd);
    }

    writeProgress(cwd, idleProgress());

    try {
      const config = readConfig(cwd);
      const file = memoryPath(cwd, config);
      if (existsSync(file)) {
        const content = readFileSync(file, "utf8");
        const cleaned = clearWorkflowRules(content);
        if (cleaned !== content) writeFileSync(file, cleaned, "utf8");
      }
    } catch {
      // Non-fatal
    }

    writeJson({
      ok: true,
      from: "verified",
      to: "idle",
    });
  });
}
