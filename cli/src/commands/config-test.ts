import type { Command } from "commander";
import { readConfig, writeConfig, type TestProfile } from "../state/config.js";

type ConfigTestOptions = {
  show?: boolean;
  add?: string;
  remove?: string;
  framework?: string;
  command?: string;
  workingDir?: string;
  coverageCommand?: string;
};

function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function fail(error: string): void {
  process.exitCode = 1;
  writeJson({ ok: false, error });
}

export function registerConfigTestCommand(program: Command): void {
  program
    .command("config:test")
    .description("inspect or modify test profile configuration")
    .option("--show", "print all test profiles")
    .option("--add <name>", "add or update a test profile")
    .option("--remove <name>", "remove a test profile")
    .option("--framework <name>", "test framework (e.g. vitest, jest, pytest)")
    .option("--command <cmd>", "test command (e.g. 'npm test')")
    .option("--working-dir <dir>", "working directory (default: '.')")
    .option("--coverage-command <cmd>", "coverage command (e.g. 'npm run test:cov')")
    .action((options: ConfigTestOptions) => {
      const cwd = process.cwd();
      let config;

      try {
        config = readConfig(cwd);
      } catch (e) {
        fail(`config.json read error: ${(e as Error).message}`);
        return;
      }

      if (options.show) {
        writeJson({ ok: true, test_profiles: config.test_profiles });
        return;
      }

      if (options.remove) {
        const name = options.remove;
        if (!config.test_profiles[name]) {
          fail(`test profile not found: ${name}`);
          return;
        }
        if (Object.keys(config.test_profiles).length <= 1) {
          fail("cannot remove the last test profile — at least one is required");
          return;
        }
        const next = { ...config, test_profiles: { ...config.test_profiles } };
        delete next.test_profiles[name];
        try {
          writeConfig(cwd, next);
        } catch (e) {
          fail(`config.json write error: ${(e as Error).message}`);
          return;
        }
        writeJson({ ok: true, removed: name, test_profiles: next.test_profiles });
        return;
      }

      if (options.add) {
        const name = options.add;
        if (!options.framework) {
          fail("--framework is required when adding a test profile");
          return;
        }
        if (!options.command) {
          fail("--command is required when adding a test profile");
          return;
        }

        const profile: TestProfile = {
          framework: options.framework,
          command: options.command,
          working_dir: options.workingDir ?? ".",
        };
        if (options.coverageCommand) {
          profile.coverage_command = options.coverageCommand;
        }

        const next = {
          ...config,
          test_profiles: { ...config.test_profiles, [name]: profile },
        };

        try {
          writeConfig(cwd, next);
        } catch (e) {
          fail(`config.json write error: ${(e as Error).message}`);
          return;
        }
        writeJson({ ok: true, profile: name, test_profiles: next.test_profiles });
        return;
      }

      fail("provide --show, --add <name>, or --remove <name>");
    });
}
