import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runBugfix } from '../../../src/commands/bugfix';
import * as fs from 'fs';
import * as path from 'path';

describe('Bugfix Command', () => {
  const testDir = path.join(__dirname, '../../tmp-bugfix-test');

  beforeEach(() => {
    fs.mkdirSync(path.join(testDir, '.forge'), { recursive: true });
    fs.mkdirSync(path.join(testDir, 'docs', 'forge', 'changes'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('runBugfix init', () => {
    it('should create bugfix directory and progress entry', async () => {
      const idleProgress = {
        version: '1.0', feature: '', status: 'idle', phase: 'brainstorming',
        created_at: '2026-05-20T08:00:00Z', updated_at: '2026-05-20T08:00:00Z',
        total_batches: 0, current_batch: 0, batches: [],
        verification: { status: 'pending', test_mode: 'normal', last_run: null, report_path: null },
      };
      fs.writeFileSync(path.join(testDir, '.forge', 'progress.json'), JSON.stringify(idleProgress));

      const result = await runBugfix(testDir, 'init', { description: 'Login button not responding' });
      expect(result.success).toBe(true);
      expect(result.output).toContain('bugfix-');

      const slug = result.output!.match(/bugfix-[\w-]+/)?.[0];
      expect(slug).toBeDefined();
      expect(fs.existsSync(path.join(testDir, 'docs', 'forge', 'changes', slug!))).toBe(true);

      const progress = JSON.parse(fs.readFileSync(path.join(testDir, '.forge', 'progress.json'), 'utf-8'));
      expect(progress.status).toBe('bugfix');
      expect(progress.feature).toBe(slug);
    });

    it('should fail if another feature is in progress', async () => {
      const existingProgress = {
        version: '1.0', feature: 'existing-feature', status: 'executing', phase: 'batch_execution',
        created_at: '2026-05-20T08:00:00Z', updated_at: '2026-05-21T10:30:00Z',
        total_batches: 1, current_batch: 1,
        batches: [{ batch: 1, status: 'in_progress', tasks: [] }],
        verification: { status: 'pending', test_mode: 'normal', last_run: null, report_path: null },
      };
      fs.writeFileSync(path.join(testDir, '.forge', 'progress.json'), JSON.stringify(existingProgress));

      const result = await runBugfix(testDir, 'init', { description: 'Test bug' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('active feature');
    });

    it('should fail when progress.json does not exist', async () => {
      const result = await runBugfix(testDir, 'init', { description: 'Test bug' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('No progress.json');
    });

    it('should write bug description to change directory', async () => {
      const idleProgress = {
        version: '1.0', feature: '', status: 'idle', phase: 'brainstorming',
        created_at: '2026-05-20T08:00:00Z', updated_at: '2026-05-20T08:00:00Z',
        total_batches: 0, current_batch: 0, batches: [],
        verification: { status: 'pending', test_mode: 'normal', last_run: null, report_path: null },
      };
      fs.writeFileSync(path.join(testDir, '.forge', 'progress.json'), JSON.stringify(idleProgress));

      const result = await runBugfix(testDir, 'init', { description: 'Login button not responding on mobile' });
      expect(result.success).toBe(true);

      const slug = result.output!.match(/bugfix-[\w-]+/)?.[0];
      const bugReportPath = path.join(testDir, 'docs', 'forge', 'changes', slug!, 'bug-report.md');
      expect(fs.existsSync(bugReportPath)).toBe(true);
      const content = fs.readFileSync(bugReportPath, 'utf-8');
      expect(content).toContain('Login button not responding on mobile');
    });
  });

  describe('runBugfix list', () => {
    it('should list archived bugfixes', async () => {
      fs.mkdirSync(path.join(testDir, 'docs', 'forge', 'changes', 'archive', '2026-05-20-bugfix-123'), { recursive: true });
      fs.mkdirSync(path.join(testDir, 'docs', 'forge', 'changes', 'archive', '2026-05-21-bugfix-456'), { recursive: true });

      const result = await runBugfix(testDir, 'list');
      expect(result.success).toBe(true);
      expect(result.output).toContain('bugfix-123');
      expect(result.output).toContain('bugfix-456');
    });

    it('should return empty message when archive directory does not exist', async () => {
      const result = await runBugfix(testDir, 'list');
      expect(result.success).toBe(true);
      expect(result.output).toBe('No archived bugfixes found.');
    });

    it('should return empty message when archive exists but contains no bugfix entries', async () => {
      fs.mkdirSync(path.join(testDir, 'docs', 'forge', 'changes', 'archive', 'random-folder'), { recursive: true });

      const result = await runBugfix(testDir, 'list');
      expect(result.success).toBe(true);
      expect(result.output).toBe('No archived bugfixes found.');
    });
  });

  describe('runBugfix unknown subcommand', () => {
    it('should return error for unknown subcommand', async () => {
      const result = await runBugfix(testDir, 'unknown');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown');
    });
  });
});
