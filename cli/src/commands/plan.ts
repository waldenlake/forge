import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Command } from "commander";
import {
  type ForgeTask,
  nowIso,
  readProgress,
  writeProgress,
} from "../state/progress.js";

type PlanRegisterOptions = {
  plan: string;
};

function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function extractTasks(markdown: string): ForgeTask[] {
  return Array.from(
    markdown.matchAll(/^### Task\s+(\d+):\s+(.+)$/gm),
    (match) => ({
      id: Number(match[1]),
      title: match[2].trim(),
      status: "pending" as const,
    }),
  );
}

export function registerPlanCommand(program: Command): void {
  program
    .command("plan:register")
    .requiredOption("--plan <path>", "plan markdown path")
    .action((options: PlanRegisterOptions) => {
      const cwd = process.cwd();
      const progress = readProgress(cwd);

      if (progress.status !== "planning") {
        process.exitCode = 1;
        writeJson({
          ok: false,
          from: progress.status,
          blocked_by: "status is not planning",
        });
        return;
      }

      const markdown = readFileSync(resolve(cwd, options.plan), "utf8");
      const tasks = extractTasks(markdown);

      if (tasks.length === 0) {
        process.exitCode = 1;
        writeJson({
          ok: false,
          error: "no tasks found",
        });
        return;
      }

      writeProgress(cwd, {
        ...progress,
        plan_path: options.plan,
        total_tasks: tasks.length,
        completed_tasks: 0,
        tasks,
        updated_at: nowIso(),
      });

      writeJson({
        ok: true,
        plan_path: options.plan,
        tasks_extracted: tasks.length,
        tasks,
      });
    });
}
