import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { executeTask, TaskDefinition } from '../../../src/utils/executor';
import * as fs from 'fs';
import * as path from 'path';

const testDir = path.join(__dirname, '__test_executor__');

describe('Task Executor', () => {
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

  describe('executeTask', () => {
    it('should execute a task and return success', async () => {
      const task: TaskDefinition = {
        id: 1,
        title: 'Create utility function',
        files: [{ path: 'src/utils/hello.ts', action: 'create', content: 'export function hello() { return "hello"; }' }],
        tddSteps: [],
        verificationSteps: [],
      };

      const result = await executeTask(testDir, task, 'echo test');
      expect(result.success).toBe(true);
      expect(fs.existsSync(path.join(testDir, 'src', 'utils', 'hello.ts'))).toBe(true);
    });

    it('should handle file creation with nested directories', async () => {
      const task: TaskDefinition = {
        id: 1,
        title: 'Create nested file',
        files: [{ path: 'src/deep/nested/file.ts', action: 'create', content: 'export const value = 42;' }],
        tddSteps: [],
        verificationSteps: [],
      };

      const result = await executeTask(testDir, task, 'echo test');
      expect(result.success).toBe(true);
      expect(fs.existsSync(path.join(testDir, 'src', 'deep', 'nested', 'file.ts'))).toBe(true);
    });

    it('should handle file deletion', async () => {
      const existingFile = path.join(testDir, 'existing.ts');
      fs.writeFileSync(existingFile, 'export const old = true;');

      const task: TaskDefinition = {
        id: 1,
        title: 'Delete file',
        files: [{ path: 'existing.ts', action: 'delete' }],
        tddSteps: [],
        verificationSteps: [],
      };

      const result = await executeTask(testDir, task, 'echo test');
      expect(result.success).toBe(true);
      expect(fs.existsSync(existingFile)).toBe(false);
    });

    it('should handle file modification', async () => {
      const existingFile = path.join(testDir, 'modify.ts');
      fs.writeFileSync(existingFile, 'export const old = true;');

      const task: TaskDefinition = {
        id: 1,
        title: 'Modify file',
        files: [{ path: 'modify.ts', action: 'modify', content: 'export const new = true;' }],
        tddSteps: [],
        verificationSteps: [],
      };

      const result = await executeTask(testDir, task, 'echo test');
      expect(result.success).toBe(true);
      const content = fs.readFileSync(existingFile, 'utf-8');
      expect(content).toContain('new');
    });
  });
});
