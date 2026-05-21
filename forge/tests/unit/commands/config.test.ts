import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { runConfigGet, runConfigSet, runConfigList } from '../../../src/commands/config';

const testDir = path.join(__dirname, '__test_config__');

const defaultConfig = {
  version: '1.0',
  test_mode: 'normal',
  gstack_installed: false,
  batch_size: 6,
  test_command: 'npm test',
  test_framework: 'vitest',
  test_coverage: { unit: 80, integration: 60, e2e: 'P0' },
  project_type: 'new',
  platforms: ['opencode'],
};

describe('forge config', () => {
  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(path.join(testDir, '.forge'), { recursive: true });
    fs.writeFileSync(
      path.join(testDir, '.forge', 'config.json'),
      JSON.stringify(defaultConfig),
    );
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  describe('config get', () => {
    it('should get top-level value', async () => {
      const result = await runConfigGet(testDir, 'test_mode');
      expect(result.success).toBe(true);
      expect(result.value).toBe('normal');
    });

    it('should get nested value with dot notation', async () => {
      const result = await runConfigGet(testDir, 'test_coverage.unit');
      expect(result.success).toBe(true);
      expect(result.value).toBe(80);
    });

    it('should return error for missing key', async () => {
      const result = await runConfigGet(testDir, 'nonexistent');
      expect(result.success).toBe(false);
    });
  });

  describe('config set', () => {
    it('should set top-level value', async () => {
      const result = await runConfigSet(testDir, 'test_mode', 'enhanced');
      expect(result.success).toBe(true);
      const config = JSON.parse(fs.readFileSync(path.join(testDir, '.forge', 'config.json'), 'utf-8'));
      expect(config.test_mode).toBe('enhanced');
    });

    it('should set nested value with dot notation', async () => {
      const result = await runConfigSet(testDir, 'test_coverage.unit', 90);
      expect(result.success).toBe(true);
      const config = JSON.parse(fs.readFileSync(path.join(testDir, '.forge', 'config.json'), 'utf-8'));
      expect(config.test_coverage.unit).toBe(90);
    });
  });

  describe('config list', () => {
    it('should list all config values', async () => {
      const result = await runConfigList(testDir);
      expect(result.success).toBe(true);
      expect(result.output).toContain('test_mode');
      expect(result.output).toContain('batch_size');
    });
  });
});
