import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runTests, runTestsWithAutoFix } from '../../../src/utils/test-runner';
import * as fs from 'fs';
import * as path from 'path';

describe('Test Runner', () => {
  const testDir = path.join(__dirname, '../../tmp-test-runner');

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('runTests', () => {
    it('should return success when tests pass', async () => {
      const testFile = path.join(testDir, 'test.test.ts');
      fs.writeFileSync(testFile, `import { test, expect } from 'vitest';\ntest('passes', () => { expect(true).toBe(true); });`);
      fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify({ scripts: { test: 'vitest run' } }));

      const result = await runTests(testDir, 'npm test');
      expect(result.success).toBe(true);
    });

    it('should return failure when tests fail', async () => {
      const testFile = path.join(testDir, 'test.test.ts');
      fs.writeFileSync(testFile, `import { test, expect } from 'vitest';\ntest('fails', () => { expect(false).toBe(true); });`);
      fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify({ scripts: { test: 'vitest run' } }));

      const result = await runTests(testDir, 'npm test');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return failure when test command not found', async () => {
      const result = await runTests(testDir, 'nonexistent-command');
      expect(result.success).toBe(false);
    });
  });

  describe('runTestsWithAutoFix', () => {
    it('should succeed when tests pass on first run', async () => {
      const testFile = path.join(testDir, 'test.test.ts');
      fs.writeFileSync(testFile, `import { test, expect } from 'vitest';\ntest('passes', () => { expect(true).toBe(true); });`);
      fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify({ scripts: { test: 'vitest run' } }));

      const result = await runTestsWithAutoFix(testDir, 'npm test', async () => {
        return { success: true };
      });
      expect(result.success).toBe(true);
      expect(result.rounds).toBe(1);
    });

    it('should auto-fix and succeed within max rounds', async () => {
      let fixAttempts = 0;
      const testFile = path.join(testDir, 'test.test.ts');

      fs.writeFileSync(testFile, `import { test, expect } from 'vitest';\ntest('fails', () => { expect(false).toBe(true); });`);
      fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify({ scripts: { test: 'vitest run' } }));

      const result = await runTestsWithAutoFix(testDir, 'npm test', async (errorOutput) => {
        fixAttempts++;
        if (fixAttempts <= 2) {
          fs.writeFileSync(testFile, `import { test, expect } from 'vitest';\ntest('passes', () => { expect(true).toBe(true); });`);
          return { success: true };
        }
        return { success: false, error: 'Could not fix' };
      }, { maxRounds: 3 });

      expect(result.success).toBe(true);
      expect(result.rounds).toBeLessThanOrEqual(3);
    });

    it('should fail after max rounds exceeded', async () => {
      const testFile = path.join(testDir, 'test.test.ts');
      fs.writeFileSync(testFile, `import { test, expect } from 'vitest';\ntest('fails', () => { expect(false).toBe(true); });`);
      fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify({ scripts: { test: 'vitest run' } }));

      const result = await runTestsWithAutoFix(testDir, 'npm test', async () => {
        return { success: false, error: 'Fix failed' };
      }, { maxRounds: 2 });

      expect(result.success).toBe(false);
      expect(result.rounds).toBe(2);
      expect(result.error).toContain('auto-fix rounds');
    });
  });
});
