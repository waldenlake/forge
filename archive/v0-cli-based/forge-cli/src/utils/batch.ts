export interface TaskWithDeps {
  id: number;
  title: string;
  dependencies: number[];
}

export function cutBatches(tasks: TaskWithDeps[], maxBatchSize: number): TaskWithDeps[][] {
  if (tasks.length === 0) return [];

  const sorted = topologicalSort(tasks);

  const batches: TaskWithDeps[][] = [];
  let currentBatch: TaskWithDeps[] = [];
  const completedIds = new Set<number>();

  for (const task of sorted) {
    const depsMet = task.dependencies.every(depId => completedIds.has(depId));

    if (!depsMet) {
      if (currentBatch.length > 0) {
        batches.push(currentBatch);
        currentBatch.forEach(t => completedIds.add(t.id));
        currentBatch = [];
      }
    }

    if (currentBatch.length >= maxBatchSize) {
      batches.push(currentBatch);
      currentBatch.forEach(t => completedIds.add(t.id));
      currentBatch = [];
    }

    currentBatch.push(task);
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

function topologicalSort(tasks: TaskWithDeps[]): TaskWithDeps[] {
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  const visited = new Set<number>();
  const result: TaskWithDeps[] = [];

  function visit(id: number): void {
    if (visited.has(id)) return;
    visited.add(id);

    const task = taskMap.get(id);
    if (!task) return;

    for (const depId of task.dependencies) {
      visit(depId);
    }

    result.push(task);
  }

  for (const task of tasks) {
    visit(task.id);
  }

  return result;
}
