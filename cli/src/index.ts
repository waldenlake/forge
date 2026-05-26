#!/usr/bin/env node
import { Command, CommanderError } from "commander";
import { registerDoctorCommand } from "./commands/doctor.js";
import { registerFeatureCommand } from "./commands/feature.js";
import { registerInitCommand } from "./commands/init.js";
import { registerMigrateCommand } from "./commands/migrate.js";
import { registerPhaseCommand } from "./commands/phase.js";
import { registerPlanCommand } from "./commands/plan.js";
import { registerSchemaValidateCommand } from "./commands/schema-validate.js";
import { registerStatusCommand } from "./commands/status.js";

const VERSION = "0.2.0";

function writeJson(payload: unknown): void {
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

  registerInitCommand(program);
  registerStatusCommand(program);
  registerDoctorCommand(program);
  registerMigrateCommand(program);
  registerSchemaValidateCommand(program);
  registerFeatureCommand(program);
  registerPlanCommand(program);
  registerPhaseCommand(program);

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
