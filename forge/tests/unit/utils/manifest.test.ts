import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generateManifest, getManifestDir, VALID_PLATFORMS } from '../../../src/utils/manifest';
import * as fs from 'fs';
import * as path from 'path';

describe('Manifest Utility', () => {
  const testDir = path.join(__dirname, '../../tmp-manifest-util');

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('getManifestDir', () => {
    it('should return correct directory for claude', () => {
      expect(getManifestDir(testDir, 'claude')).toBe(path.join(testDir, '.claude-plugin'));
    });

    it('should return correct directory for opencode', () => {
      expect(getManifestDir(testDir, 'opencode')).toBe(path.join(testDir, '.opencode'));
    });

    it('should return correct directory for codex', () => {
      expect(getManifestDir(testDir, 'codex')).toBe(path.join(testDir, '.codex-plugin'));
    });
  });

  describe('generateManifest', () => {
    it('should generate valid plugin.json for opencode', async () => {
      await generateManifest(testDir, 'opencode');
      const manifestPath = path.join(testDir, '.opencode', 'plugin.json');
      expect(fs.existsSync(manifestPath)).toBe(true);

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      expect(manifest.name).toBe('forge');
      expect(manifest.version).toBe('0.1.0');
      expect(manifest.skills).toHaveLength(5);
      expect(manifest.skills[0]).toEqual({ name: '/start', path: '~/.agents/skills/forge/start.md' });
    });

    it('should generate valid plugin.json for claude', async () => {
      await generateManifest(testDir, 'claude');
      const manifestPath = path.join(testDir, '.claude-plugin', 'plugin.json');
      expect(fs.existsSync(manifestPath)).toBe(true);
    });

    it('should reject invalid platform', async () => {
      await expect(generateManifest(testDir, 'invalid' as any)).rejects.toThrow('Unknown platform');
    });
  });

  describe('VALID_PLATFORMS', () => {
    it('should contain exactly 3 platforms', () => {
      expect(VALID_PLATFORMS).toEqual(['claude', 'opencode', 'codex']);
    });
  });
});
