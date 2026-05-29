import { join } from "node:path";
import type { Command } from "commander";
import { git, isGitRepo } from "../lib/git.js";
import { triggeredGuards } from "../lib/guard.js";
import { checkCoverage } from "../lib/scanners/coverage.js";
import { extractNewPackagesFromDiff, runDependencyAudit } from "../lib/scanners/dependency.js";
import { scanFiles } from "../lib/scanners/security.js";
import type { Severity } from "../lib/scanners/security.js";
import { readConfig } from "../state/config.js";
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

type ExecutedAction = {
  action: string;
  ok: boolean;
  result?: unknown;
  error?: string;
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

/**
 * Resolves changed files using `git diff HEAD~1`. Returns `{ ok: false, error }`
 * when the repo has fewer than 2 commits or git is unavailable, instead of
 * silently returning an empty list (BUG-C04). Callers should treat this as a
 * scanner failure rather than a clean scan.
 */
function changedFilesSinceParent(
  cwd: string,
  pathSpec?: string,
): { ok: true; files: string[] } | { ok: false; error: string } {
  if (!isGitRepo(cwd)) {
    return { ok: false, error: "not a git repository" };
  }

  // Confirm HEAD~1 resolves before running diff so the error message is
  // explicit instead of "fatal: ambiguous argument 'HEAD~1'".
  const parent = git(cwd, ["rev-parse", "--verify", "HEAD~1"]);
  if (!parent.ok) {
    return {
      ok: false,
      error:
        "HEAD~1 not found — repository has fewer than 2 commits, cannot diff against previous commit",
    };
  }

  const args = pathSpec
    ? ["diff", "--name-only", "HEAD~1", "--", pathSpec]
    : ["diff", "--name-only", "HEAD~1"];
  const diff = git(cwd, args);
  if (!diff.ok) {
    return {
      ok: false,
      error: diff.stderr.trim() || "git diff HEAD~1 failed",
    };
  }

  const files = diff.stdout
    .split("\n")
    .filter((f) => f.length > 0);
  return { ok: true, files };
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

      // BUG-S04: All guard types now return a unified shape:
      //   { ok, type, executed: ExecutedAction[], delegated_actions: string[], ... }
      // Inline scanners populate `executed` with their result; AI-driven
      // delegated guards populate `delegated_actions` for the skill layer.

      if (type === "security-scan") {
        const guardConfig = config.guards["security-scan"];
        const threshold = (guardConfig?.severity_threshold ?? "HIGH") as Severity;
        const filesResult = changedFilesSinceParent(cwd);

        if (!filesResult.ok) {
          process.exitCode = 1;
          const executed: ExecutedAction[] = [
            { action: "security-audit", ok: false, error: filesResult.error },
          ];
          writeJson({
            ok: false,
            type,
            executed,
            delegated_actions: [],
            error: filesResult.error,
          });
          return;
        }

        const files = filesResult.files.map((f) => join(cwd, f));
        const result = scanFiles(files, { severityThreshold: threshold });
        if (!result.ok) process.exitCode = 1;
        const executed: ExecutedAction[] = [
          { action: "security-audit", ok: result.ok, result },
        ];
        writeJson({
          ok: result.ok,
          type,
          executed,
          delegated_actions: [],
          findings: result.findings,
          scanned_files: result.scanned_files,
          scanner: result.scanner,
        });
        return;
      }

      if (type === "dependency-audit") {
        const guardConfig = config.guards["dependency-audit"];
        const allowlist = guardConfig?.license_allowlist ?? ["MIT", "Apache-2.0", "ISC"];
        const filesResult = changedFilesSinceParent(cwd, "package.json");

        if (!filesResult.ok) {
          process.exitCode = 1;
          const executed: ExecutedAction[] = [
            { action: "dependency-check", ok: false, error: filesResult.error },
          ];
          writeJson({
            ok: false,
            type,
            executed,
            delegated_actions: [],
            error: filesResult.error,
          });
          return;
        }

        // Re-run diff with content (the file-only result above told us whether
        // package.json changed — extract package names from the full diff).
        const diffResult = git(cwd, ["diff", "HEAD~1", "--", "package.json"]);
        const newPkgs = diffResult.ok ? extractNewPackagesFromDiff(diffResult.stdout) : [];
        const result = runDependencyAudit(cwd, newPkgs, allowlist);
        if (!result.ok) process.exitCode = 1;
        const executed: ExecutedAction[] = [
          { action: "dependency-check", ok: result.ok, result },
        ];
        writeJson({
          ok: result.ok,
          type,
          executed,
          delegated_actions: [],
          packages: result.packages,
          new_packages_detected: result.new_packages_detected,
          scanner: result.scanner,
        });
        return;
      }

      if (type === "coverage-gate") {
        const unitTarget = config.test_coverage?.unit ?? 80;
        const integrationTarget = config.test_coverage?.integration ?? 60;
        const result = checkCoverage(cwd, { unit: unitTarget, integration: integrationTarget });
        if (!result.ok) process.exitCode = 1;
        const executed: ExecutedAction[] = [
          { action: "coverage-check", ok: result.ok, result },
        ];
        writeJson({
          ok: result.ok,
          type,
          executed,
          delegated_actions: [],
          coverage: result.coverage,
          report_path: result.report_path,
          format: result.format,
          ...(result.error ? { error: result.error } : {}),
        });
        return;
      }

      // Delegated types: batch-review, human-review, performance-budget, etc.
      // All configured actions are returned as delegated_actions for the skill
      // layer to dispatch (e.g. spec-compliance-review via Superpowers,
      // gstack-* via the gstack skill).
      const guardConfig = config.guards[type];
      const actions = guardConfig?.actions ?? [];
      writeJson({
        ok: true,
        delegated: true,
        type,
        executed: [],
        delegated_actions: actions,
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
      // BUG-C07: timestamped + random suffix prevents id collisions when
      // history is cleared / reset / replayed.
      const guard = {
        id: `guard-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
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
