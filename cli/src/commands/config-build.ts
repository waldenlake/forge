import type { Command } from "commander";
import { readConfig, writeConfig } from "../state/config.js";

type ConfigBuildOptions = {
  show?: boolean;
  command?: string;
  workingDir?: string;
  remove?: boolean;
};

function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function fail(error: string): void {
  process.exitCode = 1;
  writeJson({ ok: false, error });
}

export function registerConfigBuildCommand(program: Command): void {
  program
    .command("config:build")
    .description("inspect or set the project build command")
    .option("--show", "print current build config")
    .option("--command <cmd>", "build command to run (e.g. 'npm run build')")
    .option("--working-dir <dir>", "working directory for the build command (default: '.')")
    .option("--remove", "remove the configured build command (fall back to auto-detect)")
    .action((options: ConfigBuildOptions) => {
      const cwd = process.cwd();
      let config;

      try {
        config = readConfig(cwd);
      } catch (e) {
        fail(`config.json read error: ${(e as Error).message}`);
        return;
      }

      if (options.show) {
        writeJson({
          ok: true,
          build_command: config.build_command ?? null,
          source: config.build_command ? "config" : "auto-detect",
        });
        return;
      }

      if (options.remove) {
        const next = { ...config };
        delete next.build_command;
        try {
          writeConfig(cwd, next);
        } catch (e) {
          fail(`config.json write error: ${(e as Error).message}`);
          return;
        }
        writeJson({ ok: true, build_command: null, source: "auto-detect" });
        return;
      }

      if (!options.command) {
        fail("provide --command <cmd> to set the build command, --show to view, or --remove to clear");
        return;
      }

      const next = { ...config };
      next.build_command = {
        command: options.command,
        working_dir: options.workingDir ?? ".",
      };

      try {
        writeConfig(cwd, next);
      } catch (e) {
        fail(`config.json write error: ${(e as Error).message}`);
        return;
      }

      writeJson({ ok: true, build_command: next.build_command });
    });
}
