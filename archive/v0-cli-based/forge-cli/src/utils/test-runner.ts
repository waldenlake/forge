import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface TestResult {
  success: boolean;
  output?: string;
  error?: string;
  rounds: number;
}

export interface AutoFixOptions {
  maxRounds?: number;
}

export async function runTests(projectRoot: string, testCommand: string): Promise<Omit<TestResult, 'rounds'>> {
  try {
    const { stdout, stderr } = await execAsync(testCommand, {
      cwd: projectRoot,
      timeout: 60000,
    });

    return {
      success: true,
      output: stdout,
      error: stderr || undefined,
    };
  } catch (e) {
    const error = e as { code?: number; stdout: string; stderr: string; message: string };
    return {
      success: false,
      output: error.stdout,
      error: error.stderr || error.message,
    };
  }
}

export async function runTestsWithAutoFix(
  projectRoot: string,
  testCommand: string,
  fixFn: (errorOutput: string) => Promise<{ success: boolean; error?: string }>,
  options: AutoFixOptions = {}
): Promise<TestResult> {
  const maxRounds = options.maxRounds || 3;

  for (let round = 1; round <= maxRounds; round++) {
    const testResult = await runTests(projectRoot, testCommand);

    if (testResult.success) {
      return { success: true, output: testResult.output, error: testResult.error, rounds: round };
    }

    if (round < maxRounds) {
      const fixResult = await fixFn(testResult.error || 'Unknown error');
      if (!fixResult.success) {
        continue;
      }
    } else {
      return {
        success: false,
        error: `Tests failed after ${maxRounds} auto-fix rounds: ${testResult.error}`,
        rounds: maxRounds,
      };
    }
  }

  return {
    success: false,
    error: `Tests failed after ${maxRounds} auto-fix rounds`,
    rounds: maxRounds,
  };
}
