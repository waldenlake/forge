import { readJson, fileExists } from '../utils/filesystem';
import { executeTask, TaskDefinition } from '../utils/executor';
import { updateTaskProgress } from '../utils/progress-tracker';
import * as path from 'path';
import type { ProgressJson } from '../types';

export interface ExecuteResult {
  success: boolean;
  output?: string;
  error?: string;
}

export interface ExecuteOptions {
  taskId?: number;
  batchId?: number;
}

export async function runExecute(projectRoot: string, subcommand: string, options?: ExecuteOptions): Promise<ExecuteResult> {
  switch (subcommand) {
    case 'task':
      return runExecuteTask(projectRoot, options?.taskId);
    case 'progress':
      return runShowProgress(projectRoot);
    case 'batch':
      return runExecuteBatch(projectRoot, options?.batchId);
    default:
      return { success: false, error: `Unknown subcommand: ${subcommand}` };
  }
}

async function runExecuteTask(projectRoot: string, taskId?: number): Promise<ExecuteResult> {
  if (!taskId) {
    return { success: false, error: 'Task ID is required. Usage: forge execute task --task-id <id>' };
  }

  const progressPath = path.join(projectRoot, '.forge', 'progress.json');
  if (!(await fileExists(progressPath))) {
    return { success: false, error: 'No progress.json found' };
  }

  const progress = await readJson<ProgressJson>(progressPath);

  let taskDef: TaskDefinition | null = null;
  for (const batch of progress.batches || []) {
    for (const task of batch.tasks || []) {
      if (task.id === taskId) {
        taskDef = {
          id: task.id,
          title: task.title,
          files: [],
          tddSteps: [],
          verificationSteps: [],
        };
        break;
      }
    }
    if (taskDef) break;
  }

  if (!taskDef) {
    return { success: false, error: `Task ${taskId} not found` };
  }

  const testCommand = 'npm test';
  await updateTaskProgress(projectRoot, taskId, 'in_progress');

  const result = await executeTask(projectRoot, taskDef, testCommand);

  if (result.success) {
    await updateTaskProgress(projectRoot, taskId, 'done', result.commit);
  } else {
    await updateTaskProgress(projectRoot, taskId, 'failed');
  }

  return result;
}

async function runShowProgress(projectRoot: string): Promise<ExecuteResult> {
  const progressPath = path.join(projectRoot, '.forge', 'progress.json');
  if (!(await fileExists(progressPath))) {
    return { success: false, error: 'No progress.json found' };
  }

  const progress = await readJson<ProgressJson>(progressPath);
  const lines: string[] = [];

  lines.push(`Feature: ${progress.feature}`);
  lines.push(`Status: ${progress.status}/${progress.phase}`);
  lines.push(`Batch: ${progress.current_batch}/${progress.total_batches}`);
  lines.push('');

  for (const batch of progress.batches || []) {
    lines.push(`Batch ${batch.batch} (${batch.status}):`);
    for (const task of batch.tasks || []) {
      const commitInfo = task.commit ? ` (${task.commit.substring(0, 7)})` : '';
      lines.push(`  - Task ${task.id}: ${task.title} [${task.status}]${commitInfo}`);
    }
    lines.push('');
  }

  return { success: true, output: lines.join('\n') };
}

async function runExecuteBatch(projectRoot: string, batchId?: number): Promise<ExecuteResult> {
  return { success: false, error: 'Batch execution not yet implemented' };
}
