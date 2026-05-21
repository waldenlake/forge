// tests/unit/utils/archive.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createArchivePath, listArchivedFeatures, getFeatureArchive } from '../../../src/utils/archive';
import * as fs from 'fs';
import * as path from 'path';

describe('Archive Utility', () => {
  const testDir = path.join(__dirname, '../../tmp-archive-test');

  beforeEach(() => {
    fs.mkdirSync(path.join(testDir, 'docs', 'forge', 'changes', 'archive'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('createArchivePath', () => {
    it('should generate archive path with date prefix', async () => {
      const archivePath = await createArchivePath(testDir, 'user-login', '2026-05-21');
      expect(archivePath).toContain('2026-05-21-user-login');
      expect(archivePath).toContain('archive');
      expect(fs.existsSync(archivePath)).toBe(true);
    });

    it('should handle name collisions by appending timestamp', async () => {
      const existingPath = path.join(testDir, 'docs', 'forge', 'changes', 'archive', '2026-05-21-user-login');
      fs.mkdirSync(existingPath, { recursive: true });

      const archivePath = await createArchivePath(testDir, 'user-login', '2026-05-21');
      expect(archivePath).toContain('2026-05-21-');
      expect(archivePath).not.toBe(existingPath);
      expect(fs.existsSync(archivePath)).toBe(true);
    });
  });

  describe('listArchivedFeatures', () => {
    it('should return list of archived features', async () => {
      fs.mkdirSync(path.join(testDir, 'docs', 'forge', 'changes', 'archive', '2026-05-20-feature-a'), { recursive: true });
      fs.mkdirSync(path.join(testDir, 'docs', 'forge', 'changes', 'archive', '2026-05-21-feature-b'), { recursive: true });

      const archived = await listArchivedFeatures(testDir);
      expect(archived).toHaveLength(2);
      expect(archived).toContain('2026-05-20-feature-a');
      expect(archived).toContain('2026-05-21-feature-b');
    });

    it('should return empty array when no archives exist', async () => {
      // Archive dir exists but is empty (created in beforeEach)
      const archived = await listArchivedFeatures(testDir);
      expect(archived).toHaveLength(0);
    });

    it('should return empty array when archive dir does not exist', async () => {
      const noArchiveDir = path.join(testDir, 'no-archive');
      const archived = await listArchivedFeatures(noArchiveDir);
      expect(archived).toHaveLength(0);
    });
  });

  describe('getFeatureArchive', () => {
    it('should return archive path for a known feature', async () => {
      const archivePath = path.join(testDir, 'docs', 'forge', 'changes', 'archive', '2026-05-21-user-login');
      fs.mkdirSync(archivePath, { recursive: true });

      const result = await getFeatureArchive(testDir, 'user-login');
      expect(result).toBe(archivePath);
    });

    it('should return null for unknown feature', async () => {
      const result = await getFeatureArchive(testDir, 'nonexistent');
      expect(result).toBeNull();
    });
  });
});
