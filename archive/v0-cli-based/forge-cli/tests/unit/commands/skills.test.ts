import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runSkillsInstall } from '../../../src/commands/skills';
import * as fs from 'fs';
import * as path from 'path';

describe('SkillsInstall', () => {
  const testDir = path.join(__dirname, '../../tmp-skills');
  const userSkillsDir = path.join(__dirname, '../../tmp-user-skills');

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
    fs.mkdirSync(path.join(testDir, '.forge'), { recursive: true });
    fs.mkdirSync(userSkillsDir, { recursive: true });
    for (const f of ['start.md', 'next.md', 'resume.md', 'done.md', 'bugfix.md', 'scenarios.md', 'progress-tracking.md', 'session-handoff.md']) {
      fs.writeFileSync(path.join(userSkillsDir, f), `# ${f}\nContent for ${f}`);
    }
    process.env.FORGE_USER_SKILLS_DIR = userSkillsDir;
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    fs.rmSync(userSkillsDir, { recursive: true, force: true });
    delete process.env.FORGE_USER_SKILLS_DIR;
  });

  it('should install skills for detected platforms', async () => {
    const config = {
      version: '1.0' as const,
      test_mode: 'normal' as const,
      gstack_installed: false,
      batch_size: 6,
      test_command: 'npm test',
      test_framework: 'vitest',
      test_coverage: { unit: 80, integration: 60, e2e: 'P0' as const },
      project_type: 'new' as const,
      platforms: ['opencode'],
    };
    fs.writeFileSync(path.join(testDir, '.forge', 'config.json'), JSON.stringify(config));

    const result = await runSkillsInstall(testDir);
    expect(result.success).toBe(true);
    expect(result.output).toContain('skills installed');
  });

  it('should install for multiple platforms', async () => {
    const config = {
      version: '1.0' as const,
      test_mode: 'normal' as const,
      gstack_installed: false,
      batch_size: 6,
      test_command: 'npm test',
      test_framework: 'vitest',
      test_coverage: { unit: 80, integration: 60, e2e: 'P0' as const },
      project_type: 'new' as const,
      platforms: ['opencode', 'claude'],
    };
    fs.writeFileSync(path.join(testDir, '.forge', 'config.json'), JSON.stringify(config));

    const result = await runSkillsInstall(testDir);
    expect(result.success).toBe(true);
  });

  it('should fail if config.json not found', async () => {
    const result = await runSkillsInstall(testDir);
    expect(result.success).toBe(false);
  });

  it('should copy skill files to platform directories', async () => {
    const config = {
      version: '1.0' as const,
      test_mode: 'normal' as const,
      gstack_installed: false,
      batch_size: 6,
      test_command: 'npm test',
      test_framework: 'vitest',
      test_coverage: { unit: 80, integration: 60, e2e: 'P0' as const },
      project_type: 'new' as const,
      platforms: ['opencode'],
    };
    fs.writeFileSync(path.join(testDir, '.forge', 'config.json'), JSON.stringify(config));

    await runSkillsInstall(testDir);

    const skillDir = path.join(testDir, '.opencode', 'skills', 'forge');
    expect(fs.existsSync(path.join(skillDir, 'start.md'))).toBe(true);
    expect(fs.existsSync(path.join(skillDir, 'next.md'))).toBe(true);
  });

  it('should copy skills to claude platform directory', async () => {
    const config = {
      version: '1.0' as const,
      test_mode: 'normal' as const,
      gstack_installed: false,
      batch_size: 6,
      test_command: 'npm test',
      test_framework: 'vitest',
      test_coverage: { unit: 80, integration: 60, e2e: 'P0' as const },
      project_type: 'new' as const,
      platforms: ['claude'],
    };
    fs.writeFileSync(path.join(testDir, '.forge', 'config.json'), JSON.stringify(config));

    await runSkillsInstall(testDir);

    const skillDir = path.join(testDir, '.claude', 'skills', 'forge');
    expect(fs.existsSync(path.join(skillDir, 'start.md'))).toBe(true);
  });
});
