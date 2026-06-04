import type { Command } from "commander";
import { triggeredGuards } from "../lib/guard.js";
import { findTaskCommit, isGitRepo } from "../lib/git.js";
import { gitNexusUpdate, isGitNexusInstalled } from "../lib/gitnexus.js";
import { writeHandoff } from "../lib/handoff.js";
import { readConfig } from "../state/config.js";
import {
  type ForgeProgress,
  type ForgeTask,
  nowIso,
  readProgress,
  writeProgress,
} from "../state/progress.js";

type TaskIdOptions = {
  id: string;
};

type TaskReasonOptions = TaskIdOptions & {
  reason: string;
};

function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function fail(error: string): void {
  process.exitCode = 1;
  writeJson({ ok: false, error });
}

function block(progress: ForgeProgress): void {
  process.exitCode = 1;
  writeJson({
    ok: false,
    from: progress.status,
    blocked_by: "status is not executing",
  });
}

function taskId(options: TaskIdOptions): number | null {
  const id = Number(options.id);

  if (!Number.isInteger(id) || id < 1) {
    return null;
  }

  return id;
}

function findTask(progress: ForgeProgress, id: number): ForgeTask | undefined {
  return progress.tasks.find((task) => task.id === id);
}

function updateTask(
  progress: ForgeProgress,
  id: number,
  update: (task: ForgeTask) => ForgeTask,
): ForgeProgress {
  return {
    ...progress,
    updated_at: nowIso(),
    tasks: progress.tasks.map((task) => (task.id === id ? update(task) : task)),
  };
}

function completedTasks(progress: ForgeProgress): number {
  return progress.tasks.filter((task) => task.status === "done").length;
}

function rejectUnknownTask(id: number): void {
  fail(`unknown task id: ${id}`);
}

function rejectUnlessExecuting(progress: ForgeProgress): boolean {
  if (progress.status === "executing") {
    return false;
  }

  block(progress);
  return true;
}

function rejectUnlessOpenTask(task: ForgeTask): boolean {
  if (task.status === "pending" || task.status === "in_progress") {
    return false;
  }

  fail(`task ${task.id} is ${task.status}, expected pending or in_progress`);
  return true;
}

