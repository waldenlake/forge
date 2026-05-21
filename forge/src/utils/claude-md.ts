import { fileExists, readTextFile, writeTextFile } from './filesystem';
import * as path from 'path';

export interface ClaudeMdUpdate {
  date: string;
  totalTasks: number;
  completedTasks: number;
  deferredTasks: { id: number; title: string }[];
  testCoverage: number;
}

export async function updateClaudeMd(projectRoot: string, featureSlug: string, update: ClaudeMdUpdate): Promise<void> {
  const claudeMdPath = path.join(projectRoot, 'CLAUDE.md');

  const deferredText = update.deferredTasks.length > 0
    ? `\n    - Deferred: ${update.deferredTasks.map(d => `Task ${d.id} (${d.title})`).join(', ')}`
    : '';

  const entry = `- ${featureSlug} (${update.date})
    - Tasks: ${update.completedTasks} completed${update.deferredTasks.length > 0 ? `, ${update.deferredTasks.length} deferred` : ''}
    - Test coverage: ${update.testCoverage}%${deferredText}
`;

  if (!(await fileExists(claudeMdPath))) {
    await writeTextFile(claudeMdPath, `## Completed Features\n\n${entry}`);
    return;
  }

  const existing = await readTextFile(claudeMdPath);

  if (existing.includes('## Completed Features')) {
    const updated = existing.replace(/(## Completed Features\n)/, `$1\n${entry}`);
    await writeTextFile(claudeMdPath, updated);
  } else if (existing.includes('## Forge')) {
    const updated = existing.replace(/(## Forge\n)/, `$1\n**Completed Features**\n\n${entry}`);
    await writeTextFile(claudeMdPath, updated);
  } else {
    await writeTextFile(claudeMdPath, existing + `\n## Forge\n\n**Completed Features**\n\n${entry}`);
  }
}
