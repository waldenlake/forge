import { fileExists, readJson, writeJson, ensureDir } from '../utils/filesystem';
import * as path from 'path';
import type { ConfigJson } from '../types';
import * as fs from 'fs/promises';

export interface ManifestResult {
  success: boolean;
  output?: string;
  error?: string;
}

export interface ManifestOptions {
  platform?: string;
}

const VALID_PLATFORMS = ['claude', 'opencode', 'codex'] as const;

export async function runManifest(projectRoot: string, subcommand: string, options?: ManifestOptions): Promise<ManifestResult> {
  switch (subcommand) {
    case 'generate':
      return runGenerate(projectRoot);
    case 'add':
      return runAdd(projectRoot, options?.platform);
    case 'remove':
      return runRemove(projectRoot, options?.platform);
    case 'list':
      return runList(projectRoot);
    default:
      return { success: false, error: `Unknown subcommand: ${subcommand}` };
  }
}

async function getConfig(projectRoot: string): Promise<ConfigJson | null> {
  const configPath = path.join(projectRoot, '.forge', 'config.json');
  if (!(await fileExists(configPath))) return null;
  return readJson<ConfigJson>(configPath);
}

function getManifestDir(projectRoot: string, platform: string): string {
  return platform === 'claude'
    ? path.join(projectRoot, '.claude-plugin')
    : platform === 'opencode'
      ? path.join(projectRoot, '.opencode')
      : path.join(projectRoot, '.codex-plugin');
}

async function writeManifest(projectRoot: string, platform: string): Promise<void> {
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

async function runGenerate(projectRoot: string): Promise<ManifestResult> {
  const config = await getConfig(projectRoot);
  if (!config) {
    return { success: false, error: 'No config.json found. Run `forge init` first.' };
  }

  for (const platform of config.platforms || []) {
    if (VALID_PLATFORMS.includes(platform as any)) {
      await writeManifest(projectRoot, platform);
    }
  }

  return { success: true, output: `Manifests generated for: ${(config.platforms || []).join(', ')}` };
}

async function runAdd(projectRoot: string, platform?: string): Promise<ManifestResult> {
  if (!platform) return { success: false, error: 'Platform is required. Usage: forge manifest add <platform>' };
  if (!VALID_PLATFORMS.includes(platform as any)) {
    return { success: false, error: `Unknown platform: ${platform}. Valid: ${VALID_PLATFORMS.join(', ')}` };
  }

  await writeManifest(projectRoot, platform);

  const config = await getConfig(projectRoot);
  if (config) {
    if (!config.platforms.includes(platform as any)) {
      config.platforms.push(platform as any);
      const configPath = path.join(projectRoot, '.forge', 'config.json');
      await writeJson(configPath, config);
    }
  }

  return { success: true, output: `Added ${platform} manifest` };
}

async function runRemove(projectRoot: string, platform?: string): Promise<ManifestResult> {
  if (!platform) return { success: false, error: 'Platform is required. Usage: forge manifest remove <platform>' };

  const manifestDir = getManifestDir(projectRoot, platform);
  if (await fileExists(manifestDir)) {
    await fs.rm(manifestDir, { recursive: true, force: true });
  }

  const config = await getConfig(projectRoot);
  if (config) {
    config.platforms = config.platforms.filter(p => p !== platform);
    const configPath = path.join(projectRoot, '.forge', 'config.json');
    await writeJson(configPath, config);
  }

  return { success: true, output: `Removed ${platform} manifest` };
}

async function runList(projectRoot: string): Promise<ManifestResult> {
  const config = await getConfig(projectRoot);
  if (!config) {
    return { success: false, error: 'No config.json found.' };
  }

  const installed: string[] = [];
  for (const platform of config.platforms || []) {
    const manifestDir = getManifestDir(projectRoot, platform);
    const manifestPath = path.join(manifestDir, 'plugin.json');
    const exists = await fileExists(manifestPath);
    installed.push(`${platform}: ${exists ? 'installed' : 'missing'}`);
  }

  return { success: true, output: `Installed manifests:\n${installed.map(s => `  - ${s}`).join('\n')}` };
}
