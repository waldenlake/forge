import { existsSync, readFileSync } from "node:fs";
import type { Command } from "commander";
import { readConfig } from "../state/config.js";
import {
  idleProgress,
  nowIso,
  progressPath,
  readProgress,
  writeProgress,
} from "../state/progress.js";
import {
  ensureForgeSection,
  memoryPath,
  replaceWorkflowRules,
  writeAndVerify,
} from "../state/memory.js";

type FeatureStartOptions = {
  feature: string;
  spec: string;
};

const WORKFLOW_RULES_BLOCK = `**Workflow Rules**
MANDATORY — applies until this feature is complete:
- /next loops automatically: execute all pending tasks without pausing between them
- Every task: invoke superpowers:subagent-driven-development (owns TDD, tests, and commit), then forge task:done
- Do NOT implement code directly — do NOT re-run tests or re-commit after the subagent
- Stop only when: forge returns ok:false, a guard fails, human-review fires, or all tasks complete
- When forge CLI returns ok: false, report the error exactly and stop`;

function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

export function registerFeatureCommand(program: Command): void {
  program
    .command("feature:start")
    .requiredOption("--feature <feature>", "feature name")
    .requiredOption("--spec <path>", "spec file path")
    .action((options: FeatureStartOptions) => {
      const cwd = process.cwd();

      if (existsSync(progressPath(cwd)) && readProgress(cwd).status !== "idle") {
        process.exitCode = 1;
        writeJson({
          ok: false,
          blocked_by: "active feature in progress",
        });
        return;
      }

      const timestamp = nowIso();
      const progress = {
        ...idleProgress(),
        feature: options.feature,
        status: "planning" as const,
        created_at: timestamp,
        updated_at: timestamp,
        spec_path: options.spec,
      };

      writeProgress(cwd, progress);

      try {
        const config = readConfig(cwd);
        const file = memoryPath(cwd, config);
        const raw = existsSync(file) ? readFileSync(file, "utf8") : "";
        const withForge = ensureForgeSection(raw);
        const updated = replaceWorkflowRules(withForge, WORKFLOW_RULES_BLOCK);
        writeAndVerify(file, updated, "**Workflow Rules**");
      } catch {
        // Non-fatal
      }

      writeJson({
        ok: true,
        feature: options.feature,
        status: "planning",
        spec_path: options.spec,
      });
    });
}
