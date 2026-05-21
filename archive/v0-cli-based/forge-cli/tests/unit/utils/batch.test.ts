import { describe, it, expect } from 'vitest';
import { cutBatches } from '../../../src/utils/batch';

describe('Batch Cutting', () => {
  it('should cut tasks into batches of max size', () => {
    const tasks = Array.from({ length: 16 }, (_, i) => ({
      id: i + 1,
      title: `Task ${i + 1}`,
      dependencies: [],
    }));
    const batches = cutBatches(tasks, 6);
    expect(batches).toHaveLength(3);
    expect(batches[0]).toHaveLength(6);
    expect(batches[1]).toHaveLength(6);
    expect(batches[2]).toHaveLength(4);
  });

  it('should respect dependency order', () => {
    const tasks = [
      { id: 1, title: 'Task 1', dependencies: [] },
      { id: 2, title: 'Task 2', dependencies: [1] },
      { id: 3, title: 'Task 3', dependencies: [2] },
      { id: 4, title: 'Task 4', dependencies: [] },
    ];
    const batches = cutBatches(tasks, 6);
    const batchOf1 = batches.findIndex(b => b.some(t => t.id === 1));
    const batchOf2 = batches.findIndex(b => b.some(t => t.id === 2));
    const batchOf3 = batches.findIndex(b => b.some(t => t.id === 3));
    expect(batchOf1).toBeLessThanOrEqual(batchOf2);
    expect(batchOf2).toBeLessThanOrEqual(batchOf3);
  });

  it('should handle tasks with no dependencies', () => {
    const tasks = [
      { id: 1, title: 'Task 1', dependencies: [] },
      { id: 2, title: 'Task 2', dependencies: [] },
    ];
    const batches = cutBatches(tasks, 6);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);
  });

  it('should handle empty task list', () => {
    const batches = cutBatches([], 6);
    expect(batches).toHaveLength(0);
  });

  it('should handle single task', () => {
    const tasks = [{ id: 1, title: 'Task 1', dependencies: [] }];
    const batches = cutBatches(tasks, 6);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(1);
  });

  it('should handle complex dependency graph', () => {
    const tasks = [
      { id: 1, title: 'Base A', dependencies: [] },
      { id: 2, title: 'Base B', dependencies: [] },
      { id: 3, title: 'Depends on A', dependencies: [1] },
      { id: 4, title: 'Depends on B', dependencies: [2] },
      { id: 5, title: 'Depends on A and B', dependencies: [1, 2] },
      { id: 6, title: 'Depends on 3 and 4', dependencies: [3, 4] },
    ];
    const batches = cutBatches(tasks, 6);
    for (const task of tasks) {
      const taskBatch = batches.findIndex(b => b.some(t => t.id === task.id));
      for (const depId of task.dependencies) {
        const depBatch = batches.findIndex(b => b.some(t => t.id === depId));
        expect(depBatch).toBeLessThan(taskBatch);
      }
    }
  });
});
