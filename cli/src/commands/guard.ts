import type { Command } from "commander";
import { nowIso, readProgress, writeProgress } from "../state/progress.js";

type GuardRecordOptions = {
  type: string;
  status: string;
  tasks: string;
  notes?: string;
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

export function registerGuardCommand(program: Command): void {
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
