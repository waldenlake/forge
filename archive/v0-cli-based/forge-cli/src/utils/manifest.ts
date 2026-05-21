import { ensureDir, writeJson } from './filesystem';
import * as path from 'path';

export const VALID_PLATFORMS = ['claude', 'opencode', 'codex'] as const;
export type Platform = (typeof VALID_PLATFORMS)[number];

export function getManifestDir(projectRoot: string, platform: Platform): string {
  return platform === 'claude'
    ? path.join(projectRoot, '.claude-plugin')
    : platform === 'opencode'
      ? path.join(projectRoot, '.opencode')
      : path.join(projectRoot, '.codex-plugin');
}

export async function generateManifest(projectRoot: string, platform: Platform): Promise<void> {
  if (!VALID_PLATFORMS.includes(platform)) {
    throw new Error(`Unknown platform: ${platform}. Valid: ${VALID_PLATFORMS.join(', ')}`);
  }

  const manifestDir = getManifestDir(projectRoot, platform);
  await ensureDir(manifestDir);

  const manifest = {
    name: 'forge',
    version: '0.1.0',
    skills: [
      { name: '/start', path: '~/.agents/skills/forge/start.md' },
      { name: '/next', path: '~/.agents/skills/forge/next.md' },
      { name: '/resume', path: '~/.agents/skills/forge/resume.md' },
      { name: '/done', path: '~/.agents/skills/forge/done.md' },
      { name: '/bugfix', path: '~/.agents/skills/forge/bugfix.md' },
    ],
  };

  await writeJson(path.join(manifestDir, 'plugin.json'), manifest);
}
