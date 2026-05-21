import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { updateTaskProgress, updateBatchProgress, getTaskStatus } from '../../../src/utils/progress-tracker';
import * as fs from 'fs';
import * as path from 'path';

describe('Progress Tracker', () => {
  const testDir = path.join(__dirname, '../../tmp-progress-tracker');

  beforeEach(() => {
    fs.mkdirSync(path.join(testDir, '.forge'), { recursive: true });
    const progress = {
      version: '1.0',
      feature: 'test-feature',
      status: 'executing',
      phase: 'batch_execution',
      created_at: '2026-05-20T08:00:00Z',
      updated_at: '2026-05-20T08:00:00Z',
      total_batches: 2,
      current_batch: 1,
      batches: [
        {
          batch: 1,
          status: 'in_progress',
          tasks: [
            { id: 1, title: 'Task 1', status: 'in_progress' },
            { id: 2, title: 'Task 2', status: 'pending' },
          ],
        },
        {
          batch: 2,
          status: 'pending',
          tasks: [{ id: 3, title: 'Task 3', status: 'pending' }],
        },
      ],
      verification: { status: 'pending', test_mode: 'normal', last_run: null, report_path: null },
    };
    fs.writeFileSync(path.join(testDir, '.forge', 'progress.json'), JSON.stringify(progress));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('updateTaskProgress', () => {
    it('should update task status to done with commit', async () => {
      const result = await updateTaskProgress(testDir, 1, 'done', 'abc123');
      expect(result.success).toBe(true);

      const status = await getTaskStatus(testDir, 1);
      expect(status).toBe('done');
    });

    it('should update task status to failed', async () => {
      const result = await updateTaskProgress(testDir, 1, 'failed');
      expect(result.success).toBe(true);

      const status = await getTaskStatus(testDir, 1);
      expect(status).toBe('failed');
    });

    it('should fail if task not found', async () => {
      const result = await updateTaskProgress(testDir, 999, 'done');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Task 999 not found');
    });

    it('should update task status without commit parameter', async () => {
      const result = await updateTaskProgress(testDir, 1, 'done');
      expect(result.success).toBe(true);

      const progress = JSON.parse(fs.readFileSync(path.join(testDir, '.forge', 'progress.json'), 'utf-8'));
      expect(progress.batches[0].tasks[0].status).toBe('done');
      expect(progress.batches[0].tasks[0].commit).toBeUndefined();
    });

    it('should update task status to in_progress', async () => {
      const result = await updateTaskProgress(testDir, 2, 'in_progress');
      expect(result.success).toBe(true);

      const status = await getTaskStatus(testDir, 2);
      expect(status).toBe('in_progress');
    });

    it('should update task status to pending', async () => {
      await updateTaskProgress(testDir, 1, 'pending');
      const status = await getTaskStatus(testDir, 1);
      expect(status).toBe('pending');
    });

    it('should set completed_at when status is done', async () => {
      await updateTaskProgress(testDir, 1, 'done', 'abc123');
      const progress = JSON.parse(fs.readFileSync(path.join(testDir, '.forge', 'progress.json'), 'utf-8'));
      expect(progress.batches[0].tasks[0].completed_at).toBeDefined();
      expect(new Date(progress.batches[0].tasks[0].completed_at).getTime()).toBeGreaterThan(0);
    });

    it('should set completed_at when status is failed', async () => {
      await updateTaskProgress(testDir, 1, 'failed');
      const progress = JSON.parse(fs.readFileSync(path.join(testDir, '.forge', 'progress.json'), 'utf-8'));
      expect(progress.batches[0].tasks[0].completed_at).toBeDefined();
    });

    it('should not set completed_at for in_progress status', async () => {
      await updateTaskProgress(testDir, 2, 'in_progress');
      const progress = JSON.parse(fs.readFileSync(path.join(testDir, '.forge', 'progress.json'), 'utf-8'));
      expect(progress.batches[0].tasks[1].completed_at).toBeUndefined();
    });

    it('should update updated_at timestamp on write', async () => {
      const before = await updateTaskProgress(testDir, 1, 'done', 'abc123');
      expect(before.success).toBe(true);

      const progress = JSON.parse(fs.readFileSync(path.join(testDir, '.forge', 'progress.json'), 'utf-8'));
      expect(progress.updated_at).not.toBe('2026-05-20T08:00:00Z');
      expect(new Date(progress.updated_at).getTime()).toBeGreaterThan(new Date('2026-05-20T08:00:00Z').getTime());
    });
  });

  describe('updateBatchProgress', () => {
    it('should update batch status to done', async () => {
      const result = await updateBatchProgress(testDir, 1, 'done');
      expect(result.success).toBe(true);

      const progress = JSON.parse(fs.readFileSync(path.join(testDir, '.forge', 'progress.json'), 'utf-8'));
      expect(progress.batches[0].status).toBe('done');
    });

    it('should increment current_batch when batch is done', async () => {
      await updateBatchProgress(testDir, 1, 'done');
      const progress = JSON.parse(fs.readFileSync(path.join(testDir, '.forge', 'progress.json'), 'utf-8'));
      expect(progress.current_batch).toBe(2);
    });

    it('should fail if batch not found', async () => {
      const result = await updateBatchProgress(testDir, 999, 'done');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Batch 999 not found');
    });

    it('should update batch status to failed', async () => {
      const result = await updateBatchProgress(testDir, 1, 'failed');
      expect(result.success).toBe(true);

      const progress = JSON.parse(fs.readFileSync(path.join(testDir, '.forge', 'progress.json'), 'utf-8'));
      expect(progress.batches[0].status).toBe('failed');
    });

    it('should not set completed_at when batch fails', async () => {
      await updateBatchProgress(testDir, 1, 'failed');
      const progress = JSON.parse(fs.readFileSync(path.join(testDir, '.forge', 'progress.json'), 'utf-8'));
      expect(progress.batches[0].completed_at).toBeUndefined();
    });

    it('should not increment current_batch when batch fails', async () => {
      await updateBatchProgress(testDir, 1, 'failed');
      const progress = JSON.parse(fs.readFileSync(path.join(testDir, '.forge', 'progress.json'), 'utf-8'));
      expect(progress.current_batch).toBe(1);
    });

    it('should update updated_at timestamp on write', async () => {
      await updateBatchProgress(testDir, 1, 'done');
      const progress = JSON.parse(fs.readFileSync(path.join(testDir, '.forge', 'progress.json'), 'utf-8'));
      expect(progress.updated_at).not.toBe('2026-05-20T08:00:00Z');
    });
  });

  describe('getTaskStatus', () => {
    it('should return null when progress.json not found', async () => {
      const emptyDir = path.join(testDir, 'empty');
      fs.mkdirSync(emptyDir, { recursive: true });
      const status = await getTaskStatus(emptyDir, 1);
      expect(status).toBeNull();
    });

    it('should return null when task not found', async () => {
      const status = await getTaskStatus(testDir, 999);
      expect(status).toBeNull();
    });

    it('should return task status when task exists', async () => {
      const status = await getTaskStatus(testDir, 1);
      expect(status).toBe('in_progress');
    });
  });
});
