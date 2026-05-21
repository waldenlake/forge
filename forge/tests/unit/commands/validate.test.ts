import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { runValidate } from '../../../src/commands/validate';

const testDir = path.join(__dirname, '__test_validate__');

describe('forge validate', () => {
  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(path.join(testDir, '.forge'), { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should validate all files when valid', async () => {
    const config = {
      version: '1.0', test_mode: 'normal', gstack_installed: false, batch_size: 6,
      test_command: 'npm test', test_framework: 'vitest',
      test_coverage: { unit: 80, integration: 60, e2e: 'P0' },
      project_type: 'new', platforms: ['opencode'],
    };
    fs.writeFileSync(path.join(testDir, '.forge', 'config.json'), JSON.stringify(config));

    const progress = {
      version: '1.0', feature: 'test', status: 'idle', phase: 'brainstorming',
      created_at: '2026-05-21T08:00:00Z', updated_at: '2026-05-21T08:00:00Z',
      total_batches: 0, current_batch: 0, batches: [],
      verification: { status: 'pending', test_mode: 'normal', last_run: null, report_path: null },
    };
    fs.writeFileSync(path.join(testDir, '.forge', 'progress.json'), JSON.stringify(progress));

    const result = await runValidate(testDir);
    expect(result.success).toBe(true);
    expect(result.output).toContain('config.json: ✅ valid');
    expect(result.output).toContain('progress.json: ✅ valid');
  });

  it('should report validation errors', async () => {
    const invalidConfig = { version: '2.0' };
    fs.writeFileSync(path.join(testDir, '.forge', 'config.json'), JSON.stringify(invalidConfig));

    const result = await runValidate(testDir);
    expect(result.success).toBe(false);
    expect(result.output).toContain('config.json: ❌ invalid');
  });

  it('should return error when files are missing', async () => {
    const result = await runValidate(testDir);
    expect(result.success).toBe(false);
    expect(result.output).toContain('config.json: ❌ missing');
  });

  it('should validate scenarios.json if it exists', async () => {
    const config = {
      version: '1.0', test_mode: 'normal', gstack_installed: false, batch_size: 6,
      test_command: 'npm test', test_framework: 'vitest',
      test_coverage: { unit: 80, integration: 60, e2e: 'P0' },
      project_type: 'new', platforms: ['opencode'],
    };
    fs.writeFileSync(path.join(testDir, '.forge', 'config.json'), JSON.stringify(config));

    const progress = {
      version: '1.0', feature: 'test', status: 'idle', phase: 'brainstorming',
      created_at: '2026-05-21T08:00:00Z', updated_at: '2026-05-21T08:00:00Z',
      total_batches: 0, current_batch: 0, batches: [],
      verification: { status: 'pending', test_mode: 'normal', last_run: null, report_path: null },
    };
    fs.writeFileSync(path.join(testDir, '.forge', 'progress.json'), JSON.stringify(progress));

    const scenarios = {
      version: '1.0', feature: 'test', source: 'proposal.md',
      generated_at: '2026-05-21T08:15:00Z',
      scenarios: [{ id: 1, title: 'Test', given: 'Given', when: 'When', then: [{ assertion: 'Then', type: 'functional' }], testTypes: ['functional'], priority: 'P0' }],
    };
    fs.mkdirSync(path.join(testDir, 'docs', 'forge', 'changes', 'test'), { recursive: true });
    fs.writeFileSync(path.join(testDir, 'docs', 'forge', 'changes', 'test', 'scenarios.json'), JSON.stringify(scenarios));

    const result = await runValidate(testDir);
    expect(result.success).toBe(true);
    expect(result.output).toContain('scenarios.json');
  });
});
