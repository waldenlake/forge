import * as path from 'path';
import { readJson, fileExists } from '../utils/filesystem';
import type { ProgressJson } from '../types';

export interface StatusResult {
  success: boolean;
  output?: string;
  error?: string;
}

export async function runStatus(projectRoot: string): Promise<StatusResult> {
  const progressPath = path.join(projectRoot, '.forge', 'progress.json');

  if (!(await fileExists(progressPath))) {
    return { success: false, error: 'progress.json not found. Run: forge init' };
  }

  const progress = await readJson<ProgressJson>(progressPath);

  if (progress.status === 'idle') {
    return {
      success: true,
      output: 'Forge Status\n============\nNo active feature\n\nRun /start to begin a new feature.',
    };
  }

  const lines: string[] = [
    'Forge Status',
    '============',
    `Feature: ${progress.feature}`,
    `Status: ${progress.status}`,
    `Phase: ${progress.phase}`,
  ];

  if (progress.total_batches > 0) {
    lines.push(`Progress: batch ${progress.current_batch}/${progress.total_batches}`);
    lines.push('');

    for (const batch of progress.batches) {
      const doneCount = batch.tasks.filter((t) => t.status === 'done').length;
      const totalCount = batch.tasks.length;
      const icon = batch.status === 'done' ? '[x]' : batch.status === 'in_progress' ? '[~]' : '[ ]';
      lines.push(`${icon} Batch ${batch.batch}: ${batch.status} (${doneCount}/${totalCount} tasks done)`);
    }
  }

  lines.push('');
  lines.push(`Test mode: ${progress.verification.test_mode}`);

  return { success: true, output: lines.join('\n') };
}
