import { join } from "node:path";
import type { Command } from "commander";
import { git } from "../lib/git.js";
import { triggeredGuards } from "../lib/guard.js";
import { runGstack, type GstackResult } from "../lib/gstack/runner.js";
import { checkCoverage } from "../lib/scanners/coverage.js";
import { extractNewPackagesFromDiff, runDependencyAudit } from "../lib/scanners/dependency.js";
import { scanFiles } from "../lib/scanners/security.js";
import type { Severity } from "../lib/scanners/security.js";
import { readConfig, type ForgeConfig } from "../state/config.js";
import {
  type ForgeProgress,
  type ForgeTask,
  nowIso,
  readProgress,
  writeProgress,
} from "../state/progress.js";

type GuardRecordOptions = {
  type: string;
  status: string;
  tasks: string;
  notes?: string;
};

type GuardPreviewOptions = {
  nextTaskId: string;
  nextTaskTitle: string;
};

type GuardRunOptions = {
  type: string;
  taskId: string;
};

function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function fail(error: string): void {
  process.exitCode = 1;
  writeJson({ ok: false, error });
}

function parseTasks(value: string): number[] | null {
  const ids = value.split(",").map((part) => Number(part.trim()));

  if (
    ids.length === 0 ||
    ids.some((id) => !Number.isInteger(id) || id < 1)
  ) {
    return null;
  }

  return ids;
}

function guardStatus(
  value: string,
): "passed" | "failed" | "skipped" | null {
  if (value === "passed" || value === "failed" || value === "skipped") {
    return value;
  }

  return null;
}

function parsePositiveInteger(value: string): number | null {
  const id = Number(value);

  if (!Number.isInteger(id) || id < 1) {
    return null;
  }

  return id;
}

function previewProgress(progress: ForgeProgress, task: ForgeTask): ForgeProgress {
  const tasks = progress.tasks.some((item) => item.id === task.id)
    ? progress.tasks.map((item) => (item.id === task.id ? task : item))
    : [...progress.tasks, task];

  return {
    ...progress,
    tasks,
    completed_tasks: tasks.filter((item) => item.status === "done").length,
  };
}

const GSTACK_ACTION_TYPES: Record<string, "e2e" | "visual" | "performance"> = {
  "gstack-e2e": "e2e",
  "gstack-visual": "visual",
  "gstack-performance": "performance",
};

type DispatchedActions = {
  ok: boolean;
  executed: Array<{ action: string } & (GstackResult | {
    ok: false;
    unavailable: true;
    type: string;
    message: string;
  })>;
  delegated: string[];
};

function dispatchActions(
  cwd: string,
  config: ForgeConfig,
  actions: string[],
): DispatchedActions {
  const executed: DispatchedActions["executed"] = [];
  const delegated: string[] = [];
  let ok = true;

  for (const action of actions) {
    const gstackType = GSTACK_ACTION_TYPES[action];
    if (!gstackType) {
      delegated.push(action);
      continue;
    }

    if (config.gstack_installed !== true) {
      ok = false;
      executed.push({
        action,
        ok: false,
        unavailable: true,
        type: gstackType,
        message: "gstack is not installed or not enabled in config.json",
      });
      continue;
    }

    const result = runGstack(cwd, { type: gstackType });
    if (!result.ok) ok = false;
    executed.push({ action, ...result });
  }

  return { ok, executed, delegated };
}

