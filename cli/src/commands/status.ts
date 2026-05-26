import { existsSync, readFileSync } from "node:fs";
import type { Command } from "commander";
import { configPath, readConfig } from "../state/config.js";
import { idleProgress, progressPath, readProgress } from "../state/progress.js";

function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function readRawConfigVersion(cwd: string): string | null {
  const raw = JSON.parse(readFileSync(configPath(cwd), "utf8")) as {
    version?: unknown;
  };

  return typeof raw.version === "string" ? raw.version : null;
}

function currentStatus(cwd: string): ReturnType<typeof idleProgress> {
  if (!existsSync(progressPath(cwd))) {
    return idleProgress();
  }

  return readProgress(cwd);
}

function safeStatus(cwd: string): string {
  try {
    return currentStatus(cwd).status;
  } catch {
    return "idle";
  }
}

export function registerStatusCommand(program: Command): void {
  program.command("status").action(() => {
    const cwd = process.cwd();

    if (!existsSync(configPath(cwd))) {
      const progress = currentStatus(cwd);
      writeJson({
        ok: true,
        migration_required: false,
        config: null,
        status: progress.status,
        progress,
      });
      return;
    }

    const configVersion = readRawConfigVersion(cwd);
    if (configVersion !== "2.0") {
      writeJson({
        ok: true,
        migration_required: true,
        config_version: configVersion,
        status: safeStatus(cwd),
      });
      return;
    }

    const progress = currentStatus(cwd);
    const config = readConfig(cwd);
    writeJson({
      ok: true,
      migration_required: false,
      config: {
        version: config.version,
        memory_file: config.memory_file,
        project_type: config.project_type,
        test_profiles: config.test_profiles,
      },
      status: progress.status,
      progress: {
        feature: progress.feature,
        total_tasks: progress.total_tasks,
        completed_tasks: progress.completed_tasks,
        verification: progress.verification,
      },
    });
  });
}
