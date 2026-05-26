import type { ForgeConfig } from "../state/config.js";
import type { ForgeProgress, ForgeTask } from "../state/progress.js";

export type TriggeredGuard = {
  type: string;
  actions: string[];
  task_range?: [number, number];
};

const GUARD_ORDER = [
  "security-scan",
  "dependency-audit",
  "batch-review",
  "performance-budget",
  "human-review",
] as const;

function enabledGuard(config: ForgeConfig, type: string) {
  const guard = config.guards[type];

  if (!guard?.enabled) {
    return null;
  }

  return guard;
}

function matchesKeyword(task: ForgeTask, keywords: string[] | undefined): boolean {
  if (!keywords || keywords.length === 0) {
    return false;
  }

  const haystack = [task.title, ...(task.tags ?? [])].join(" ").toLowerCase();

  return keywords.some((keyword) =>
    haystack.includes(keyword.toLowerCase()),
  );
}

function completedTaskRange(progress: ForgeProgress): [number, number] | undefined {
  const completedIds = progress.tasks
    .filter((item) => item.status === "done")
    .map((item) => item.id)
    .sort((left, right) => left - right);

  if (completedIds.length === 0) {
    return undefined;
  }

  const lastBatchGuard = [...progress.guard_history]
    .reverse()
    .find((guard) => guard.type === "batch-review" && guard.task_range);
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

  for (const type of GUARD_ORDER) {
    const guard = enabledGuard(config, type);
    if (!guard) {
      continue;
    }

    if (type === "security-scan" && matchesKeyword(task, guard.keywords)) {
      guards.push({ type, actions: guard.actions });
    }

    if (type === "dependency-audit") {
      continue;
    }

    if (type === "batch-review") {
      const every = guard.every_n_tasks ?? 6;
      if (
        progress.completed_tasks > 0 &&
        progress.completed_tasks % every === 0
      ) {
        const taskRange = completedTaskRange(progress);
        guards.push({
          type,
          actions: guard.actions,
          ...(taskRange ? { task_range: taskRange } : {}),
        });
      }
    }

    if (type === "performance-budget" && matchesKeyword(task, guard.keywords)) {
      guards.push({ type, actions: guard.actions });
    }

    if (type === "human-review" && task.requires_human_review === true) {
      guards.push({ type, actions: guard.actions });
    }
  }

  return guards;
}
