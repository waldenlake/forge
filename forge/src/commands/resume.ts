import * as path from 'path';
import { readJson, fileExists } from '../utils/filesystem';
import type { ProgressJson } from '../types';

export interface ResumeResult {
  success: boolean;
  output?: string;
  error?: string;
}

export async function runResume(projectRoot: string): Promise<ResumeResult> {
  const progressPath = path.join(projectRoot, '.forge', 'progress.json');

  if (!(await fileExists(progressPath))) {
    return { success: false, error: 'No progress.json found. Run `forge init` first.' };
  }

  let progress: ProgressJson;
  try {
    progress = await readJson<ProgressJson>(progressPath);
  } catch (e) {
    return { success: false, error: `Invalid progress.json. File is corrupted: ${(e as Error).message}` };
  }

  const output = reconstructState(progress);
  return { success: true, output };
}

export async function readProgress(projectRoot: string): Promise<ProgressJson> {
  const progressPath = path.join(projectRoot, '.forge', 'progress.json');
  if (!(await fileExists(progressPath))) {
    throw new Error('No progress.json found. Run `forge init` first.');
  }
  try {
    return await readJson<ProgressJson>(progressPath);
  } catch (e) {
    if ((e as Error).message.includes('Failed to parse JSON')) {
      throw new Error('Invalid progress.json. File is corrupted.');
    }
    throw e;
  }
}

export function reconstructState(progress: ProgressJson): string {
  if (progress.status === 'idle' || !progress.feature) {
    return 'No active feature. Run `/start` to begin.';
  }

  const lines: string[] = [];
  lines.push(`## Resume: ${progress.feature}`);
  lines.push('');

  let doneCount = 0;
  let totalTasks = 0;
  let currentTaskTitle = '';
  let currentBatch: typeof progress.batches[number] | undefined;
  let currentTask: typeof progress.batches[number]['tasks'][number] | undefined;
  const failedTasks: string[] = [];
  const warnings: string[] = [];
  const doneBatchNums: string[] = [];
  const pendingBatchNums: string[] = [];

  for (const batch of progress.batches || []) {
    let batchHasInProgress = false;
    let batchHasPending = false;
    let batchIsDone = true;

    for (const task of batch.tasks || []) {
      totalTasks++;
      if (task.status === 'done') {
        doneCount++;
        if (!task.commit) {
          warnings.push(`WARNING: ${task.title} (task ${task.id}) marked as done but has no commit SHA. May need re-execution.`);
        }
      } else if (task.status === 'in_progress') {
        currentTaskTitle = task.title;
        currentTask = task;
        batchHasInProgress = true;
        batchIsDone = false;
      } else if (task.status === 'failed') {
        failedTasks.push(`${task.title} (task ${task.id})`);
        batchIsDone = false;
      } else {
        batchHasPending = true;
        batchIsDone = false;
      }
    }

    if (batchIsDone) {
      doneBatchNums.push(String(batch.batch));
    }
    if (batchHasInProgress && !currentBatch) {
      currentBatch = batch;
    }
    if (batchHasPending && !batchHasInProgress) {
      pendingBatchNums.push(String(batch.batch));
    }
  }

  if (doneBatchNums.length > 0) {
    lines.push(`Completed: batch ${doneBatchNums.join(', ')} (${doneCount} tasks done)`);
  }

  if (failedTasks.length > 0) {
    lines.push(`Failed: ${failedTasks.join(', ')}`);
  }

  if (currentBatch) {
    if (currentTask) {
      lines.push(`In progress: batch ${currentBatch.batch}, task ${currentTask.id} - ${currentTask.title}`);
    } else {
      lines.push(`Ready: batch ${currentBatch.batch} (all tasks pending)`);
    }
  }

  if (pendingBatchNums.length > 0) {
    lines.push(`Pending: batch ${pendingBatchNums.join(', ')}`);
  }

  lines.push('');
  lines.push(`Progress: ${doneCount}/${totalTasks} tasks complete`);
  lines.push('');

  if (warnings.length > 0) {
    lines.push('State Inconsistencies:');
    warnings.forEach(w => lines.push(`  - ${w}`));
    lines.push('');
  }

  lines.push('**Next action:**');
  if (currentBatch && currentTaskTitle) {
    lines.push(`Run /next to continue with: ${currentTaskTitle}`);
  } else if (currentBatch) {
    lines.push(`Run /next to start batch ${currentBatch.batch}`);
  } else if (pendingBatchNums.length > 0) {
    lines.push(`Run /next to start batch ${pendingBatchNums[0]}`);
  } else {
    lines.push('All batches complete. Run /done to finish this feature.');
  }

  return lines.join('\n');
}
