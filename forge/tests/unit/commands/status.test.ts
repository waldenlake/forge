import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { runStatus } from '../../../src/commands/status';

const testDir = path.join(__dirname, '__test_status__');

describe('forge status', () => {
  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should return idle status when no feature is active', async () => {
    fs.mkdirSync(path.join(testDir, '.forge'), { recursive: true });
    const progress = {
      version: '1.0',
      feature: '',
      status: 'idle',
      phase: 'brainstorming',
      created_at: '2026-05-21T08:00:00Z',
      updated_at: '2026-05-21T08:00:00Z',
      total_batches: 0,
      current_batch: 0,
      batches: [],
      verification: { status: 'pending', test_mode: 'normal', last_run: null, report_path: null },
    };
    fs.writeFileSync(path.join(testDir, '.forge', 'progress.json'), JSON.stringify(progress));
    const result = await runStatus(testDir);
    expect(result.success).toBe(true);
    expect(result.output).toContain('No active feature');
  });

  it('should show progress for executing feature', async () => {
    fs.mkdirSync(path.join(testDir, '.forge'), { recursive: true });
    const progress = {
      version: '1.0',
      feature: 'user-auth',
      status: 'executing',
      phase: 'batch_execution',
      created_at: '2026-05-21T08:00:00Z',
      updated_at: '2026-05-21T10:30:00Z',
      total_batches: 3,
      current_batch: 2,
      batches: [
        { batch: 1, status: 'done', tasks: [{ id: 1, title: 'Task 1', status: 'done' }, { id: 2, title: 'Task 2', status: 'done' }] },
        { batch: 2, status: 'in_progress', tasks: [{ id: 3, title: 'Task 3', status: 'done' }, { id: 4, title: 'Task 4', status: 'in_progress' }] },
        { batch: 3, status: 'pending', tasks: [{ id: 5, title: 'Task 5', status: 'pending' }] },
      ],
      verification: { status: 'pending', test_mode: 'normal', last_run: null, report_path: null },
    };
    fs.writeFileSync(path.join(testDir, '.forge', 'progress.json'), JSON.stringify(progress));
    const result = await runStatus(testDir);
    expect(result.success).toBe(true);
    expect(result.output).toContain('user-auth');
    expect(result.output).toContain('executing');
    expect(result.output).toContain('batch 2/3');
  });

  it('should return error when progress.json is missing', async () => {
    const result = await runStatus(testDir);
    expect(result.success).toBe(false);
    expect(result.error).toContain('progress.json');
  });

  it('should show coverage target when config.json exists', async () => {
    fs.mkdirSync(path.join(testDir, '.forge'), { recursive: true });
    const progress = {
      version: '1.0',
      feature: 'user-auth',
      status: 'executing',
      phase: 'batch_execution',
      created_at: '2026-05-21T08:00:00Z',
      updated_at: '2026-05-21T10:30:00Z',
      total_batches: 0,
      current_batch: 0,
      batches: [],
      verification: { status: 'pending', test_mode: 'normal', last_run: null, report_path: null },
    };
    fs.writeFileSync(path.join(testDir, '.forge', 'progress.json'), JSON.stringify(progress));
    const config = {
      version: '1.0',
      test_mode: 'normal',
      gstack_installed: false,
      batch_size: 5,
      test_command: 'npm test',
      test_framework: 'vitest',
      test_coverage: { unit: 80, integration: 60, e2e: 'P0' },
      project_type: 'new',
      platforms: ['opencode'],
    };
    fs.writeFileSync(path.join(testDir, '.forge', 'config.json'), JSON.stringify(config));
    const result = await runStatus(testDir);
    expect(result.success).toBe(true);
    expect(result.output).toContain('Coverage target: unit ≥80%, integration ≥60%');
  });
});
