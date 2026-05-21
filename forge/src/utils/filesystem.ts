import * as fs from 'fs';
import * as path from 'path';

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

export async function writeJson<T>(filePath: string, data: T): Promise<void> {
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

export async function readJson<T>(filePath: string): Promise<T> {
  const content = await fs.promises.readFile(filePath, 'utf-8');
  try {
    return JSON.parse(content) as T;
  } catch (e) {
    throw new Error(`Failed to parse JSON in ${filePath}: ${(e as Error).message}`);
  }
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readTextFile(filePath: string): Promise<string> {
  return fs.promises.readFile(filePath, 'utf-8');
}

export async function writeTextFile(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  await fs.promises.writeFile(filePath, content, 'utf-8');
}

export async function moveDir(src: string, dest: string): Promise<void> {
  await fs.promises.rename(src, dest);
}
