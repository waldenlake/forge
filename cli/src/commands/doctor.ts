import type { Command } from "commander";
import {
  formatEnvironmentReport,
  generateEnvironmentReport,
} from "../lib/environment-report.js";

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .option("--monorepo", "scan workspace dirs for monorepo test profiles")
    .option("--platform <name>", "override platform auto-detection")
    .option("--session <id>", "explicit session id for context reader")
    .option("--json", "output the full machine-readable JSON report")
    .action((options: { monorepo?: boolean; platform?: string; session?: string; json?: boolean }) => {
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
