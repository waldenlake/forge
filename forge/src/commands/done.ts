import { fileExists, readJson, writeJson, ensureDir, copyFile, moveDir } from '../utils/filesystem';
import * as path from 'path';
import type { ProgressJson } from '../types';

export interface DoneResult {
  success: boolean;
  output?: string;
  error?: string;
}

export async function runDone(projectRoot: string, subcommand: string, options?: { date?: string }): Promise<DoneResult> {
  switch (subcommand) {
    case 'validate':
      return runValidate(projectRoot);
    case 'archive':
      return runArchive(projectRoot, options?.date || new Date().toISOString().split('T')[0]);
    case 'reset':
      return runReset(projectRoot);
    default:
      return { success: false, error: `Unknown subcommand: ${subcommand}` };
  }
}

async function runValidate(projectRoot: string): Promise<DoneResult> {
  const progressPath = path.join(projectRoot, '.forge', 'progress.json');
  if (!(await fileExists(progressPath))) {
    return { success: false, error: 'No progress.json found. Run `forge init` first.' };
  }

  const progress = await readJson<ProgressJson>(progressPath);
  const errors: string[] = [];
  const deferred: { id: number; title: string }[] = [];

  if (progress.verification?.status !== 'passed') {
    errors.push('Verification has not passed. Run full test suite before marking done.');
  }

  for (const batch of progress.batches || []) {
    for (const task of batch.tasks || []) {
      if (task.status === 'done') continue;
      if (task.status === 'deferred') {
        deferred.push({ id: task.id, title: task.title });
        continue;
      }
      errors.push(`Task ${task.id} (${task.title}) is not done (status: ${task.status})`);
    }
  }

  if (errors.length > 0) {
    return { success: false, error: errors.join('\n') };
  }

  let output = 'All tasks complete. Verification passed.';
  if (deferred.length > 0) {
    output += '\nDeferred tasks (deferred): ' + deferred.map(d => `Task ${d.id} (${d.title})`).join(', ');
  }
  return { success: true, output };
}

async function runArchive(projectRoot: string, date: string): Promise<DoneResult> {
  const progressPath = path.join(projectRoot, '.forge', 'progress.json');
  if (!(await fileExists(progressPath))) {
    return { success: false, error: 'No progress.json found. Run `forge init` first.' };
  }

  const progress = await readJson<ProgressJson>(progressPath);
  const featureSlug = progress.feature;
  if (!featureSlug) {
    return { success: false, error: 'No active feature to archive.' };
  }

  const changesDir = path.join(projectRoot, 'docs', 'forge', 'changes');
  const featureDir = path.join(changesDir, featureSlug);
  const archiveDir = path.join(changesDir, 'archive', `${date}-${featureSlug}`);
  const specsDir = path.join(projectRoot, 'docs', 'forge', 'specs');

  await ensureDir(archiveDir);
  await ensureDir(specsDir);

  const scenariosPath = path.join(featureDir, 'scenarios.md');
  if (await fileExists(scenariosPath)) {
    const destPath = path.join(specsDir, `${featureSlug}-scenarios.md`);
    await copyFile(scenariosPath, destPath);
  }

  await moveDir(featureDir, archiveDir);

  return { success: true, output: `Archived ${featureSlug} to ${archiveDir}` };
}

async function runReset(projectRoot: string): Promise<DoneResult> {
  const progressPath = path.join(projectRoot, '.forge', 'progress.json');
  if (!(await fileExists(progressPath))) {
    return { success: false, error: 'No progress.json found. Run `forge init` first.' };
  }

  const progress = await readJson<ProgressJson>(progressPath);

  progress.feature = '';
  progress.status = 'idle';
  progress.phase = 'brainstorming';
  progress.total_batches = 0;
  progress.current_batch = 0;
  progress.batches = [];
  progress.verification = { status: 'pending', test_mode: progress.verification?.test_mode || 'normal', last_run: null, report_path: null };
  progress.updated_at = new Date().toISOString();

  await writeJson(progressPath, progress);

  return { success: true, output: 'Progress reset to idle state.' };
}
