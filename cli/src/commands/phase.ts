import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Command } from "commander";
import {
  type ForgeProgress,
  idleProgress,
  nowIso,
  readProgress,
  writeProgress,
} from "../state/progress.js";

type ScenarioFile = {
  scenarios?: Array<{
    priority?: unknown;
  }>;
};

function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function block(from: ForgeProgress["status"], blockedBy: string): void {
  process.exitCode = 1;
  writeJson({
    ok: false,
    from,
    blocked_by: blockedBy,
  });
}

function hasP0Scenario(cwd: string): boolean {
  const scenarios = JSON.parse(
    readFileSync(join(cwd, ".forge", "scenarios.json"), "utf8"),
  ) as ScenarioFile;

  return (
    Array.isArray(scenarios.scenarios) &&
    scenarios.scenarios.some((scenario) => scenario.priority === "P0")
  );
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

    if (!hasP0Scenario(cwd)) {
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

    writeProgress(cwd, {
      ...progress,
      status: "verification_complete",
      completed_tasks: progress.tasks.filter((task) => task.status === "done")
        .length,
      verification: {
        ...progress.verification,
        status: "pending",
        last_run: null,
        report_path: null,
      },
      updated_at: nowIso(),
    });
    writeJson({
      ok: true,
      from: "executing",
      to: "verification_complete",
    });
  });

  program.command("phase:finish").action(() => {
    const cwd = process.cwd();
    const progress = readProgress(cwd);

    if (progress.verification.status !== "passed") {
      block(progress.status, "verification not passed");
      return;
    }

    if (progress.status !== "verification_complete") {
      block(progress.status, "status is not verification_complete");
      return;
    }

    writeProgress(cwd, idleProgress());
    writeJson({
      ok: true,
      from: "verification_complete",
      to: "idle",
    });
  });
}
