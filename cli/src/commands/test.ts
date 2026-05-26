import type { Command } from "commander";
import { runShellCommand, type ShellCommandResult } from "../lib/runner.js";
import { readConfig, type ForgeConfig, type TestProfile } from "../state/config.js";

type TestCommandOptions = {
  profile?: string;
  allProfiles?: boolean;
  coverage?: boolean;
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

      if (!result.ok) {
        process.exitCode = 1;
      }
      writeJson(result);
    });
}
