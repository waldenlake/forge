import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  detectGit,
  detectSuperpowers,
  detectTestFramework,
  TestFrameworkInfo,
} from '../../../src/utils/detect';

const testDir = path.join(__dirname, '__test_detect__');

describe('Environment Detection', () => {
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

  describe('detectGit', () => {
    it('should return true when .git directory exists', async () => {
      fs.mkdirSync(path.join(testDir, '.git'));
      const result = await detectGit(testDir);
      expect(result).toBe(true);
    });

    it('should return false when .git directory does not exist', async () => {
      const result = await detectGit(testDir);
      expect(result).toBe(false);
    });
  });

  describe('detectSuperpowers', () => {
    let originalHome: string | undefined;

    beforeEach(() => {
      originalHome = process.env.HOME;
    });

    afterEach(() => {
      if (originalHome !== undefined) {
        process.env.HOME = originalHome;
      } else {
        delete process.env.HOME;
      }
    });

    it('should return true when superpowers skills exist', async () => {
      process.env.HOME = testDir;
      const skillsDir = path.join(testDir, '.agents', 'skills', 'superpowers');
      fs.mkdirSync(skillsDir, { recursive: true });
      const result = await detectSuperpowers(testDir);
      expect(result).toBe(true);
    });

    it('should return false when superpowers skills do not exist', async () => {
      process.env.HOME = testDir;
      const result = await detectSuperpowers(testDir);
      expect(result).toBe(false);
    });
  });

  describe('detectTestFramework', () => {
    it('should detect npm test from package.json with vitest', async () => {
      const pkg = {
        scripts: { test: 'vitest run' },
        devDependencies: { vitest: '^1.0.0' },
      };
      fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify(pkg));
      const result = await detectTestFramework(testDir);
      expect(result).toEqual({
        command: 'npm test',
        framework: 'vitest',
      });
    });

    it('should detect pytest from pytest.ini', async () => {
      fs.writeFileSync(path.join(testDir, 'pytest.ini'), '');
      const result = await detectTestFramework(testDir);
      expect(result).toEqual({
        command: 'pytest',
        framework: 'pytest',
      });
    });

    it('should detect go test from go.mod', async () => {
      fs.writeFileSync(path.join(testDir, 'go.mod'), 'module test');
      const result = await detectTestFramework(testDir);
      expect(result).toEqual({
        command: 'go test',
        framework: 'go test',
      });
    });

    it('should detect cargo test from Cargo.toml', async () => {
      fs.writeFileSync(path.join(testDir, 'Cargo.toml'), '[package]');
      const result = await detectTestFramework(testDir);
      expect(result).toEqual({
        command: 'cargo test',
        framework: 'cargo test',
      });
    });

    it('should return null when no test framework detected', async () => {
      const result = await detectTestFramework(testDir);
      expect(result).toBeNull();
    });
  });
});
