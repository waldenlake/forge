import type { Command } from "commander";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { runShellCommand, type ShellCommandResult } from "../lib/runner.js";
import { readConfig, type ForgeConfig } from "../state/config.js";
import {
  type ForgeProgress,
  nowIso,
  readProgress,
  writeProgress,
} from "../state/progress.js";
import {
  runTestProfiles,
  unknownProfile,
  type TestRunResult,
} from "./test.js";

type VerifyCommandOptions = {
  coverage?: boolean;
};

type BuildCommand = {
  command: string;
  working_dir: string;
};

type VerificationReport = {
  ok: boolean;
  status: "passed" | "failed";
  tests: TestRunResult;
  build: ShellCommandResult | null;
  report_path: string;
  duration_ms: number;
};

function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function packageBuildCommand(root: string): BuildCommand | null {
  const packageJsonPath = join(root, "package.json");
  if (!existsSync(packageJsonPath)) {
    return null;
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
    scripts?: Record<string, unknown>;
  };

  if (typeof packageJson.scripts?.build === "string") {
    return { command: "npm run build", working_dir: "." };
  }

  return null;
}

function detectBuildCommand(root: string): BuildCommand | null {
  const npmBuild = packageBuildCommand(root);
  if (npmBuild) {
    return npmBuild;
  }

  if (existsSync(join(root, "go.mod"))) {
    return { command: "go build ./...", working_dir: "." };
  }

  if (existsSync(join(root, "Cargo.toml"))) {
    return { command: "cargo build", working_dir: "." };
  }

  return null;
}

function reportTimestamp(value: string): string {
  return value.replace(/[:.]/g, "-");
}

function verificationProgress(
  progress: ForgeProgress,
  config: ForgeConfig,
  status: ForgeProgress["verification"]["status"],
  update: Partial<ForgeProgress["verification"]> = {},
): ForgeProgress {
  return {
    ...progress,
    updated_at: nowIso(),
    verification: {
      ...progress.verification,
      test_mode: config.test_mode,
      status,
      ...update,
    },
  };
}

export function registerVerifyCommand(program: Command): void {
  program
    .command("verify")
    .option("--coverage", "run coverage command when configured")
    .action((options: VerifyCommandOptions) => {
      const cwd = process.cwd();
      const startedAt = Date.now();
      const config = readConfig(cwd);
      const progress = readProgress(cwd);
      const profileNames = ["default"];
      const missingProfile = unknownProfile(config, profileNames);

      if (missingProfile) {
        process.exitCode = 1;
        writeJson({ ok: false, error: `unknown test profile: ${missingProfile}` });
        return;
      }

      writeProgress(
        cwd,
        verificationProgress(progress, config, "in_progress", {
          last_run: null,
          report_path: null,
        }),
      );

      const tests = runTestProfiles(cwd, config, {
        profileNames,
        coverage: options.coverage ?? false,
      });
      const buildCommand = tests.ok ? detectBuildCommand(cwd) : null;
      const build = buildCommand
        ? runShellCommand(cwd, buildCommand.working_dir, buildCommand.command)
        : null;
      const passed = tests.ok && (build?.ok ?? true);
      const status = passed ? "passed" : "failed";
      const lastRun = nowIso();
      const reportPath = `.forge/verification-${reportTimestamp(lastRun)}.json`;
      const report: VerificationReport = {
        ok: passed,
        status,
        tests,
        build,
        report_path: reportPath,
        duration_ms: Date.now() - startedAt,
      };

      mkdirSync(dirname(join(cwd, reportPath)), { recursive: true });
      writeFileSync(
        join(cwd, reportPath),
        `${JSON.stringify(report, null, 2)}\n`,
        "utf8",
      );
      writeProgress(
        cwd,
        verificationProgress(readProgress(cwd), config, status, {
          last_run: lastRun,
          report_path: reportPath,
        }),
      );

      if (!passed) {
        process.exitCode = 1;
      }
      writeJson(report);
    });
}
