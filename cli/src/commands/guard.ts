import type { Command } from "commander";
import { triggeredGuards } from "../lib/guard.js";
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

      process.exitCode = 1;
      writeJson({
        ok: false,
        unsupported: true,
        feature: options.type,
        task_id: id,
        message: `${options.type} interface exists; scanner implementation is not part of v2 core runtime`,
      });
    });

  program.command("guard:coverage-check").action(() => {
    process.exitCode = 1;
    writeJson({
      ok: false,
      unsupported: true,
      feature: "coverage-check",
      message: "coverage parser is not configured or implemented in v2 core runtime",
    });
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
