import type { Command } from "commander";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { runShellCommand, type ShellCommandResult } from "../lib/runner.js";
import { readConfig, type ForgeConfig, type TestProfile } from "../state/config.js";
import {
  parseTestCounts,
  parseFailures,
} from "../lib/test-parsers/index.js";
import { safeIsoForFilename, writeReportFile } from "../lib/reports.js";

type TestCommandOptions = {
  profile?: string;
  allProfiles?: boolean;
  coverage?: boolean;
  summarize?: boolean;
};

export type TestProfileResult = ShellCommandResult & {
  name: string;
  framework: string;
};

export type TestRunResult = {
  ok: boolean;
  profiles: TestProfileResult[];
  passed: string[];
  failed: string[];
  duration_ms: number;
};

export type TestFailureEntry = {
  profile: string;
  test: string;
  error: string;
};

export type TestSummarizeResult = {
  ok: boolean;
  passed: number;
  failed: number;
  skipped: number;
  duration_ms: number;
  failures: TestFailureEntry[];
  report_path: string;
};

function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function fail(error: string): void {
  process.exitCode = 1;
  writeJson({ ok: false, error });
}

function commandFor(profile: TestProfile, coverage: boolean): string {
  if (coverage && profile.coverage_command) {
    return profile.coverage_command;
  }

  return profile.command;
}

function writeReportLog(
  cwd: string,
  profiles: TestProfileResult[],
): string {
  const filename = `test-${safeIsoForFilename()}.log`;

  const sections = profiles.map((p) => {
    const header = `=== Profile: ${p.name} (${p.framework}) ===\n`;
    const cmdLine = `$ ${p.command}\n`;
    const stdoutSection = p.stdout ? `--- stdout ---\n${p.stdout}\n` : "";
    const stderrSection = p.stderr ? `--- stderr ---\n${p.stderr}\n` : "";
    return header + cmdLine + stdoutSection + stderrSection;
  });

  return writeReportFile(cwd, filename, sections.join("\n"));
}

function buildSummarizeResult(
  result: TestRunResult,
  reportPath: string,
): TestSummarizeResult {
  let totalPassed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  const allFailures: TestFailureEntry[] = [];

  for (const profile of result.profiles) {
    const combined = profile.stdout + "\n" + profile.stderr;
    const counts = parseTestCounts(combined);
    totalPassed += counts.passed;
    totalFailed += counts.failed;
    totalSkipped += counts.skipped;

    if (!profile.ok && allFailures.length < 5) {
      const failures = parseFailures(combined);
      for (const f of failures) {
        if (allFailures.length >= 5) break;
        allFailures.push({
          profile: profile.name,
          test: f.test,
          error: f.error,
        });
      }
    }
  }

  return {
    ok: result.ok,
    passed: totalPassed,
    failed: totalFailed,
    skipped: totalSkipped,
    duration_ms: result.duration_ms,
    failures: allFailures,
    report_path: reportPath,
  };
}

function selectedProfileNames(
  config: ForgeConfig,
  options: TestCommandOptions,
): string[] | null {
  if (options.profile && options.allProfiles) {
    return null;
  }

  if (options.allProfiles) {
    return Object.keys(config.test_profiles);
  }

  return [options.profile ?? "default"];
}

export function unknownProfile(
  config: ForgeConfig,
  profileNames: string[],
): string | null {
  return profileNames.find((name) => !config.test_profiles[name]) ?? null;
}

export function runTestProfiles(
  root: string,
  config: ForgeConfig,
  options: { profileNames: string[]; coverage: boolean },
): TestRunResult {
  const startedAt = Date.now();
  const profiles = options.profileNames.map((name) => {
    const profile = config.test_profiles[name]!;
    const result = runShellCommand(
      root,
      profile.working_dir,
      commandFor(profile, options.coverage),
    );

    return {
      name,
      framework: profile.framework,
      ...result,
    };
  });
  const passed = profiles.filter((profile) => profile.ok).map((profile) => profile.name);
  const failed = profiles
    .filter((profile) => !profile.ok)
    .map((profile) => profile.name);

  return {
    ok: failed.length === 0,
    profiles,
    passed,
    failed,
    duration_ms: Date.now() - startedAt,
  };
}

export function registerTestCommand(program: Command): void {
  program
    .command("test")
    .option("--profile <name>", "test profile to run")
    .option("--all-profiles", "run all configured test profiles")
    .option("--coverage", "run coverage command when configured")
    .option("--summarize", "write full output to report file, return JSON summary")
    .action((options: TestCommandOptions) => {
      const cwd = process.cwd();
      const config = readConfig(cwd);
      const profileNames = selectedProfileNames(config, options);

      if (!profileNames) {
        fail("choose --profile or --all-profiles, not both");
        return;
      }

      const missingProfile = unknownProfile(config, profileNames);
      if (missingProfile) {
        fail(`unknown test profile: ${missingProfile}`);
        return;
      }

      const result = runTestProfiles(cwd, config, {
        profileNames,
        coverage: options.coverage ?? false,
      });

      if (options.summarize) {
        const reportPath = writeReportLog(cwd, result.profiles);
        const summary = buildSummarizeResult(result, reportPath);

        if (!result.ok) {
          process.exitCode = 1;
        }
        writeJson(summary);
        return;
      }

      const marker = { ok: result.ok, at: new Date().toISOString(), passed: result.passed, failed: result.failed };
      writeFileSync(join(cwd, ".forge", "last-test.json"), JSON.stringify(marker), "utf8");

      if (!result.ok) {
        process.exitCode = 1;
      }
      writeJson(result);
    });
}
