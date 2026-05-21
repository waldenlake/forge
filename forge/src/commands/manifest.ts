import { fileExists, readJson, writeJson } from '../utils/filesystem';
import { generateManifest, getManifestDir, VALID_PLATFORMS, Platform } from '../utils/manifest';
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

async function runGenerate(projectRoot: string): Promise<ManifestResult> {
  const config = await getConfig(projectRoot);
  if (!config) {
    return { success: false, error: 'No config.json found. Run `forge init` first.' };
  }

  for (const platform of config.platforms || []) {
    if (VALID_PLATFORMS.includes(platform as any)) {
      await generateManifest(projectRoot, platform as Platform);
    }
  }

  return { success: true, output: `Manifests generated for: ${(config.platforms || []).join(', ')}` };
}

async function runAdd(projectRoot: string, platform?: string): Promise<ManifestResult> {
  if (!platform) return { success: false, error: 'Platform is required. Usage: forge manifest add <platform>' };
  if (!VALID_PLATFORMS.includes(platform as any)) {
    return { success: false, error: `Unknown platform: ${platform}. Valid: ${VALID_PLATFORMS.join(', ')}` };
  }

  await generateManifest(projectRoot, platform as Platform);

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

  const manifestDir = getManifestDir(projectRoot, platform as Platform);
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
    const manifestDir = getManifestDir(projectRoot, platform as Platform);
    const manifestPath = path.join(manifestDir, 'plugin.json');
    const exists = await fileExists(manifestPath);
    installed.push(`${platform}: ${exists ? 'installed' : 'missing'}`);
  }

  return { success: true, output: `Installed manifests:\n${installed.map(s => `  - ${s}`).join('\n')}` };
}
