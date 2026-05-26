import type { Command } from "commander";
import { readConfig } from "../state/config.js";

type GstackOptions = {
  type: string;
};

function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

export function registerGstackCommand(program: Command): void {
  program
    .command("test:gstack")
    .requiredOption("--type <type>", "gstack test type")
    .action((options: GstackOptions) => {
      const config = readConfig(process.cwd());

      process.exitCode = 1;
      if (config.gstack_installed !== true) {
        writeJson({
          ok: false,
          unavailable: true,
          type: options.type,
          message: "gstack is not installed or not enabled in config.json",
        });
        return;
      }

      writeJson({
        ok: false,
        unsupported: true,
        type: options.type,
        message: "gstack interface exists; execution is not implemented in v2 core runtime",
      });
    });
}
