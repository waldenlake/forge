import { fileExists, readJson, writeJson, ensureDir, writeTextFile, listDir } from '../utils/filesystem';
import * as path from 'path';
import type { ProgressJson } from '../types';

export interface BugfixResult {
  success: boolean;
  output?: string;
  error?: string;
}

export interface BugfixOptions {
  description?: string;
}

export async function runBugfix(projectRoot: string, subcommand: string, options?: BugfixOptions): Promise<BugfixResult> {
  switch (subcommand) {
    case 'init':
      return runInit(projectRoot, options?.description || '');
    case 'list':
      return runList(projectRoot);
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
