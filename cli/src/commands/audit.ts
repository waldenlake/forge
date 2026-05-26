import { existsSync } from "node:fs";
import type { Command } from "commander";
import { findTaskCommit, isGitRepo } from "../lib/git.js";
import { progressPath, readProgress } from "../state/progress.js";

function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function fail(error: string): void {
  process.exitCode = 1;
  writeJson({ ok: false, error });
}

export function registerAuditCommand(program: Command): void {
  program.command("audit").action(() => {
    const cwd = process.cwd();

    if (!existsSync(progressPath(cwd))) {
      writeJson({
        ok: true,
        progress: null,
        phase: null,
        done_tasks: [],
        inconsistencies: [],
      });
      return;
    }

    if (!isGitRepo(cwd)) {
      fail("not a git repository");
      return;
    }

    const progress = readProgress(cwd);
    const doneTasks = progress.tasks
      .filter((task) => task.status === "done")
      .map((task) => {
        const commit = findTaskCommit(cwd, task.id);

        return {
          id: task.id,
          title: task.title,
          status: task.status,
          commit: commit
            ? { found: true, ...commit }
            : { found: false },
        };
      });
    const missingCommitInconsistencies = doneTasks
      .filter((task) => !task.commit.found)
      .map((task) => ({
        type: "missing_commit",
        task_id: task.id,
        message: "done task has no matching forge task commit",
      }));
    const guardInconsistencies = progress.guard_history
      .filter((guard) => guard.status === "failed" || guard.status === "skipped")
      .map((guard) => ({
        type: guard.status === "failed" ? "guard_failed" : "guard_skipped",
        guard_id: guard.id,
        guard_type: guard.type,
        status: guard.status,
        ...(guard.notes ? { notes: guard.notes } : {}),
      }));

    writeJson({
      ok: true,
      progress: {
        status: progress.status,
        feature: progress.feature,
        total_tasks: progress.total_tasks,
        completed_tasks: progress.completed_tasks,
      },
      phase: {
        status: progress.status,
        feature: progress.feature,
        done_tasks: doneTasks.length,
        total_tasks: progress.total_tasks,
        pending_tasks: progress.tasks.filter((task) => task.status === "pending")
          .length,
        in_progress_tasks: progress.tasks.filter(
          (task) => task.status === "in_progress",
        ).length,
        failed_tasks: progress.tasks.filter((task) => task.status === "failed")
          .length,
        deferred_tasks: progress.tasks.filter(
          (task) => task.status === "deferred",
        ).length,
      },
      done_tasks: doneTasks,
      inconsistencies: [
        ...missingCommitInconsistencies,
        ...guardInconsistencies,
      ],
    });
  });
}
