import { readJson, writeJson, fileExists } from './filesystem';
import * as path from 'path';
import type { ProgressJson } from '../types';

export interface ProgressResult {
  success: boolean;
  error?: string;
}

export async function updateTaskProgress(
  projectRoot: string,
  taskId: number,
  status: 'done' | 'failed' | 'in_progress' | 'pending',
  commit?: string
): Promise<ProgressResult> {
  const progressPath = path.join(projectRoot, '.forge', 'progress.json');
  if (!(await fileExists(progressPath))) {
    return { success: false, error: 'No progress.json found' };
  }

  const progress = await readJson<ProgressJson>(progressPath);
  let taskFound = false;

  for (const batch of progress.batches || []) {
    for (const task of batch.tasks || []) {
      if (task.id === taskId) {
        task.status = status;
        if (commit) task.commit = commit;
        if (status === 'done' || status === 'failed') {
          task.completed_at = new Date().toISOString();
        }
        taskFound = true;
        break;
      }
    }
    if (taskFound) break;
  }

  if (!taskFound) {
    return { success: false, error: `Task ${taskId} not found` };
  }

  progress.updated_at = new Date().toISOString();
  await writeJson(progressPath, progress);

  return { success: true };
}

export async function updateBatchProgress(
  projectRoot: string,
  batchNumber: number,
  status: 'done' | 'failed' | 'in_progress' | 'pending'
): Promise<ProgressResult> {
  const progressPath = path.join(projectRoot, '.forge', 'progress.json');
  if (!(await fileExists(progressPath))) {
    return { success: false, error: 'No progress.json found' };
  }

  const progress = await readJson<ProgressJson>(progressPath);
  let batchFound = false;

  for (const batch of progress.batches || []) {
    if (batch.batch === batchNumber) {
      batch.status = status;
      if (status === 'done') {
        batch.completed_at = new Date().toISOString();
        if (batchNumber < progress.total_batches) {
          progress.current_batch = batchNumber + 1;
        }
      }
      batchFound = true;
      break;
    }
  }

  if (!batchFound) {
    return { success: false, error: `Batch ${batchNumber} not found` };
  }

  progress.updated_at = new Date().toISOString();
  await writeJson(progressPath, progress);

  return { success: true };
}

export async function getTaskStatus(projectRoot: string, taskId: number): Promise<string | null> {
  const progressPath = path.join(projectRoot, '.forge', 'progress.json');
  if (!(await fileExists(progressPath))) {
    return null;
  }

  const progress = await readJson<ProgressJson>(progressPath);
  for (const batch of progress.batches || []) {
    for (const task of batch.tasks || []) {
      if (task.id === taskId) {
        return task.status;
      }
    }
  }
  return null;
}