export function registerTaskCommand(program: Command): void {
  program
    .command("task:start")
    .requiredOption("--id <id>", "task id")
    .action((options: TaskIdOptions) => {
      const id = taskId(options);
      if (id === null) {
        fail(`invalid task id: ${options.id}`);
        return;
      }

      const cwd = process.cwd();
      const progress = readProgress(cwd);
      if (rejectUnlessExecuting(progress)) {
        return;
      }

      const task = findTask(progress, id);
      if (!task) {
        rejectUnknownTask(id);
        return;
      }

      if (task.status === "in_progress") {
        writeJson({ ok: true, task });
        return;
      }

      if (task.status !== "pending") {
        fail(`task ${id} is ${task.status}, expected pending or in_progress`);
        return;
      }

      const startedAt = nowIso();
      const updatedProgress = updateTask(progress, id, (item) => ({
        ...item,
        status: "in_progress",
        started_at: startedAt,
      }));
      const updatedTask = findTask(updatedProgress, id)!;

      writeProgress(cwd, updatedProgress);
      writeJson({ ok: true, task: updatedTask });
    });

  program
    .command("task:done")
    .requiredOption("--id <id>", "task id")
    .action((options: TaskIdOptions) => {
      const id = taskId(options);
      if (id === null) {
        fail(`invalid task id: ${options.id}`);
        return;
      }

      const cwd = process.cwd();
      const progress = readProgress(cwd);
      if (rejectUnlessExecuting(progress)) {
        return;
      }

      const task = findTask(progress, id);
      if (!task) {
        rejectUnknownTask(id);
        return;
      }

      if (task.status !== "pending" && task.status !== "in_progress") {
        fail(`task ${id} is ${task.status}, expected pending or in_progress`);
        return;
      }

      if (isGitRepo(cwd)) {
        const commit = findTaskCommit(cwd, id);
        if (!commit) {
          fail(`task ${id} has no commit tagged [forge task-${id}]. Run: forge commit --message "feat: <title>" --tag "forge task-${id}"`);
          return;
        }
      }

      const completedAt = nowIso();
      const progressWithDoneTask = updateTask(progress, id, (item) => ({
        ...item,
        status: "done",
        completed_at: completedAt,
      }));
      const updatedProgress = {
        ...progressWithDoneTask,
        completed_tasks: completedTasks(progressWithDoneTask),
      };
      const updatedTask = findTask(updatedProgress, id)!;
      const guards = triggeredGuards(
        readConfig(cwd),
        updatedProgress,
        updatedTask,
      );

      writeProgress(cwd, updatedProgress);

      // Maintain .forge/handoff.md as the canonical "where am I, what's next"
      // seed for compaction / SessionStart auto-resume. Writing it here
      // (after writeProgress) keeps progress.json as the source of truth and
      // handoff.md as a derived view.
      //
      // Failure must NOT block task:done — handoff.md is an optimisation; the
      // authoritative state is progress.json. We record the failure as a
      // skipped guard entry so /audit can surface it later.
      let handoffWarning: string | null = null;
      try {
        writeHandoff(cwd, updatedProgress);
      } catch (error) {
        handoffWarning = (error as Error).message.slice(0, 200);
      }

      writeJson({
        ok: true,
        task: updatedTask,
        completed_tasks: updatedProgress.completed_tasks,
        guard_triggered: guards.length > 0,
        guards,
        guard_type: guards[0]?.type ?? null,
        ...(handoffWarning ? { handoff_warning: handoffWarning } : {}),
      });

      // GitNexus incremental index after each task completion.
      // Non-blocking: failure is recorded as a skipped guard entry for audit
      // trail but does not fail the task:done command.
      if (isGitNexusInstalled()) {
        const gnResult = gitNexusUpdate(cwd);
        if (!gnResult.ok) {
          const current = readProgress(cwd);
          writeProgress(cwd, {
            ...current,
            guard_history: [
              ...current.guard_history,
              {
                id: `guard-${Date.now()}-gnx`,
                type: "gitnexus-update",
                triggered_at: nowIso(),
                status: "skipped" as const,
                notes: gnResult.stderr.slice(0, 200),
              },
            ],
          });
        }
      }
    });

  program
    .command("task:fail")
    .requiredOption("--id <id>", "task id")
    .requiredOption("--reason <text>", "failure reason")
    .action((options: TaskReasonOptions) => {
      const id = taskId(options);
      if (id === null) {
        fail(`invalid task id: ${options.id}`);
        return;
      }

      const cwd = process.cwd();
      const progress = readProgress(cwd);
      if (rejectUnlessExecuting(progress)) {
        return;
      }

      const task = findTask(progress, id);
      if (!task) {
        rejectUnknownTask(id);
        return;
      }

      if (rejectUnlessOpenTask(task)) {
        return;
      }

      const updatedProgress = updateTask(progress, id, (item) => ({
        ...item,
        status: "failed",
        failure_reason: options.reason,
      }));
      const updatedTask = findTask(updatedProgress, id)!;

      writeProgress(cwd, updatedProgress);
      writeJson({ ok: true, task: updatedTask });
    });

  program
    .command("task:defer")
    .requiredOption("--id <id>", "task id")
    .requiredOption("--reason <text>", "defer reason")
    .action((options: TaskReasonOptions) => {
      const id = taskId(options);
      if (id === null) {
        fail(`invalid task id: ${options.id}`);
        return;
      }

      const cwd = process.cwd();
      const progress = readProgress(cwd);
      if (rejectUnlessExecuting(progress)) {
        return;
      }

      const task = findTask(progress, id);
      if (!task) {
        rejectUnknownTask(id);
        return;
      }

      if (rejectUnlessOpenTask(task)) {
        return;
      }

      const updatedProgress = updateTask(progress, id, (item) => ({
        ...item,
        status: "deferred",
        defer_reason: options.reason,
      }));
      const updatedTask = findTask(updatedProgress, id)!;

      writeProgress(cwd, updatedProgress);
      writeJson({ ok: true, task: updatedTask });
    });

  // task:reset — revert an in_progress (or pending) task back to pending,
  // clearing started_at. Used by /bugfix to ensure tasks interrupted mid-flight
  // get fully re-executed on /resume rather than leaving half-complete state.
  program
    .command("task:reset")
    .requiredOption("--id <id>", "task id")
    .requiredOption("--reason <text>", "reset reason")
    .action((options: TaskReasonOptions) => {
      const id = taskId(options);
      if (id === null) {
        fail(`invalid task id: ${options.id}`);
        return;
      }

      const cwd = process.cwd();
      const progress = readProgress(cwd);
      if (rejectUnlessExecuting(progress)) {
        return;
      }

      const task = findTask(progress, id);
      if (!task) {
        rejectUnknownTask(id);
        return;
      }

      // Only in_progress or pending can be reset. Done/failed/deferred tasks
      // should not be silently revived — use explicit task:start for that path.
      if (task.status !== "in_progress" && task.status !== "pending") {
        fail(`task ${id} is ${task.status}, expected in_progress or pending`);
        return;
      }

      const updatedProgress = updateTask(progress, id, (item) => ({
        ...item,
        status: "pending",
        started_at: undefined,
        completed_at: undefined,
        reset_reason: options.reason,
      }));
      const updatedTask = findTask(updatedProgress, id)!;

      writeProgress(cwd, updatedProgress);
      writeJson({ ok: true, task: updatedTask });
    });
}
