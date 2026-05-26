import { readFileSync } from "node:fs";
import type { Command } from "commander";
import { migrateConfig1To2 } from "../migrations/config-1-to-2.js";
import { configPath, writeConfig } from "../state/config.js";

function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

export function registerMigrateCommand(program: Command): void {
  program
    .command("migrate")
    .requiredOption("--from <version>", "source config version")
    .requiredOption("--to <version>", "target config version")
    .action((options: { from: string; to: string }) => {
      if (options.from !== "1.0" || options.to !== "2.0") {
        process.exitCode = 1;
        writeJson({
          ok: false,
          error: `Unsupported migration ${options.from} -> ${options.to}`,
        });
        return;
      }

      const cwd = process.cwd();
      const rawConfig = JSON.parse(readFileSync(configPath(cwd), "utf8"));
      const nextConfig = migrateConfig1To2(cwd, rawConfig);
      writeConfig(cwd, nextConfig);

      writeJson({
        ok: true,
        from: "1.0",
        to: "2.0",
      });
    });
}