export function registerGuardCommand(program: Command): void {
  program
    .command("guard:preview")
    .requiredOption("--next-task-id <id>", "next task id")
    .requiredOption("--next-task-title <title>", "next task title")
    .action((options: GuardPreviewOptions) => {
      const id = parsePositiveInteger(options.nextTaskId);
      if (id === null) {
        fail(`invalid task id: ${options.nextTaskId}`);
        return;
      }

      const cwd = process.cwd();
      const progress = readProgress(cwd);
      const task: ForgeTask = {
        id,
        title: options.nextTaskTitle,
        status: "done",
      };
      const guards = triggeredGuards(
        readConfig(cwd),
        previewProgress(progress, task),
        task,
      );

      writeJson({
        ok: true,
        guard_triggered: guards.length > 0,
        guards,
        guard_type: guards[0]?.type ?? null,
      });
    });

  program
    .command("guard:run")
    .requiredOption("--type <type>", "guard type")
    .requiredOption("--task-id <id>", "task id")
    .action((options: GuardRunOptions) => {
      const id = parsePositiveInteger(options.taskId);
      if (id === null) {
        fail(`invalid task id: ${options.taskId}`);
        return;
      }

      const cwd = process.cwd();
      const config = readConfig(cwd);
      const type = options.type;

      if (type === "security-scan") {
        const guardConfig = config.guards["security-scan"];
        const threshold = (guardConfig?.severity_threshold ?? "HIGH") as Severity;
        const gitResult = git(cwd, ["diff", "--name-only", "HEAD~1"]);
        const files = gitResult.ok
          ? gitResult.stdout.split("\n").filter((f) => f.length > 0).map((f) => join(cwd, f))
          : [];
        const result = scanFiles(files, { severityThreshold: threshold });
        if (!result.ok) process.exitCode = 1;
        writeJson(result);
        return;
      }

      if (type === "dependency-audit") {
        const guardConfig = config.guards["dependency-audit"];
        const allowlist = guardConfig?.license_allowlist ?? ["MIT", "Apache-2.0", "ISC"];
        const diffResult = git(cwd, ["diff", "HEAD~1", "--", "package.json"]);
        const newPkgs = diffResult.ok ? extractNewPackagesFromDiff(diffResult.stdout) : [];
        const result = runDependencyAudit(cwd, newPkgs, allowlist);
        if (!result.ok) process.exitCode = 1;
        writeJson(result);
        return;
      }

      if (type === "coverage-gate") {
        const unitTarget = config.test_coverage?.unit ?? 80;
        const integrationTarget = config.test_coverage?.integration ?? 60;
        const result = checkCoverage(cwd, { unit: unitTarget, integration: integrationTarget });
        if (!result.ok) process.exitCode = 1;
        writeJson(result);
        return;
      }

      // Delegated types: batch-review, human-review, etc. Some of their
      // configured actions may be deterministic (gstack-*) and run inline;
      // the rest are returned as delegated_actions for the skill layer to
      // dispatch (e.g. spec-compliance-review).
      const guardConfig = config.guards[type];
      const actions = guardConfig?.actions ?? [];
      const dispatched = dispatchActions(cwd, config, actions);

      if (!dispatched.ok) process.exitCode = 1;
      writeJson({
        ok: dispatched.ok,
        delegated: true,
        type,
        executed: dispatched.executed,
        delegated_actions: dispatched.delegated,
      });
    });

  program.command("guard:coverage-check").action(() => {
    const cwd = process.cwd();
    const config = readConfig(cwd);
    const unitTarget = config.test_coverage?.unit ?? 80;
    const integrationTarget = config.test_coverage?.integration ?? 60;
    const result = checkCoverage(cwd, { unit: unitTarget, integration: integrationTarget });
    if (!result.ok) process.exitCode = 1;
    writeJson(result);
  });

  program
    .command("guard:security-scan")
    .option("--files <paths>", "comma-separated file paths to scan")
    .action((options: { files?: string }) => {
      const cwd = process.cwd();
      const config = readConfig(cwd);
      const guardConfig = config.guards["security-scan"];
      const threshold = (guardConfig?.severity_threshold ?? "HIGH") as Severity;
      const files = (options.files ?? "")
        .split(",")
        .map((f) => f.trim())
        .filter(Boolean)
        .map((f) => join(cwd, f));
      const result = scanFiles(files, { severityThreshold: threshold });
      if (!result.ok) process.exitCode = 1;
      writeJson(result);
    });

  program
    .command("guard:dependency-audit")
    .option("--new-packages <names>", "comma-separated package names to audit")
    .action((options: { newPackages?: string }) => {
      const cwd = process.cwd();
      const config = readConfig(cwd);
      const guardConfig = config.guards["dependency-audit"];
      const allowlist = guardConfig?.license_allowlist ?? ["MIT", "Apache-2.0", "ISC"];
      const newPkgs = (options.newPackages ?? "")
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean);
      const result = runDependencyAudit(cwd, newPkgs, allowlist);
      if (!result.ok) process.exitCode = 1;
      writeJson(result);
    });

  program
    .command("guard:record")
    .requiredOption("--type <type>", "guard type")
    .requiredOption("--status <status>", "guard status")
    .requiredOption("--tasks <ids>", "comma-separated task ids")
    .option("--notes <text>", "guard notes")
    .action((options: GuardRecordOptions) => {
      const status = guardStatus(options.status);
      if (!status) {
        fail(`invalid guard status: ${options.status}`);
        return;
      }

      const tasks = parseTasks(options.tasks);
      if (!tasks) {
        fail(`invalid task list: ${options.tasks}`);
        return;
      }

      const cwd = process.cwd();
      const progress = readProgress(cwd);
      const unknownTask = tasks.find(
        (id) => !progress.tasks.some((task) => task.id === id),
      );
      if (unknownTask !== undefined) {
        fail(`unknown task id: ${unknownTask}`);
        return;
      }

      const taskRange: [number, number] = [Math.min(...tasks), Math.max(...tasks)];
      const guard = {
        id: `guard-${progress.guard_history.length + 1}`,
        type: options.type,
        triggered_at: nowIso(),
        task_range: taskRange,
        status,
        ...(options.notes ? { notes: options.notes } : {}),
      };

      writeProgress(cwd, {
        ...progress,
        updated_at: nowIso(),
        guard_history: [...progress.guard_history, guard],
      });
      writeJson({ ok: true, guard });
    });

  program.command("guard:history").action(() => {
    const progress = readProgress(process.cwd());

    writeJson({
      ok: true,
      guards: progress.guard_history,
    });
  });
}
