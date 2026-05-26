import { existsSync } from "node:fs";
import type { Command } from "commander";
import {
  idleProgress,
  nowIso,
  progressPath,
  readProgress,
  writeProgress,
} from "../state/progress.js";

type FeatureStartOptions = {
  feature: string;
  spec: string;
};

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
      writeJson({
        ok: true,
        feature: options.feature,
        status: "planning",
        spec_path: options.spec,
      });
    });
}
