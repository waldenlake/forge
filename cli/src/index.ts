#!/usr/bin/env node
import { Command, CommanderError } from "commander";
import { registerSchemaValidateCommand } from "./commands/schema-validate.js";
import type { CliJson } from "./types.js";

const VERSION = "0.2.0";

function writeJson(payload: CliJson): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return "Unknown CLI error";
}

async function main(argv: string[]): Promise<void> {
  const program = new Command();

  program
    .name("forge")
    .version(VERSION)
    .exitOverride()
    .configureOutput({
      writeOut: (value) => process.stdout.write(value),
      writeErr: () => undefined,
    })
    .option("--version-json", "print machine-readable version compatibility JSON")
    .action(() => {
      const options = program.opts<{ versionJson?: boolean }>();
      if (options.versionJson) {
        writeJson({
          ok: true,
          version: VERSION,
          compatible: true,
        });
        return;
      }

      program.help();
    });

  registerSchemaValidateCommand(program);

  await program.parseAsync(argv);
}

main(process.argv).catch((error: unknown) => {
  if (error instanceof CommanderError && error.exitCode === 0) {
    return;
  }

  process.exitCode = 1;
  writeJson({
    ok: false,
    error: errorMessage(error),
  });
});
