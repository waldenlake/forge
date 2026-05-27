import type { ForgeConfig } from "../state/config.js";
import type { ForgeProgress, ForgeTask } from "../state/progress.js";

export type TriggeredGuard = {
  type: string;
  actions: string[];
  task_range?: [number, number];
};

function matchesKeyword(task: ForgeTask, keywords: string[] | undefined): boolean {
  if (!keywords || keywords.length === 0) {
    return false;
  }

  const haystack = [task.title, ...(task.tags ?? [])].join(" ").toLowerCase();

  return keywords.some((keyword) =>
    haystack.includes(keyword.toLowerCase()),
  );
}

function completedTaskRange(progress: ForgeProgress, type: string): [number, number] | undefined {
  const completedIds = progress.tasks
    .filter((item) => item.status === "done")
    .map((item) => item.id)
    .sort((left, right) => left - right);

  if (completedIds.length === 0) {
    return undefined;
  }

  const lastBatchGuard = [...progress.guard_history]
    .reverse()
    .find((guard) => guard.type === type && guard.task_range);
  const lastEnd = lastBatchGuard?.task_range?.[1] ?? 0;
  const idsSinceLastGuard = completedIds.filter((id) => id > lastEnd);

  if (idsSinceLastGuard.length === 0) {
    return undefined;
  }

  return [idsSinceLastGuard[0], idsSinceLastGuard[idsSinceLastGuard.length - 1]];
}

export function triggeredGuards(
  config: ForgeConfig,
  progress: ForgeProgress,
  task: ForgeTask,
): TriggeredGuard[] {
  const guards: TriggeredGuard[] = [];

  for (const [type, guard] of Object.entries(config.guards)) {
    if (!guard.enabled) {
      continue;
    }

    const { trigger } = guard;

    // These triggers fire outside task:done (git diff, phase completion)
    if (trigger === "new-dependency" || trigger === "phase-complete") {
      continue;
    }

    let triggered = false;
    let taskRange: [number, number] | undefined;

    if (trigger === "keyword") {
      triggered = matchesKeyword(task, guard.keywords);
    } else if (trigger === "manual") {
      triggered = task.requires_human_review === true;
    } else {
      // Batch-style: trigger every N completed tasks.
      // Applies when every_n_tasks is set or trigger is not specified.
      const every = guard.every_n_tasks ?? 6;
      triggered =
        progress.completed_tasks > 0 && progress.completed_tasks % every === 0;
      if (triggered) {
        taskRange = completedTaskRange(progress, type);
        if (!taskRange) {
          triggered = false;
        }
      }
    }

    if (!triggered) {
      continue;
    }

    guards.push({
      type,
      actions: guard.actions,
      ...(taskRange ? { task_range: taskRange } : {}),
    });
  }

  return guards;
}
