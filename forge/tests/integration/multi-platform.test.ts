import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

describe('Multi-Platform Integration', () => {
  const testDir = path.join(__dirname, '../../tmp-integration-multi');

  beforeEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  function forge(args: string, cwd?: string) {
    return execSync(
      `npx tsx ${path.join(__dirname, '../../src/index.ts')} ${args}`,
      {
        cwd: cwd || testDir,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );
  }

  function forgeAllowFail(args: string, cwd?: string) {
    try {
      return forge(args, cwd);
    } catch (e: any) {
      return e.stdout || e.stderr || '';
    }
  }

  it('should init with all platforms and generate manifests', () => {
    forge('init --platforms claude,opencode,codex');

    expect(
      fs.existsSync(path.join(testDir, '.forge', 'config.json'))
    ).toBe(true);
    expect(
      fs.existsSync(path.join(testDir, '.claude-plugin', 'plugin.json'))
    ).toBe(true);
    expect(
      fs.existsSync(path.join(testDir, '.opencode', 'plugin.json'))
    ).toBe(true);
    expect(
      fs.existsSync(path.join(testDir, '.codex-plugin', 'plugin.json'))
    ).toBe(true);
  });

  it('should list installed manifests', () => {
    forge('init --platforms opencode,claude');
    const output = forge('manifest list');
    expect(output).toContain('opencode: installed');
    expect(output).toContain('claude: installed');
  });

  it('should add and remove platform manifests', () => {
    forge('init --platforms opencode');
    forge('manifest add claude');
    expect(
      fs.existsSync(path.join(testDir, '.claude-plugin', 'plugin.json'))
    ).toBe(true);

    forge('manifest remove claude');
    expect(fs.existsSync(path.join(testDir, '.claude-plugin'))).toBe(false);
  });

  it('should install skills when source files exist', () => {
    forge('init --platforms opencode');

    const homeDir = process.env.USERPROFILE || process.env.HOME || '';
    const userSkillsDir = path.join(homeDir, '.agents', 'skills', 'forge');
    fs.mkdirSync(userSkillsDir, { recursive: true });
    fs.writeFileSync(path.join(userSkillsDir, 'start.md'), '# Start');
    fs.writeFileSync(path.join(userSkillsDir, 'next.md'), '# Next');

    forge('skills install');

    expect(
      fs.existsSync(
        path.join(testDir, '.opencode', 'skills', 'forge', 'start.md')
      )
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(testDir, '.opencode', 'skills', 'forge', 'next.md')
      )
    ).toBe(true);
  });

  it('should execute progress command', () => {
    forge('init --platforms opencode');

    const progress = {
      version: '1.0',
      feature: 'test-feature',
      status: 'active',
      phase: 'implementation',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      total_batches: 1,
      current_batch: 1,
      batches: [
        {
          batch: 1,
          status: 'in_progress',
          tasks: [
            {
              id: 1,
              title: 'Create hello file',
              status: 'done',
            },
          ],
        },
      ],
      verification: {
        status: 'pending',
        test_mode: 'normal',
        last_run: null,
        report_path: null,
      },
    };

    fs.writeFileSync(
      path.join(testDir, '.forge', 'progress.json'),
      JSON.stringify(progress, null, 2)
    );

    const output = forge('execute progress');
    expect(output).toContain('test-feature');
    expect(output).toContain('Create hello file');
  });

  it('should regenerate manifests after config change', () => {
    forge('init --platforms opencode');
    forge('manifest add claude');

    expect(
      fs.existsSync(path.join(testDir, '.claude-plugin', 'plugin.json'))
    ).toBe(true);

    forge('manifest generate');

    expect(
      fs.existsSync(path.join(testDir, '.opencode', 'plugin.json'))
    ).toBe(true);
    expect(
      fs.existsSync(path.join(testDir, '.claude-plugin', 'plugin.json'))
    ).toBe(true);
  });

  it('should handle invalid platform gracefully', () => {
    const output = forgeAllowFail('manifest add invalid-platform');
    expect(output).toContain('Unknown platform');
  });
});
