import * as fs from 'fs';
import * as path from 'path';

export async function detectGit(projectRoot: string): Promise<boolean> {
  const gitDir = path.join(projectRoot, '.git');
  try {
    const stat = await fs.promises.stat(gitDir);
    return stat.isDirectory() || stat.isFile(); // submodules use .git as file
  } catch {
    return false;
  }
}

export async function detectSuperpowers(projectRoot: string): Promise<boolean> {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  if (!homeDir) return false;

  const skillsPath = path.join(homeDir, '.agents', 'skills', 'superpowers');
  try {
    const stat = await fs.promises.stat(skillsPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

export interface TestFrameworkInfo {
  command: string;
  framework: string;
}

export async function detectTestFramework(projectRoot: string): Promise<TestFrameworkInfo | null> {
  // Check package.json first (most common)
  const packageJsonPath = path.join(projectRoot, 'package.json');
  try {
    const content = await fs.promises.readFile(packageJsonPath, 'utf-8');
    const pkg = JSON.parse(content);

    if (pkg.devDependencies?.vitest || pkg.dependencies?.vitest) {
      return { command: 'npm test', framework: 'vitest' };
    }
    if (pkg.devDependencies?.jest || pkg.dependencies?.jest) {
      return { command: 'npm test', framework: 'jest' };
    }
    if (pkg.scripts?.test?.includes('mocha')) {
      return { command: 'npm test', framework: 'mocha' };
    }
  } catch {
    // package.json not found, continue
  }

  // Check pytest
  const pytestIni = path.join(projectRoot, 'pytest.ini');
  const conftestPy = path.join(projectRoot, 'conftest.py');
  if (await fileExists(pytestIni) || await fileExists(conftestPy)) {
    return { command: 'pytest', framework: 'pytest' };
  }

  // Check Go
  const goMod = path.join(projectRoot, 'go.mod');
  if (await fileExists(goMod)) {
    return { command: 'go test', framework: 'go test' };
  }

  // Check Rust
  const cargoToml = path.join(projectRoot, 'Cargo.toml');
  if (await fileExists(cargoToml)) {
    return { command: 'cargo test', framework: 'cargo test' };
  }

  return null;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}
