import { existsSync } from "node:fs";
import type { Command } from "commander";
import type { ForgeConfig } from "../state/config.js";
import { configPath, readConfig } from "../state/config.js";
import type { ForgeProgress, ForgeTask } from "../state/progress.js";
import { idleProgress, progressPath, readProgress } from "../state/progress.js";
import { readProgressLoose, readRawConfigVersion } from "../state/looseRead.js";
import { triggeredGuards } from "../lib/guard.js";

type GuardPreview = {
  due_at_task: number;
  tasks_until_guard: number;
  next_guard_type: string;
  preview: {
    security_scan_will_trigger: boolean;
  };
};

function buildGuardPreview(
  config: ForgeConfig,
  progress: ForgeProgress,
): GuardPreview | undefined {
  const nextTask = progress.tasks.find((t) => t.status === "pending");
  if (!nextTask) {
    return undefined;
  }

  const every = config.guards["batch-review"]?.every_n_tasks ?? 6;
  const remainder = progress.completed_tasks % every;
  const tasksUntilBatch = remainder === 0 ? every : every - remainder;
  const dueAtTask = progress.completed_tasks + tasksUntilBatch;

  const securityKeywords = config.guards["security-scan"]?.keywords ?? [];
  const haystack = nextTask.title.toLowerCase();
  const securityWillTrigger = securityKeywords.some((kw) =>
    haystack.includes(kw.toLowerCase()),
  );

  // Simulate next-task completion: mark the task done in the tasks array AND
  // bump completed_tasks. Both must be consistent for triggeredGuards to compute
  // a correct task_range from completed task ids. (BUG-C02)
  const simulatedTask: ForgeTask = {
    ...nextTask,
    status: "done",
  };
  const simulatedTasks = progress.tasks.map((t) =>
    t.id === nextTask.id ? simulatedTask : t,
  );
  const simulatedProgress: ForgeProgress = {
    ...progress,
    completed_tasks: progress.completed_tasks + 1,
    tasks: simulatedTasks,
  };
  const triggered = triggeredGuards(config, simulatedProgress, simulatedTask);
  const nextGuardType =
    triggered.length > 0 ? triggered[0].type : "batch-review";

  return {
    due_at_task: dueAtTask,
    tasks_until_guard: tasksUntilBatch,
    next_guard_type: nextGuardType,
    preview: {
      security_scan_will_trigger: securityWillTrigger,
    },
  };
}

function deferredTaskCount(progress: ForgeProgress): number {
  return progress.tasks.filter((t) => t.status === "deferred").length;
}

function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
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

    const progressResult = readProgressLoose(cwd);
    const config = readConfig(cwd);
    if (!progressResult.ok) {
      // Stale progress.json from a previous forge version (typically containing
      // status "verification_complete" or "bugfix"). Surface it explicitly
      // instead of crashing so the user can recover via `forge reset --backup`.
      writeJson({
        ok: false,
        migration_required: false,
        config: { version: config.version },
        status: progressResult.raw_status,
        stale_progress: true,
        error: progressResult.error,
        recovery: "forge reset --backup",
      });
      process.exitCode = 1;
      return;
    }

    const progress = progressResult.progress;
    const guard =
      progress.status === "executing"
        ? buildGuardPreview(config, progress)
        : undefined;
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
        spec_path: progress.spec_path,
        plan_path: progress.plan_path,
        total_tasks: progress.total_tasks,
        completed_tasks: progress.completed_tasks,
        deferred_tasks: deferredTaskCount(progress),
        verification: progress.verification,
      },
      ...(guard !== undefined ? { guard } : {}),
    });
  });
}
