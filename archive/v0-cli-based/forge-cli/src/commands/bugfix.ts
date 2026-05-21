import { fileExists, readJson, writeJson, ensureDir, writeTextFile, readTextFile, listDir } from '../utils/filesystem';
import * as path from 'path';
import type { ProgressJson } from '../types';

export interface BugfixResult {
  success: boolean;
  output?: string;
  error?: string;
}

export interface BugfixOptions {
  description?: string;
  steps?: string;
  testCommand?: string;
}

export async function runBugfix(projectRoot: string, subcommand: string, options?: BugfixOptions): Promise<BugfixResult> {
  switch (subcommand) {
    case 'init':
      return runInit(projectRoot, options?.description || '');
    case 'list':
      return runList(projectRoot);
    case 'reproduce':
      return runReproduce(projectRoot, options?.steps || '');
    case 'plan':
      return runPlan(projectRoot);
    case 'execute':
      return runExecute(projectRoot, options?.testCommand || 'npm test');
    default:
      return { success: false, error: `Unknown subcommand: ${subcommand}` };
  }
}

function generateBugfixId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 6);
  return `bugfix-${timestamp}-${random}`;
}

async function runInit(projectRoot: string, description: string): Promise<BugfixResult> {
  if (!description) {
    return { success: false, error: 'Bug description is required. Usage: forge bugfix init "<description>"' };
  }

  const progressPath = path.join(projectRoot, '.forge', 'progress.json');
  if (!(await fileExists(progressPath))) {
    return { success: false, error: 'No progress.json found. Run `forge init` first.' };
  }

  const progress = await readJson<ProgressJson>(progressPath);
  if (progress.status !== 'idle' || progress.feature) {
    return { success: false, error: `Cannot start bugfix: there is already an active feature "${progress.feature}". Complete it with /done or cancel first.` };
  }

  const slug = generateBugfixId();
  const changeDir = path.join(projectRoot, 'docs', 'forge', 'changes', slug);

  await ensureDir(changeDir);

  const bugReportPath = path.join(changeDir, 'bug-report.md');
  const bugReportContent = `# Bug Report: ${slug}\n\n## Description\n\n${description}\n\n## Reproduction Steps\n\n<!-- To be filled during bugfix flow -->\n\n## Root Cause\n\n<!-- To be determined during investigation -->\n\n## Fix\n\n<!-- To be documented after fix -->\n`;
  await writeTextFile(bugReportPath, bugReportContent);

  progress.feature = slug;
  progress.status = 'bugfix';
  progress.phase = 'brainstorming';
  progress.updated_at = new Date().toISOString();
  await writeJson(progressPath, progress);

  return { success: true, output: `Bugfix initialized: ${slug}\nChange directory: ${changeDir}\nBug report: ${bugReportPath}` };
}

async function runList(projectRoot: string): Promise<BugfixResult> {
  const archiveDir = path.join(projectRoot, 'docs', 'forge', 'changes', 'archive');
  if (!(await fileExists(archiveDir))) {
    return { success: true, output: 'No archived bugfixes found.' };
  }

  const entries = await listDir(archiveDir);
  const bugfixes = entries.filter(entry => /bugfix-\d+/.test(entry));

  if (bugfixes.length === 0) {
    return { success: true, output: 'No archived bugfixes found.' };
  }

  const output = bugfixes.map(b => `- ${b}`).join('\n');
  return { success: true, output: `Archived bugfixes:\n${output}` };
}

async function getActiveBugfix(projectRoot: string) {
  const progressPath = path.join(projectRoot, '.forge', 'progress.json');
  if (!(await fileExists(progressPath))) {
    throw new Error('No progress.json found');
  }

  const progress = await readJson<ProgressJson>(progressPath);
  if (progress.status !== 'bugfix' || !progress.feature) {
    throw new Error('No active bugfix. Run: forge bugfix init "<description>"');
  }

  const slug = progress.feature;
  const changeDir = path.join(projectRoot, 'docs', 'forge', 'changes', slug);
  const bugReportPath = path.join(changeDir, 'bug-report.md');

  if (!(await fileExists(bugReportPath))) {
    throw new Error(`Bug report not found: ${bugReportPath}`);
  }

  return { slug, changeDir, bugReportPath };
}

async function runReproduce(projectRoot: string, steps: string): Promise<BugfixResult> {
  try {
    const { slug, bugReportPath } = await getActiveBugfix(projectRoot);
    if (!steps) {
      return { success: false, error: 'Reproduction steps are required. Usage: forge bugfix reproduce "1. Open login page\n2. Enter invalid password\n3. Click Login"' };
    }

    let content = await readTextFile(bugReportPath);
    content = content.replace(
      /<!-- To be filled during bugfix flow -->/,
      steps,
    );

    await writeTextFile(bugReportPath, content);
    return { success: true, output: `Reproduction steps recorded for ${slug}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

async function runPlan(projectRoot: string): Promise<BugfixResult> {
  try {
    const { slug, bugReportPath, changeDir } = await getActiveBugfix(projectRoot);

    const bugReport = await readTextFile(bugReportPath);

    const fixPlanPath = path.join(changeDir, 'fix-plan.md');
    const planContent = `# Fix Plan: ${slug}

## Bug Description

(From bug-report.md)

## Root Cause

<!-- To be determined during investigation -->

## Fix Tasks

### Task 1: Write regression test
- Write test that reproduces the bug (should fail first)
- File: tests/xxx.test.ts

### Task 2: Implement fix
- Fix the root cause
- Verify regression test passes

### Task 3: Verify no regressions
- Run full test suite
- Verify reproduction steps no longer trigger bug
`;

    await writeTextFile(fixPlanPath, planContent);
    return { success: true, output: `Fix plan generated: ${fixPlanPath}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

async function runExecute(projectRoot: string, testCommand: string): Promise<BugfixResult> {
  try {
    const { slug, changeDir } = await getActiveBugfix(projectRoot);
    return {
      success: true,
      output: `Bugfix execution started for ${slug}\nTest command: ${testCommand}\n\nExecute TDD flow manually:\n1. Write regression test (should fail)\n2. Implement fix\n3. Run tests (should pass)\n4. Run: forge bugfix archive to complete`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
