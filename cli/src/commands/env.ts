/**
 * `forge env` — print a unified environment detection snapshot.
 *
 * Pure read-only, no side effects, idempotent. Intended to be called at the
 * start of an AI agent session to establish platform, model, context budget,
 * and tool availability before any task work begins.
 *
 * Design doc: docs/environment-report.md
 */

import type { Command } from "commander";
import {
  formatEnvironmentReport,
  generateEnvironmentReport,
} from "../lib/environment-report.js";

type EnvCommandOptions = {
  monorepo?: boolean;
  platform?: string;
  session?: string;
  json?: boolean;
};

export function registerEnvCommand(program: Command): void {
  program
    .command("env")
    .description(
      "print a unified environment snapshot: platform, model, context usage, tool availability",
    )
    .option("--monorepo", "scan workspace dirs for monorepo test profiles")
    .option("--platform <name>", "override platform auto-detection")
    .option("--session <id>", "explicit session id for context reader")
    .option("--json", "output the full machine-readable JSON report")
    .action((options: EnvCommandOptions) => {
      const cwd = process.cwd();
      const report = generateEnvironmentReport(cwd, {
        monorepo: options.monorepo,
        platformOverride: options.platform,
        sessionId: options.session,
      });

      if (!report.ok) {
        process.exitCode = 1;
      }

      if (options.json) {
        process.stdout.write(`${JSON.stringify(report)}\n`);
      } else {
        process.stdout.write(formatEnvironmentReport(report));
      }
    });
}
