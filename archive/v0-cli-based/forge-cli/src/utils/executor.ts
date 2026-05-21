import { fileExists, writeTextFile, ensureDir } from './filesystem';
import { runTestsWithAutoFix } from './test-runner';
import * as path from 'path';
import { rm } from 'fs/promises';

export interface FileAction {
  path: string;
  action: 'create' | 'modify' | 'delete';
  content?: string;
}

export interface TDDStep {
  description: string;
  testFile: string;
  testContent: string;
}

export interface TaskDefinition {
  id: number;
  title: string;
  files: FileAction[];
  tddSteps: TDDStep[];
  verificationSteps: string[];
}

export interface ExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  taskId: number;
  commit?: string;
}

export async function executeTask(
  projectRoot: string,
  task: TaskDefinition,
  testCommand: string
): Promise<ExecutionResult> {
  try {
    for (const step of task.tddSteps) {
      const testPath = path.join(projectRoot, step.testFile);
      await ensureDir(path.dirname(testPath));
      await writeTextFile(testPath, step.testContent);
    }

    if (task.tddSteps.length > 0) {
      await runTestsWithAutoFix(projectRoot, testCommand, async () => {
        return { success: false, error: 'Expected failure (red phase)' };
      }, { maxRounds: 1 });
    }

    for (const file of task.files) {
      const filePath = path.join(projectRoot, file.path);
      if (file.action === 'create' || file.action === 'modify') {
        await ensureDir(path.dirname(filePath));
        await writeTextFile(filePath, file.content || '');
      } else if (file.action === 'delete' && await fileExists(filePath)) {
        await rm(filePath, { force: true });
      }
    }

    const finalTest = await runTestsWithAutoFix(projectRoot, testCommand, async (errorOutput) => {
      return { success: false, error: 'Auto-fix not implemented yet' };
    }, { maxRounds: 3 });

    if (!finalTest.success) {
      return {
        success: false,
        error: `Task ${task.id} (${task.title}) failed: ${finalTest.error}`,
        taskId: task.id,
      };
    }

    return {
      success: true,
      output: `Task ${task.id} (${task.title}) completed successfully`,
      taskId: task.id,
    };
  } catch (e) {
    return {
      success: false,
      error: `Task ${task.id} (${task.title}) failed: ${(e as Error).message}`,
      taskId: task.id,
    };
  }
}
