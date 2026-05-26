import { existsSync, readFileSync } from "node:fs";
import type { Command } from "commander";
import { readConfig } from "../state/config.js";
import {
  appendCompletedFeature,
  ensureForgeSection,
  memoryPath,
  replaceCurrentFeature,
  writeAndVerify,
} from "../state/memory.js";

type SetFeatureOptions = {
  feature: string;
  progress: string;
  nextTaskId: string;
  nextTaskTitle: string;
};

type CompleteFeatureOptions = {
  feature: string;
  date: string;
  tasks: string;
  deferred: string;
  spec: string;
  plan: string;
  scenarios: string;
};

function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function memoryContent(file: string): string {
  if (!existsSync(file)) {
    return "";
  }

  return readFileSync(file, "utf8");
}

function writeVerificationFailure(file: string): void {
  process.exitCode = 1;
  writeJson({
    ok: false,
    verified: false,
    memory_file: file,
  });
}

function writeVerificationSuccess(file: string): void {
  writeJson({
    ok: true,
    verified: true,
    memory_file: file,
  });
}

function currentFeatureBlock(options: SetFeatureOptions): string {
  return [
    "**Current Feature**",
    `- Feature: ${options.feature}`,
    `- Progress: ${options.progress}`,
    `- Next Task: ${options.nextTaskId} - ${options.nextTaskTitle}`,
  ].join("\n");
}

function completedFeatureEntry(options: CompleteFeatureOptions): string {
  return [
    `- ${options.feature} (${options.date})`,
    `  - Tasks: ${options.tasks}`,
    `  - Deferred: ${options.deferred}`,
    `  - Spec: ${options.spec}`,
    `  - Plan: ${options.plan}`,
    `  - Scenarios: ${options.scenarios}`,
  ].join("\n");
}

export function registerMemoryCommand(program: Command): void {
  program
    .command("memory:set-feature")
    .requiredOption("--feature <feature>", "feature name")
    .requiredOption("--progress <progress>", "feature progress")
    .requiredOption("--next-task-id <id>", "next task id")
    .requiredOption("--next-task-title <title>", "next task title")
    .action((options: SetFeatureOptions) => {
      const cwd = process.cwd();
      const file = memoryPath(cwd, readConfig(cwd));
      const content = ensureForgeSection(memoryContent(file));
      const updated = replaceCurrentFeature(content, currentFeatureBlock(options));
      const verified = writeAndVerify(file, updated, "**Current Feature**");

      if (!verified) {
        writeVerificationFailure(file);
        return;
      }

      writeVerificationSuccess(file);
    });

  program
    .command("memory:complete-feature")
    .requiredOption("--feature <feature>", "feature name")
    .requiredOption("--date <date>", "completion date")
    .requiredOption("--tasks <tasks>", "completed task summary")
    .requiredOption("--deferred <deferred>", "deferred task summary")
    .requiredOption("--spec <spec>", "spec path")
    .requiredOption("--plan <plan>", "plan path")
    .requiredOption("--scenarios <scenarios>", "verified scenarios")
    .action((options: CompleteFeatureOptions) => {
      const cwd = process.cwd();
      const file = memoryPath(cwd, readConfig(cwd));
      const content = ensureForgeSection(memoryContent(file));
      const entry = completedFeatureEntry(options);
      const updated = appendCompletedFeature(content, entry);
      const verified = writeAndVerify(file, updated, entry);

      if (!verified) {
        writeVerificationFailure(file);
        return;
      }

      writeVerificationSuccess(file);
    });
}
