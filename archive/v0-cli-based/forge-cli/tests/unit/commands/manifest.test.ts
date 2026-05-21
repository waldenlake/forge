import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runManifest } from '../../../src/commands/manifest';
import * as fs from 'fs';
import * as path from 'path';

describe('Manifest Management', () => {
  const testDir = path.join(__dirname, '../../tmp-manifest');

  beforeEach(() => {
    fs.mkdirSync(path.join(testDir, '.forge'), { recursive: true });
    const config = {
      version: '1.0', test_mode: 'normal', gstack_installed: false, batch_size: 6,
      test_command: 'npm test', test_framework: 'vitest',
      test_coverage: { unit: 80, integration: 60, e2e: 'P0' },
      project_type: 'new', platforms: ['opencode'],
    };
    fs.writeFileSync(path.join(testDir, '.forge', 'config.json'), JSON.stringify(config));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('generate', () => {
    it('should generate manifests for all configured platforms', async () => {
      const result = await runManifest(testDir, 'generate');
      expect(result.success).toBe(true);
      expect(fs.existsSync(path.join(testDir, '.opencode', 'plugin.json'))).toBe(true);
    });
  });

  describe('add', () => {
    it('should add a platform manifest', async () => {
      const result = await runManifest(testDir, 'add', { platform: 'claude' });
      expect(result.success).toBe(true);
      expect(fs.existsSync(path.join(testDir, '.claude-plugin', 'plugin.json'))).toBe(true);
    });

    it('should fail for unknown platform', async () => {
      const result = await runManifest(testDir, 'add', { platform: 'unknown' });
      expect(result.success).toBe(false);
    });
  });

  describe('remove', () => {
    it('should remove a platform manifest', async () => {
      await runManifest(testDir, 'add', { platform: 'claude' });
      expect(fs.existsSync(path.join(testDir, '.claude-plugin', 'plugin.json'))).toBe(true);

      const result = await runManifest(testDir, 'remove', { platform: 'claude' });
      expect(result.success).toBe(true);
      expect(fs.existsSync(path.join(testDir, '.claude-plugin', 'plugin.json'))).toBe(false);
    });
  });

  describe('list', () => {
    it('should list installed manifests', async () => {
      await runManifest(testDir, 'add', { platform: 'claude' });
      const result = await runManifest(testDir, 'list');
      expect(result.success).toBe(true);
      expect(result.output).toContain('opencode');
      expect(result.output).toContain('claude');
    });
  });
});
