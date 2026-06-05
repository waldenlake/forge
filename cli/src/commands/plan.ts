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

/**
 * Extract tasks from a plan markdown file. Recognised heading shapes:
 *   ### Task 1: Title           ← canonical (ASCII colon)
 *   ### Task 1：Title           ← tolerated (fullwidth colon, U+FF1A)
 *   ### Task 1 - Title          ← tolerated (en/em dash, hyphen)
 *
 * The leading "### Task <N>" prefix is required. Anything that drops the
 * `### ` heading marker, the literal word `Task`, or the integer id is
 * rejected — those are too ambiguous to parse reliably.
 */
function extractTasks(markdown: string): ForgeTask[] {
  // Allow `:`, `：` (fullwidth), `-`, `–`, `—` between the id and the title.
  // Also tolerate optional leading spaces and bracketed/checkbox prefixes
  // commonly seen in tasks lists (e.g. `### Task 1: [x] Title`).
  const pattern = /^###\s+Task\s+(\d+)\s*[:：\-–—]\s*(.+?)\s*$/gm;
  return Array.from(markdown.matchAll(pattern), (match) => ({
    id: Number(match[1]),
    title: match[2].trim(),
    status: "pending" as const,
  }));
}

/**
 * Report why parsing returned zero tasks. Tries to detect common near-misses
 * (wrong heading level, missing the literal word "Task", missing id) so the
 * user can fix the plan in one edit instead of guessing the format.
 */
function diagnoseEmptyTasks(markdown: string): string {
  // Wrong heading level: `## Task 1: ...` or `#### Task 1: ...`
  if (/^#{1,2}\s+Task\s+\d+/m.test(markdown) || /^#{4,}\s+Task\s+\d+/m.test(markdown)) {
    return "found `Task <N>` headings but at the wrong level — use exactly three hashes: `### Task 1: Title`";
  }
  // Missing id: `### Task: Title`
  if (/^###\s+Task\s*[:：]/m.test(markdown)) {
    return "found `### Task:` headings without a numeric id — use `### Task 1: Title`";
  }
  // Localised wording: 任务 1: ..., 步骤 1: ...
  if (/^###\s+(任务|步骤|Step)\s+\d+/m.test(markdown)) {
    return "found localised task headings — use the literal English word `Task`: `### Task 1: Title`";
  }
  // Generic: no `### Task N` anywhere
  return [
    "no tasks found — expected one or more headings in the form:",
    "  `### Task 1: Title`",
    "  `### Task 2: Another title`",
    "Accepted separators between id and title: `:` `：` `-` `–` `—`",
  ].join("\n");
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
          error: diagnoseEmptyTasks(markdown),
          expected_format: "### Task <N>: <title>",
          plan_path: options.plan,
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
