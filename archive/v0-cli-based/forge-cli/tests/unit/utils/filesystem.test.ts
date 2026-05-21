import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  ensureDir,
  writeJson,
  readJson,
  fileExists,
  readTextFile,
  writeTextFile,
  moveDir,
} from '../../../src/utils/filesystem';

const testDir = path.join(__dirname, '__test_fs__');

describe('Filesystem Utilities', () => {
  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  describe('ensureDir', () => {
    it('should create directory if it does not exist', async () => {
      const dir = path.join(testDir, 'new-dir');
      await ensureDir(dir);
      expect(fs.existsSync(dir)).toBe(true);
    });

    it('should not throw if directory already exists', async () => {
      fs.mkdirSync(testDir, { recursive: true });
      await expect(ensureDir(testDir)).resolves.not.toThrow();
    });

    it('should create nested directories', async () => {
      const dir = path.join(testDir, 'a', 'b', 'c');
      await ensureDir(dir);
      expect(fs.existsSync(dir)).toBe(true);
    });
  });

  describe('writeJson / readJson', () => {
    it('should write and read JSON correctly', async () => {
      const filePath = path.join(testDir, 'test.json');
      const data = { name: 'test', value: 42 };
      await writeJson(filePath, data);
      const result = await readJson(filePath);
      expect(result).toEqual(data);
    });

    it('should create parent directories when writing JSON', async () => {
      const filePath = path.join(testDir, 'nested', 'test.json');
      const data = { key: 'value' };
      await writeJson(filePath, data);
      expect(fs.existsSync(filePath)).toBe(true);
      const result = await readJson(filePath);
      expect(result).toEqual(data);
    });
  });

  describe('fileExists', () => {
    it('should return true for existing file', async () => {
      const filePath = path.join(testDir, 'exists.txt');
      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(filePath, 'test');
      expect(await fileExists(filePath)).toBe(true);
    });

    it('should return false for non-existing file', async () => {
      expect(await fileExists(path.join(testDir, 'nope.txt'))).toBe(false);
    });
  });

  describe('readTextFile / writeTextFile', () => {
    it('should write and read text correctly', async () => {
      const filePath = path.join(testDir, 'text.txt');
      await writeTextFile(filePath, 'hello world');
      const content = await readTextFile(filePath);
      expect(content).toBe('hello world');
    });

    it('should create parent directories when writing text', async () => {
      const filePath = path.join(testDir, 'nested', 'text.txt');
      await writeTextFile(filePath, 'nested content');
      expect(fs.existsSync(filePath)).toBe(true);
      const content = await readTextFile(filePath);
      expect(content).toBe('nested content');
    });
  });

  describe('readJson error handling', () => {
    it('should throw with file path context on invalid JSON', async () => {
      fs.mkdirSync(testDir, { recursive: true });
      const filePath = path.join(testDir, 'invalid.json');
      fs.writeFileSync(filePath, 'not json');
      await expect(readJson(filePath)).rejects.toThrow(`Failed to parse JSON in ${filePath}`);
    });

    it('should throw on non-existent file', async () => {
      const filePath = path.join(testDir, 'missing.json');
      await expect(readJson(filePath)).rejects.toThrow();
    });
  });

  describe('moveDir', () => {
    it('should move directory contents', async () => {
      const src = path.join(testDir, 'src-dir');
      const dest = path.join(testDir, 'dest-dir');
      fs.mkdirSync(src, { recursive: true });
      fs.writeFileSync(path.join(src, 'file.txt'), 'content');
      await moveDir(src, dest);
      expect(fs.existsSync(path.join(dest, 'file.txt'))).toBe(true);
      expect(fs.existsSync(src)).toBe(false);
    });
  });
});
