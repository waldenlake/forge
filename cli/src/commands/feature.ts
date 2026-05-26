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
- Every task MUST follow: invoke superpowers skill → forge test → forge commit → forge task:done
- Do NOT implement code directly without invoking superpowers:subagent-driven-development
- Do NOT call task:done before tests pass
- Do NOT skip any CLI command in the sequence
- Do NOT batch multiple tasks in one cycle
- When forge CLI returns ok: false, STOP and report the error`;

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
