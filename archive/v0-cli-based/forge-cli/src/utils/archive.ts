// src/utils/archive.ts
import { fileExists, listDir, ensureDir } from './filesystem';
import * as path from 'path';

export async function createArchivePath(projectRoot: string, featureSlug: string, date: string): Promise<string> {
  const archiveDir = path.join(projectRoot, 'docs', 'forge', 'changes', 'archive');
  let archivePath = path.join(archiveDir, `${date}-${featureSlug}`);

  // Handle name collision
  if (await fileExists(archivePath)) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    archivePath = path.join(archiveDir, `${date}-${timestamp}-${featureSlug}`);
  }

  await ensureDir(archivePath);
  return archivePath;
}

export async function listArchivedFeatures(projectRoot: string): Promise<string[]> {
  const archiveDir = path.join(projectRoot, 'docs', 'forge', 'changes', 'archive');
  if (!(await fileExists(archiveDir))) {
    return [];
  }

  const entries = await listDir(archiveDir);
  return entries.filter(entry => {
    const fullPath = path.join(archiveDir, entry);
    // Filter to only directories (simple heuristic: entries with date prefix pattern)
    return /^\d{4}-\d{2}-\d{2}-/.test(entry);
  });
}

export async function getFeatureArchive(projectRoot: string, featureSlug: string): Promise<string | null> {
  const archived = await listArchivedFeatures(projectRoot);
  const match = archived.find(entry => entry.endsWith(`-${featureSlug}`));
  if (!match) {
    return null;
  }
  return path.join(projectRoot, 'docs', 'forge', 'changes', 'archive', match);
}
