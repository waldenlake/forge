import * as path from 'path';
import { readJson, writeJson, fileExists } from '../utils/filesystem';
import type { ConfigJson } from '../types';

export interface ConfigGetResult {
  success: boolean;
  value?: unknown;
  error?: string;
}

export interface ConfigSetResult {
  success: boolean;
  error?: string;
}

export interface ConfigListResult {
  success: boolean;
  output?: string;
  error?: string;
}

export async function runConfigGet(projectRoot: string, key: string): Promise<ConfigGetResult> {
  const configPath = path.join(projectRoot, '.forge', 'config.json');
  if (!(await fileExists(configPath))) {
    return { success: false, error: 'Forge not initialized. Run: forge init' };
  }
  const config = await readJson<ConfigJson>(configPath);
  const value = getNestedValue(config, key);
  if (value === undefined) {
    return { success: false, error: `Key not found: ${key}` };
  }
  return { success: true, value };
}

export async function runConfigSet(projectRoot: string, key: string, value: unknown): Promise<ConfigSetResult> {
  const configPath = path.join(projectRoot, '.forge', 'config.json');
  if (!(await fileExists(configPath))) {
    return { success: false, error: 'Forge not initialized. Run: forge init' };
  }
  const config = await readJson<ConfigJson>(configPath);
  setNestedValue(config, key, value);
  await writeJson(configPath, config);
  return { success: true };
}

export async function runConfigList(projectRoot: string): Promise<ConfigListResult> {
  const configPath = path.join(projectRoot, '.forge', 'config.json');
  if (!(await fileExists(configPath))) {
    return { success: false, error: 'Forge not initialized. Run: forge init' };
  }
  const config = await readJson<ConfigJson>(configPath);
  const lines = ['Forge Config', '============'];
  function flatten(obj: Record<string, unknown>, prefix = ''): void {
    for (const [k, v] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${k}` : k;
      if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
        flatten(v as Record<string, unknown>, fullKey);
      } else {
        lines.push(`${fullKey}: ${JSON.stringify(v)}`);
      }
    }
  }
  flatten(config);
  return { success: true, output: lines.join('\n') };
}

function getNestedValue(obj: Record<string, unknown>, key: string): unknown {
  const parts = key.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function setNestedValue(obj: Record<string, unknown>, key: string, value: unknown): void {
  const parts = key.split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== 'object') {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}
