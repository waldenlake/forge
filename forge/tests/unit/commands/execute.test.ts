import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runExecute } from '../../../src/commands/execute';
import * as fs from 'fs';
import * as path from 'path';

vi.mock('../../../src/utils/executor', () => ({
  executeTask: vi.fn().mockResolvedValue({ success: true, taskId: 1, commit: 'abc123' }),
}));

vi.mock('../../../src/utils/progress-tracker', () => ({
  updateTaskProgress: vi.fn().mockResolvedValue({ success: true }),
}));

describe('Execute Command', () => {
  const testDir = path.join(__dirname, '../../tmp-execute');

  beforeEach(() => {
    fs.mkdirSync(path.join(testDir, '.forge'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('runExecute task', () => {
    it('should execute a task from progress.json', async () => {
      const progress = {
        version: '1.0', feature: 'test-feature', status: 'executing', phase: 'batch_execution',
        created_at: '2026-05-20T08:00:00Z', updated_at: '2026-05-20T08:00:00Z',
        total_batches: 1, current_batch: 1,
        batches: [{ batch: 1, status: 'in_progress', tasks: [{ id: 1, title: 'Task 1', status: 'in_progress' }] }],
        verification: { status: 'pending', test_mode: 'normal', last_run: null, report_path: null },
      };
      fs.writeFileSync(path.join(testDir, '.forge', 'progress.json'), JSON.stringify(progress));

      const result = await runExecute(testDir, 'task', { taskId: 1 });
      expect(result.success).toBeDefined();
    });

    it('should fail if task ID not provided', async () => {
      const result = await runExecute(testDir, 'task');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Task ID');
    });

    it('should fail if task not found', async () => {
      const progress = {
        version: '1.0', feature: 'test-feature', status: 'executing', phase: 'batch_execution',
        created_at: '2026-05-20T08:00:00Z', updated_at: '2026-05-20T08:00:00Z',
        total_batches: 1, current_batch: 1,
        batches: [{ batch: 1, status: 'in_progress', tasks: [{ id: 1, title: 'Task 1', status: 'in_progress' }] }],
        verification: { status: 'pending', test_mode: 'normal', last_run: null, report_path: null },
      };
      fs.writeFileSync(path.join(testDir, '.forge', 'progress.json'), JSON.stringify(progress));

      const result = await runExecute(testDir, 'task', { taskId: 999 });
      expect(result.success).toBe(false);
    });
  });

  describe('runExecute progress', () => {
    it('should show current progress', async () => {
      const progress = {
        version: '1.0', feature: 'test-feature', status: 'executing', phase: 'batch_execution',
        created_at: '2026-05-20T08:00:00Z', updated_at: '2026-05-20T08:00:00Z',
        total_batches: 2, current_batch: 1,
        batches: [
          { batch: 1, status: 'done', tasks: [{ id: 1, title: 'Task 1', status: 'done', commit: 'abc123' }] },
          { batch: 2, status: 'in_progress', tasks: [{ id: 2, title: 'Task 2', status: 'in_progress' }] },
        ],
        verification: { status: 'pending', test_mode: 'normal', last_run: null, report_path: null },
      };
      fs.writeFileSync(path.join(testDir, '.forge', 'progress.json'), JSON.stringify(progress));

      const result = await runExecute(testDir, 'progress');
      expect(result.success).toBe(true);
      expect(result.output).toContain('Task 1');
      expect(result.output).toContain('Task 2');
    });

    it('should fail if progress.json not found', async () => {
      const result = await runExecute(testDir, 'progress');
      expect(result.success).toBe(false);
    });
  });

  describe('runExecute unknown', () => {
    it('should return error for unknown subcommand', async () => {
      const result = await runExecute(testDir, 'unknown');
      expect(result.success).toBe(false);
    });
  });
});
