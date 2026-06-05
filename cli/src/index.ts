#!/usr/bin/env node
import { Command, CommanderError } from "commander";
import { registerAuditCommand } from "./commands/audit.js";
import { registerCommitCommand } from "./commands/commit.js";
import { registerConfigBuildCommand } from "./commands/config-build.js";
import { registerConfigContextCommand } from "./commands/config-context.js";
import { registerConfigTestCommand } from "./commands/config-test.js";
import { registerConfigVerifyCommand } from "./commands/config-verify.js";
import { registerContextCommand } from "./commands/context.js";
import { registerDoctorCommand } from "./commands/doctor.js";
import { registerFeatureCommand } from "./commands/feature.js";
import { registerGuardCommand } from "./commands/guard.js";
import { registerHandoffCommand } from "./commands/handoff.js";
import { registerInitCommand } from "./commands/init.js";
import { registerMemoryCommand } from "./commands/memory.js";
import { registerMigrateCommand } from "./commands/migrate.js";
import { registerNextActionCommand } from "./commands/next-action.js";
import { registerPhaseCommand } from "./commands/phase.js";
import { registerPlanCommand } from "./commands/plan.js";
import { registerResetCommand } from "./commands/reset.js";
import { registerRunLoopCommand } from "./commands/run-loop.js";
import { registerSchemaValidateCommand } from "./commands/schema-validate.js";
import { registerScenariosCommand } from "./commands/scenarios.js";
import { registerStatusCommand } from "./commands/status.js";
import { registerTaskCommand } from "./commands/task.js";
import { registerTestCommand } from "./commands/test.js";
import { registerVerifyCommand } from "./commands/verify.js";
import { initLogger, getLogger } from "./lib/logger.js";
import { FORGE_CLI_VERSION } from "./lib/version.js";

const VERSION = FORGE_CLI_VERSION;

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
    .option("--log-file <path>", "write structured JSONL log to file")
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
  registerTaskCommand(program);
  registerGuardCommand(program);
  registerHandoffCommand(program);
  registerScenariosCommand(program);
  registerTestCommand(program);
  registerVerifyCommand(program);
  registerConfigVerifyCommand(program);
  registerConfigBuildCommand(program);
  registerConfigContextCommand(program);
  registerConfigTestCommand(program);
  registerContextCommand(program);
  registerCommitCommand(program);
  registerAuditCommand(program);
  registerResetCommand(program);
  registerMemoryCommand(program);
  registerNextActionCommand(program);
  registerRunLoopCommand(program);

  program.hook("preAction", (_thisCommand, actionCommand) => {
    const opts = program.opts<{ logFile?: string }>();
    const logger = initLogger(opts.logFile ?? null);
    logger.log({ cmd: actionCommand.name(), event: "start", args: actionCommand.args });
  });

  program.hook("postAction", (_thisCommand, actionCommand) => {
    const logger = getLogger();
    logger.log({ cmd: actionCommand.name(), event: "result", exitCode: process.exitCode ?? 0 });
  });

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
