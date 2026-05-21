import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { runInit } from '../../../src/commands/init';

const testDir = path.join(__dirname, '__test_init__');

describe('forge init', () => {
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

  it('should create directory structure for new project', async () => {
    const output = await runInit(testDir, { platforms: ['opencode'] });

    expect(fs.existsSync(path.join(testDir, 'docs', 'forge', 'specs'))).toBe(true);
    expect(fs.existsSync(path.join(testDir, 'docs', 'forge', 'changes'))).toBe(true);
    expect(fs.existsSync(path.join(testDir, 'docs', 'forge', 'changes', 'archive'))).toBe(true);
    expect(fs.existsSync(path.join(testDir, 'docs', 'forge', 'decisions'))).toBe(true);
    expect(fs.existsSync(path.join(testDir, '.forge', 'config.json'))).toBe(true);
    expect(fs.existsSync(path.join(testDir, '.forge', 'progress.json'))).toBe(true);
  });

  it('should generate valid config.json', async () => {
    await runInit(testDir, { platforms: ['opencode'] });

    const configPath = path.join(testDir, '.forge', 'config.json');
    const content = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(content.version).toBe('1.0');
    expect(content.test_mode).toBe('normal');
    expect(content.project_type).toBe('new');
    expect(content.platforms).toContain('opencode');
  });

  it('should generate valid progress.json', async () => {
    await runInit(testDir, { platforms: ['opencode'] });

    const progressPath = path.join(testDir, '.forge', 'progress.json');
    const content = JSON.parse(fs.readFileSync(progressPath, 'utf-8'));
    expect(content.version).toBe('1.0');
    expect(content.status).toBe('idle');
  });

  it('should detect existing project when .git exists', async () => {
    fs.mkdirSync(path.join(testDir, '.git'));
    await runInit(testDir, { platforms: ['opencode'] });

    const configPath = path.join(testDir, '.forge', 'config.json');
    const content = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(content.project_type).toBe('existing');
  });

  it('should generate platform manifest', async () => {
    await runInit(testDir, { platforms: ['opencode'] });

    const manifestPath = path.join(testDir, '.opencode', 'plugin.json');
    expect(fs.existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(manifest.name).toBe('forge');
    expect(manifest.skills).toHaveLength(5);
  });

  it('should generate Claude Code manifest when platform includes claude', async () => {
    await runInit(testDir, { platforms: ['claude'] });

    const manifestPath = path.join(testDir, '.claude-plugin', 'plugin.json');
    expect(fs.existsSync(manifestPath)).toBe(true);
  });

  it('should return success message', async () => {
    const output = await runInit(testDir, { platforms: ['opencode'] });
    expect(output.success).toBe(true);
    expect(output.message).toContain('Forge initialized');
  });
});
