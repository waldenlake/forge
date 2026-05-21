import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runDone } from '../../../src/commands/done';
import * as fs from 'fs';
import * as path from 'path';

describe('Done Command', () => {
  const testDir = path.join(__dirname, '../../tmp-done-test');

  beforeEach(() => {
    fs.mkdirSync(path.join(testDir, '.forge'), { recursive: true });
    fs.mkdirSync(path.join(testDir, 'docs', 'forge', 'changes', 'test-feature'), { recursive: true });
    fs.mkdirSync(path.join(testDir, 'docs', 'forge', 'specs'), { recursive: true });
    fs.mkdirSync(path.join(testDir, 'docs', 'forge', 'changes', 'archive'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('runDone validate', () => {
    it('should fail when progress.json does not exist', async () => {
      const emptyDir = path.join(testDir, 'empty');
      fs.mkdirSync(emptyDir, { recursive: true });
      const result = await runDone(emptyDir, 'validate');
      expect(result.success).toBe(false);
      expect(result.error).toContain('No progress.json');
    });

    it('should pass when all batches and tasks are done', async () => {
      const progress = {
        version: '1.0',
        feature: 'test-feature',
        status: 'executing',
        phase: 'batch_execution',
        created_at: '2026-05-20T08:00:00Z',
        updated_at: '2026-05-21T10:30:00Z',
        total_batches: 2,
        current_batch: 2,
        batches: [
          { batch: 1, status: 'done', tasks: [{ id: 1, title: 'Task 1', status: 'done', commit: 'abc' }] },
          { batch: 2, status: 'done', tasks: [{ id: 7, title: 'Task 7', status: 'done', commit: 'def' }] },
        ],
        verification: { status: 'passed', test_mode: 'normal', last_run: '2026-05-21T10:00:00Z', report_path: 'docs/forge/changes/test-feature/test-report.html' },
      };
      fs.writeFileSync(path.join(testDir, '.forge', 'progress.json'), JSON.stringify(progress));
      const result = await runDone(testDir, 'validate');
      expect(result.success).toBe(true);
      expect(result.output).toContain('All tasks complete');
    });

    it('should fail when tasks are incomplete', async () => {
      const progress = {
        version: '1.0',
        feature: 'test-feature',
        status: 'executing',
        phase: 'batch_execution',
        created_at: '2026-05-20T08:00:00Z',
        updated_at: '2026-05-21T10:30:00Z',
        total_batches: 2,
        current_batch: 2,
        batches: [
          { batch: 1, status: 'done', tasks: [{ id: 1, title: 'Task 1', status: 'done', commit: 'abc' }] },
          { batch: 2, status: 'in_progress', tasks: [{ id: 7, title: 'Task 7', status: 'done', commit: 'def' }, { id: 8, title: 'Task 8', status: 'pending' }] },
        ],
        verification: { status: 'pending', test_mode: 'normal', last_run: null, report_path: null },
      };
      fs.writeFileSync(path.join(testDir, '.forge', 'progress.json'), JSON.stringify(progress));
      const result = await runDone(testDir, 'validate');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Task 8');
    });

    it('should fail when verification has not passed', async () => {
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
          { batch: 1, status: 'done', tasks: [{ id: 1, title: 'Task 1', status: 'done', commit: 'abc' }] },
        ],
        verification: { status: 'pending', test_mode: 'normal', last_run: null, report_path: null },
      };
      fs.writeFileSync(path.join(testDir, '.forge', 'progress.json'), JSON.stringify(progress));
      const result = await runDone(testDir, 'validate');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Verification');
    });

    it('should allow deferred tasks', async () => {
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
          { batch: 1, status: 'done', tasks: [{ id: 1, title: 'Task 1', status: 'done', commit: 'abc' }, { id: 2, title: 'Task 2', status: 'deferred' }] },
        ],
        verification: { status: 'passed', test_mode: 'normal', last_run: '2026-05-21T10:00:00Z', report_path: 'docs/forge/changes/test-feature/test-report.html' },
      };
      fs.writeFileSync(path.join(testDir, '.forge', 'progress.json'), JSON.stringify(progress));
      const result = await runDone(testDir, 'validate');
      expect(result.success).toBe(true);
      expect(result.output).toContain('deferred');
    });
  });

  describe('runDone archive', () => {
    it('should fail when no progress.json exists', async () => {
      const emptyDir = path.join(testDir, 'empty-archive');
      fs.mkdirSync(emptyDir, { recursive: true });
      const result = await runDone(emptyDir, 'archive');
      expect(result.success).toBe(false);
      expect(result.error).toContain('No progress.json');
    });

    it('should fail when no active feature (empty feature slug)', async () => {
      fs.writeFileSync(path.join(testDir, '.forge', 'progress.json'), JSON.stringify({
        version: '1.0', feature: '', status: 'idle', phase: 'brainstorming',
        created_at: '2026-05-20T08:00:00Z', updated_at: '2026-05-21T10:30:00Z',
        total_batches: 0, current_batch: 0, batches: [],
        verification: { status: 'pending', test_mode: 'normal', last_run: null, report_path: null },
      }));
      const result = await runDone(testDir, 'archive');
      expect(result.success).toBe(false);
      expect(result.error).toContain('No active feature');
    });

    it('should move change directory to archive and copy scenarios', async () => {
      fs.writeFileSync(path.join(testDir, '.forge', 'progress.json'), JSON.stringify({
        version: '1.0', feature: 'test-feature', status: 'idle', phase: 'brainstorming',
        created_at: '2026-05-20T08:00:00Z', updated_at: '2026-05-21T10:30:00Z',
        total_batches: 0, current_batch: 0, batches: [],
        verification: { status: 'pending', test_mode: 'normal', last_run: null, report_path: null },
      }));
      fs.writeFileSync(path.join(testDir, 'docs', 'forge', 'changes', 'test-feature', 'proposal.md'), '# Test');
      fs.writeFileSync(path.join(testDir, 'docs', 'forge', 'changes', 'test-feature', 'scenarios.json'), '{"scenarios": []}');
      fs.writeFileSync(path.join(testDir, 'docs', 'forge', 'changes', 'test-feature', 'scenarios.md'), '# Scenarios');

      const result = await runDone(testDir, 'archive', { date: '2026-05-21' });
      expect(result.success).toBe(true);

      const archivedPath = path.join(testDir, 'docs', 'forge', 'changes', 'archive', '2026-05-21-test-feature');
      expect(fs.existsSync(archivedPath)).toBe(true);
      expect(fs.existsSync(path.join(testDir, 'docs', 'forge', 'specs', 'test-feature-scenarios.json'))).toBe(true);
      expect(fs.existsSync(path.join(testDir, 'docs', 'forge', 'specs', 'test-feature-scenarios.md'))).toBe(true);
    });
  });

  describe('runDone reset', () => {
    it('should fail when progress.json does not exist', async () => {
      const emptyDir = path.join(testDir, 'empty-reset');
      fs.mkdirSync(emptyDir, { recursive: true });
      const result = await runDone(emptyDir, 'reset');
      expect(result.success).toBe(false);
      expect(result.error).toContain('No progress.json');
    });

    it('should reset progress.json to idle state', async () => {
      const progress = {
        version: '1.0', feature: 'test-feature', status: 'executing', phase: 'batch_execution',
        created_at: '2026-05-20T08:00:00Z', updated_at: '2026-05-21T10:30:00Z',
        total_batches: 2, current_batch: 2,
        batches: [{ batch: 1, status: 'done', tasks: [] }, { batch: 2, status: 'done', tasks: [] }],
        verification: { status: 'passed', test_mode: 'normal', last_run: '2026-05-21T10:00:00Z', report_path: null },
      };
      fs.writeFileSync(path.join(testDir, '.forge', 'progress.json'), JSON.stringify(progress));

      const result = await runDone(testDir, 'reset');
      expect(result.success).toBe(true);

      const reset = JSON.parse(fs.readFileSync(path.join(testDir, '.forge', 'progress.json'), 'utf-8'));
      expect(reset.status).toBe('idle');
      expect(reset.feature).toBe('');
      expect(reset.batches).toEqual([]);
    });
  });

  describe('runDone unknown subcommand', () => {
    it('should fail with unknown subcommand error', async () => {
      const result = await runDone(testDir, 'unknown');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown subcommand');
    });
  });
});
