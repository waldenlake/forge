import { fileExists, ensureDir, writeTextFile, readTextFile } from '../utils/filesystem';
import * as path from 'path';
import type { ConfigJson } from '../types';

export interface SkillsResult {
  success: boolean;
  output?: string;
  error?: string;
}

const SKILL_FILES = [
  'start.md',
  'next.md',
  'resume.md',
  'done.md',
  'bugfix.md',
  'scenarios.md',
  'progress-tracking.md',
  'session-handoff.md',
];

function getUserSkillsDir(): string {
  const envOverride = process.env.FORGE_USER_SKILLS_DIR;
  if (envOverride) return envOverride;
  return path.join(
    process.env.HOME || process.env.USERPROFILE || '',
    '.agents',
    'skills',
    'forge',
  );
}

export async function runSkillsInstall(projectRoot: string): Promise<SkillsResult> {
  const configPath = path.join(projectRoot, '.forge', 'config.json');
  if (!(await fileExists(configPath))) {
    return { success: false, error: 'No config.json found. Run `forge init` first.' };
  }

  const config = await readJson<ConfigJson>(configPath);
  const platforms = config.platforms || ['opencode'];
  const installed: string[] = [];
  const userSkillsDir = getUserSkillsDir();

  for (const platform of platforms) {
    const skillsDir =
      platform === 'claude'
        ? path.join(projectRoot, '.claude', 'skills', 'forge')
        : platform === 'opencode'
          ? path.join(projectRoot, '.opencode', 'skills', 'forge')
          : path.join(projectRoot, '.codex-plugin', 'skills', 'forge');

    await ensureDir(skillsDir);

    for (const skillFile of SKILL_FILES) {
      const sourcePath = path.join(userSkillsDir, skillFile);
      const destPath = path.join(skillsDir, skillFile);
      if (await fileExists(sourcePath)) {
        const content = await readTextFile(sourcePath);
        await writeTextFile(destPath, content);
        installed.push(`${platform}/${skillFile}`);
      }
    }
  }

  return {
    success: true,
    output:
      `Forge skills installed:\n${installed.map((s) => `  - ${s}`).join('\n')}\n\n${installed.length} skills installed for ${platforms.length} platform(s).`,
  };
}

async function readJson<T>(filePath: string): Promise<T> {
  const content = await readTextFile(filePath);
  return JSON.parse(content) as T;
}
