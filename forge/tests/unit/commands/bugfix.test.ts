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

  describe('runBugfix reproduce', () => {
    function setupActiveBugfix() {
      const slug = 'bugfix-test-123';
      const changeDir = path.join(testDir, 'docs', 'forge', 'changes', slug);
      fs.mkdirSync(changeDir, { recursive: true });
      const bugReportContent = `# Bug Report: ${slug}\n\n## Description\n\nTest bug\n\n## Reproduction Steps\n\n<!-- To be filled during bugfix flow -->\n`;
      fs.writeFileSync(path.join(changeDir, 'bug-report.md'), bugReportContent);
      const progress = {
        version: '1.0', feature: slug, status: 'bugfix', phase: 'brainstorming',
        created_at: '2026-05-20T08:00:00Z', updated_at: '2026-05-20T08:00:00Z',
        total_batches: 0, current_batch: 0, batches: [],
        verification: { status: 'pending', test_mode: 'normal', last_run: null, report_path: null },
      };
      fs.writeFileSync(path.join(testDir, '.forge', 'progress.json'), JSON.stringify(progress));
      return slug;
    }

    it('should record reproduction steps in bug report', async () => {
      const slug = setupActiveBugfix();
      const steps = '1. Open login page\n2. Enter invalid password\n3. Click Login';

      const result = await runBugfix(testDir, 'reproduce', { steps });
      expect(result.success).toBe(true);
      expect(result.output).toContain(slug);

      const bugReportPath = path.join(testDir, 'docs', 'forge', 'changes', slug, 'bug-report.md');
      const content = fs.readFileSync(bugReportPath, 'utf-8');
      expect(content).toContain('1. Open login page');
      expect(content).toContain('2. Enter invalid password');
      expect(content).toContain('3. Click Login');
    });

    it('should fail without reproduction steps', async () => {
      setupActiveBugfix();
      const result = await runBugfix(testDir, 'reproduce', { steps: '' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Reproduction steps are required');
    });

    it('should fail if no active bugfix', async () => {
      const idleProgress = {
        version: '1.0', feature: '', status: 'idle', phase: 'brainstorming',
        created_at: '2026-05-20T08:00:00Z', updated_at: '2026-05-20T08:00:00Z',
        total_batches: 0, current_batch: 0, batches: [],
        verification: { status: 'pending', test_mode: 'normal', last_run: null, report_path: null },
      };
      fs.writeFileSync(path.join(testDir, '.forge', 'progress.json'), JSON.stringify(idleProgress));

      const result = await runBugfix(testDir, 'reproduce', { steps: 'some steps' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('No active bugfix');
    });
  });

  describe('runBugfix plan', () => {
    function setupActiveBugfix() {
      const slug = 'bugfix-test-456';
      const changeDir = path.join(testDir, 'docs', 'forge', 'changes', slug);
      fs.mkdirSync(changeDir, { recursive: true });
      const bugReportContent = `# Bug Report: ${slug}\n\n## Description\n\nTest bug\n\n## Reproduction Steps\n\n1. Do something\n`;
      fs.writeFileSync(path.join(changeDir, 'bug-report.md'), bugReportContent);
      const progress = {
        version: '1.0', feature: slug, status: 'bugfix', phase: 'brainstorming',
        created_at: '2026-05-20T08:00:00Z', updated_at: '2026-05-20T08:00:00Z',
        total_batches: 0, current_batch: 0, batches: [],
        verification: { status: 'pending', test_mode: 'normal', last_run: null, report_path: null },
      };
      fs.writeFileSync(path.join(testDir, '.forge', 'progress.json'), JSON.stringify(progress));
      return slug;
    }

    it('should generate fix-plan.md in change directory', async () => {
      const slug = setupActiveBugfix();

      const result = await runBugfix(testDir, 'plan');
      expect(result.success).toBe(true);
      expect(result.output).toContain('fix-plan.md');

      const fixPlanPath = path.join(testDir, 'docs', 'forge', 'changes', slug, 'fix-plan.md');
      expect(fs.existsSync(fixPlanPath)).toBe(true);

      const content = fs.readFileSync(fixPlanPath, 'utf-8');
      expect(content).toContain('Fix Plan');
      expect(content).toContain('Task 1: Write regression test');
      expect(content).toContain('Task 2: Implement fix');
      expect(content).toContain('Task 3: Verify no regressions');
    });

    it('should fail if no active bugfix', async () => {
      const idleProgress = {
        version: '1.0', feature: '', status: 'idle', phase: 'brainstorming',
        created_at: '2026-05-20T08:00:00Z', updated_at: '2026-05-20T08:00:00Z',
        total_batches: 0, current_batch: 0, batches: [],
        verification: { status: 'pending', test_mode: 'normal', last_run: null, report_path: null },
      };
      fs.writeFileSync(path.join(testDir, '.forge', 'progress.json'), JSON.stringify(idleProgress));

      const result = await runBugfix(testDir, 'plan');
      expect(result.success).toBe(false);
      expect(result.error).toContain('No active bugfix');
    });
  });

  describe('runBugfix execute', () => {
    function setupActiveBugfix() {
      const slug = 'bugfix-test-789';
      const changeDir = path.join(testDir, 'docs', 'forge', 'changes', slug);
      fs.mkdirSync(changeDir, { recursive: true });
      const bugReportContent = `# Bug Report: ${slug}\n\n## Description\n\nTest bug\n`;
      fs.writeFileSync(path.join(changeDir, 'bug-report.md'), bugReportContent);
      const progress = {
        version: '1.0', feature: slug, status: 'bugfix', phase: 'brainstorming',
        created_at: '2026-05-20T08:00:00Z', updated_at: '2026-05-20T08:00:00Z',
        total_batches: 0, current_batch: 0, batches: [],
        verification: { status: 'pending', test_mode: 'normal', last_run: null, report_path: null },
      };
      fs.writeFileSync(path.join(testDir, '.forge', 'progress.json'), JSON.stringify(progress));
      return slug;
    }

    it('should return TDD execution instructions', async () => {
      const slug = setupActiveBugfix();

      const result = await runBugfix(testDir, 'execute', { testCommand: 'npm test' });
      expect(result.success).toBe(true);
      expect(result.output).toContain(slug);
      expect(result.output).toContain('npm test');
      expect(result.output).toContain('Write regression test');
      expect(result.output).toContain('Implement fix');
      expect(result.output).toContain('Run tests');
    });

    it('should use default test command when not provided', async () => {
      setupActiveBugfix();

      const result = await runBugfix(testDir, 'execute');
      expect(result.success).toBe(true);
      expect(result.output).toContain('npm test');
    });

    it('should fail if no active bugfix', async () => {
      const idleProgress = {
        version: '1.0', feature: '', status: 'idle', phase: 'brainstorming',
        created_at: '2026-05-20T08:00:00Z', updated_at: '2026-05-20T08:00:00Z',
        total_batches: 0, current_batch: 0, batches: [],
        verification: { status: 'pending', test_mode: 'normal', last_run: null, report_path: null },
      };
      fs.writeFileSync(path.join(testDir, '.forge', 'progress.json'), JSON.stringify(idleProgress));

      const result = await runBugfix(testDir, 'execute');
      expect(result.success).toBe(false);
      expect(result.error).toContain('No active bugfix');
    });
  });
});
