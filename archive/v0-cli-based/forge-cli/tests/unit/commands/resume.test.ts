import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runResume, readProgress, reconstructState } from '../../../src/commands/resume';
import * as fs from 'fs';
import * as path from 'path';

describe('Resume Command', () => {
  const testDir = path.join(__dirname, '../../tmp-resume-test');

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
    fs.mkdirSync(path.join(testDir, '.forge'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('runResume', () => {
    it('should return success with output when progress.json exists', async () => {
      const progress = {
        version: '1.0',
        feature: 'user-login',
        status: 'executing',
        phase: 'batch_execution',
        created_at: '2026-05-20T08:00:00Z',
        updated_at: '2026-05-21T10:30:00Z',
        total_batches: 1,
        current_batch: 1,
        batches: [
          { batch: 1, status: 'in_progress', tasks: [{ id: 1, title: 'Task 1', status: 'in_progress' }] },
        ],
        verification: { status: 'pending', test_mode: 'normal', last_run: null, report_path: null },
      };
      fs.writeFileSync(path.join(testDir, '.forge', 'progress.json'), JSON.stringify(progress));
      const result = await runResume(testDir);
      expect(result.success).toBe(true);
      expect(result.output).toContain('user-login');
      expect(result.error).toBeUndefined();
    });

    it('should return error when progress.json does not exist', async () => {
      const result = await runResume(testDir);
      expect(result.success).toBe(false);
      expect(result.error).toContain('No progress.json found');
    });

    it('should return error when progress.json is invalid', async () => {
      fs.writeFileSync(path.join(testDir, '.forge', 'progress.json'), '{ invalid json }');
      const result = await runResume(testDir);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid progress.json');
    });
  });

  describe('readProgress', () => {
    it('should read valid progress.json', async () => {
      const progress = {
        version: '1.0',
        feature: 'user-login',
        status: 'executing',
        phase: 'batch_execution',
        created_at: '2026-05-20T08:00:00Z',
        updated_at: '2026-05-21T10:30:00Z',
        total_batches: 3,
        current_batch: 2,
        batches: [
          { batch: 1, status: 'done', tasks: [{ id: 1, title: 'Task 1', status: 'done', commit: 'abc123', completed_at: '2026-05-20T09:00:00Z' }] },
          { batch: 2, status: 'in_progress', tasks: [{ id: 7, title: 'Task 7', status: 'done', commit: 'def456', completed_at: '2026-05-21T09:45:00Z' }, { id: 8, title: 'Task 8', status: 'in_progress' }] },
        ],
        verification: { status: 'pending', test_mode: 'normal', last_run: null, report_path: null },
      };
      fs.writeFileSync(path.join(testDir, '.forge', 'progress.json'), JSON.stringify(progress));
      const result = await readProgress(testDir);
      expect(result.feature).toBe('user-login');
      expect(result.status).toBe('executing');
      expect(result.current_batch).toBe(2);
    });

    it('should throw when progress.json does not exist', async () => {
      await expect(readProgress(testDir)).rejects.toThrow('No progress.json found');
    });

    it('should throw when progress.json is invalid JSON', async () => {
      fs.writeFileSync(path.join(testDir, '.forge', 'progress.json'), '{ invalid json }');
      await expect(readProgress(testDir)).rejects.toThrow('Invalid progress.json');
    });
  });

  describe('reconstructState', () => {
    it('should generate accurate resume summary', () => {
      const progress = {
        version: '1.0',
        feature: 'user-login',
        status: 'executing',
        phase: 'batch_execution',
        created_at: '2026-05-20T08:00:00Z',
        updated_at: '2026-05-21T10:30:00Z',
        total_batches: 3,
        current_batch: 2,
        batches: [
          { batch: 1, status: 'done', tasks: [{ id: 1, title: 'Task 1', status: 'done' }, { id: 2, title: 'Task 2', status: 'done' }] },
          { batch: 2, status: 'in_progress', tasks: [{ id: 7, title: 'Task 7', status: 'done' }, { id: 8, title: 'Task 8', status: 'in_progress' }] },
          { batch: 3, status: 'pending', tasks: [{ id: 13, title: 'Task 13', status: 'pending' }] },
        ],
        verification: { status: 'pending', test_mode: 'normal', last_run: null, report_path: null },
      };
      const summary = reconstructState(progress);
      expect(summary).toContain('user-login');
      expect(summary).toContain('batch 1');
      expect(summary).toContain('batch 2, task 8');
    });

    it('should detect state inconsistency (task marked done but no commit)', () => {
      const progress = {
        version: '1.0',
        feature: 'test-feature',
        status: 'executing',
        phase: 'batch_execution',
        created_at: '2026-05-20T08:00:00Z',
        updated_at: '2026-05-21T10:30:00Z',
        total_batches: 1,
        current_batch: 1,
        batches: [
          { batch: 1, status: 'in_progress', tasks: [{ id: 1, title: 'Task 1', status: 'done' }] },
        ],
        verification: { status: 'pending', test_mode: 'normal', last_run: null, report_path: null },
      };
      const summary = reconstructState(progress);
      expect(summary).toContain('WARNING');
      expect(summary).toContain('Task 1');
    });

    it('should handle idle state gracefully', () => {
      const progress = {
        version: '1.0',
        feature: '',
        status: 'idle',
        phase: 'brainstorming',
        created_at: '2026-05-20T08:00:00Z',
        updated_at: '2026-05-20T08:00:00Z',
        total_batches: 0,
        current_batch: 0,
        batches: [],
        verification: { status: 'pending', test_mode: 'normal', last_run: null, report_path: null },
      };
      const summary = reconstructState(progress);
      expect(summary).toContain('No active feature');
    });

    it('should flag failed tasks in output', () => {
      const progress = {
        version: '1.0',
        feature: 'test-feature',
        status: 'executing',
        phase: 'batch_execution',
        created_at: '2026-05-20T08:00:00Z',
        updated_at: '2026-05-21T10:30:00Z',
        total_batches: 1,
        current_batch: 1,
        batches: [
          { batch: 1, status: 'in_progress', tasks: [
            { id: 1, title: 'Task 1', status: 'done', commit: 'abc123' },
            { id: 2, title: 'Task 2', status: 'failed' },
            { id: 3, title: 'Task 3', status: 'in_progress' },
          ]},
        ],
        verification: { status: 'pending', test_mode: 'normal', last_run: null, report_path: null },
      };
      const summary = reconstructState(progress);
      expect(summary).toContain('Failed:');
      expect(summary).toContain('Task 2');
    });

    it('should use single pass for all batch analysis', () => {
      const progress = {
        version: '1.0',
        feature: 'single-pass-test',
        status: 'executing',
        phase: 'batch_execution',
        created_at: '2026-05-20T08:00:00Z',
        updated_at: '2026-05-21T10:30:00Z',
        total_batches: 3,
        current_batch: 2,
        batches: [
          { batch: 1, status: 'done', tasks: [{ id: 1, title: 'Task 1', status: 'done', commit: 'abc' }] },
          { batch: 2, status: 'in_progress', tasks: [{ id: 2, title: 'Task 2', status: 'in_progress' }] },
          { batch: 3, status: 'pending', tasks: [{ id: 3, title: 'Task 3', status: 'pending' }] },
        ],
        verification: { status: 'pending', test_mode: 'normal', last_run: null, report_path: null },
      };
      const summary = reconstructState(progress);
      expect(summary).toContain('Completed: batch 1');
      expect(summary).toContain('In progress: batch 2');
      expect(summary).toContain('Pending: batch 3');
      expect(summary).toContain('1/3 tasks complete');
    });
  });
});
