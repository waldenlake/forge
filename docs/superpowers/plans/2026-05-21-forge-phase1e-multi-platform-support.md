# Forge Phase 1e: Multi-Platform Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement multi-platform manifest generation, skill installation, and platform management so Forge works on Claude Code, OpenCode, and Codex.

**Architecture:** Skill files live at user level (`~/.agents/skills/forge/`). Each project has platform-specific manifests (`.claude-plugin/plugin.json`, `.opencode/plugin.json`, `.codex-plugin/plugin.json`) that reference the user-level skills. `forge init` generates manifests for detected platforms. `forge skills install` copies skill files to project-level directories. `forge manifest` manages platforms post-init.

**Tech Stack:** TypeScript CLI, filesystem utilities, JSON manifests, existing types from Phase 1a

**Dependencies:** Phase 1a (CLI skeleton), Phase 1b-1d (skill files must exist at user level)

---

## File Structure

```
forge/
  src/
    commands/
      init.ts              ← Already generates manifests (Phase 1a), extend if needed
      skills.ts            ← New: skills install command
      manifest.ts          ← New: manifest management (generate/add/remove/list)
    utils/
      manifest.ts          ← New: shared manifest generation logic
  tests/
    unit/
      commands/
        skills.test.ts     ← New
        manifest.test.ts   ← New
```

---

### Task 1: Shared Manifest Generation Utility

**Files:**
- Create: `forge/src/utils/manifest.ts`
- Create: `forge/tests/unit/utils/manifest.test.ts`

- [ ] **Step 1: Write failing test for manifest utility**

```typescript
// tests/unit/utils/manifest.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generateManifest, getManifestDir, VALID_PLATFORMS } from '../../../src/utils/manifest';
import * as fs from 'fs';
import * as path from 'path';

describe('Manifest Utility', () => {
  const testDir = path.join(__dirname, '../../tmp-manifest-util');

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('getManifestDir', () => {
    it('should return correct directory for claude', () => {
      const dir = getManifestDir(testDir, 'claude');
      expect(dir).toBe(path.join(testDir, '.claude-plugin'));
    });

    it('should return correct directory for opencode', () => {
      const dir = getManifestDir(testDir, 'opencode');
      expect(dir).toBe(path.join(testDir, '.opencode'));
    });

    it('should return correct directory for codex', () => {
      const dir = getManifestDir(testDir, 'codex');
      expect(dir).toBe(path.join(testDir, '.codex-plugin'));
    });
  });

  describe('generateManifest', () => {
    it('should generate valid plugin.json for opencode', async () => {
      await generateManifest(testDir, 'opencode');
      const manifestPath = path.join(testDir, '.opencode', 'plugin.json');
      expect(fs.existsSync(manifestPath)).toBe(true);

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      expect(manifest.name).toBe('forge');
      expect(manifest.version).toBe('0.1.0');
      expect(manifest.skills).toHaveLength(5);
      expect(manifest.skills[0]).toEqual({ name: '/start', path: '~/.agents/skills/forge/start.md' });
    });

    it('should generate valid plugin.json for claude', async () => {
      await generateManifest(testDir, 'claude');
      const manifestPath = path.join(testDir, '.claude-plugin', 'plugin.json');
      expect(fs.existsSync(manifestPath)).toBe(true);

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      expect(manifest.skills).toHaveLength(5);
    });

    it('should reject invalid platform', async () => {
      await expect(generateManifest(testDir, 'invalid' as any)).rejects.toThrow('Unknown platform');
    });
  });

  describe('VALID_PLATFORMS', () => {
    it('should contain exactly 3 platforms', () => {
      expect(VALID_PLATFORMS).toEqual(['claude', 'opencode', 'codex']);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd forge && npx vitest run tests/unit/utils/manifest.test.ts -v`
Expected: FAIL — module not found

- [ ] **Step 3: Write manifest utility**

```typescript
// src/utils/manifest.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd forge && npx vitest run tests/unit/utils/manifest.test.ts -v`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
cd forge
git add src/utils/manifest.ts tests/unit/utils/manifest.test.ts
git commit -m "feat: add shared manifest generation utility for multi-platform support"
```

---

### Task 2: `forge skills install` Command

**Files:**
- Create: `forge/src/commands/skills.ts`
- Create: `forge/tests/unit/commands/skills.test.ts`
- Modify: `forge/src/index.ts` — register skills command

- [ ] **Step 1: Write failing test for skills install**

```typescript
// tests/unit/commands/skills.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runSkillsInstall } from '../../../src/commands/skills';
import * as fs from 'fs';
import * as path from 'path';

describe('Skills Install', () => {
  const testDir = path.join(__dirname, '../../tmp-skills');

  beforeEach(() => {
    fs.mkdirSync(path.join(testDir, '.forge'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should install skills for opencode platform', async () => {
    const config = {
      version: '1.0', test_mode: 'normal', gstack_installed: false, batch_size: 6,
      test_command: 'npm test', test_framework: 'vitest',
      test_coverage: { unit: 80, integration: 60, e2e: 'P0' },
      project_type: 'new', platforms: ['opencode'],
    };
    fs.writeFileSync(path.join(testDir, '.forge', 'config.json'), JSON.stringify(config));

    const result = await runSkillsInstall(testDir);
    expect(result.success).toBe(true);
    expect(result.output).toContain('skills installed');
    expect(fs.existsSync(path.join(testDir, '.opencode', 'skills', 'forge', 'start.md'))).toBe(true);
  });

  it('should install skills for multiple platforms', async () => {
    const config = {
      version: '1.0', test_mode: 'normal', gstack_installed: false, batch_size: 6,
      test_command: 'npm test', test_framework: 'vitest',
      test_coverage: { unit: 80, integration: 60, e2e: 'P0' },
      project_type: 'new', platforms: ['opencode', 'claude'],
    };
    fs.writeFileSync(path.join(testDir, '.forge', 'config.json'), JSON.stringify(config));

    const result = await runSkillsInstall(testDir);
    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(testDir, '.opencode', 'skills', 'forge', 'start.md'))).toBe(true);
    expect(fs.existsSync(path.join(testDir, '.claude', 'skills', 'forge', 'start.md'))).toBe(true);
  });

  it('should fail if config.json not found', async () => {
    const result = await runSkillsInstall(testDir);
    expect(result.success).toBe(false);
    expect(result.error).toContain('config.json');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd forge && npx vitest run tests/unit/commands/skills.test.ts -v`
Expected: FAIL — module not found

- [ ] **Step 3: Write skills install command**

```typescript
// src/commands/skills.ts
import { fileExists, readJson, ensureDir, writeTextFile } from '../utils/filesystem';
import * as path from 'path';
import type { ConfigJson } from '../types';
import * as fsPromises from 'fs/promises';

export interface SkillsResult {
  success: boolean;
  output?: string;
  error?: string;
}

const SKILL_FILES = [
  'start.md', 'next.md', 'resume.md', 'done.md', 'bugfix.md',
  'scenarios.md', 'progress-tracking.md', 'session-handoff.md',
];

function getSkillsDir(projectRoot: string, platform: string): string {
  return platform === 'claude'
    ? path.join(projectRoot, '.claude', 'skills', 'forge')
    : platform === 'opencode'
      ? path.join(projectRoot, '.opencode', 'skills', 'forge')
      : path.join(projectRoot, '.codex-plugin', 'skills', 'forge');
}

export async function runSkillsInstall(projectRoot: string): Promise<SkillsResult> {
  const configPath = path.join(projectRoot, '.forge', 'config.json');
  if (!(await fileExists(configPath))) {
    return { success: false, error: 'No config.json found. Run `forge init` first.' };
  }

  const config = await readJson<ConfigJson>(configPath);
  const platforms = config.platforms || ['opencode'];
  const installed: string[] = [];
  const userSkillsDir = path.join(process.env.HOME || process.env.USERPROFILE || '', '.agents', 'skills', 'forge');

  for (const platform of platforms) {
    const skillsDir = getSkillsDir(projectRoot, platform);
    await ensureDir(skillsDir);

    for (const skillFile of SKILL_FILES) {
      const sourcePath = path.join(userSkillsDir, skillFile);
      const destPath = path.join(skillsDir, skillFile);
      if (await fileExists(sourcePath)) {
        const content = await fsPromises.readFile(sourcePath, 'utf-8');
        await writeTextFile(destPath, content);
        installed.push(`${platform}/${skillFile}`);
      }
    }
  }

  return {
    success: true,
    output: `Forge skills installed:\n${installed.map(s => `  - ${s}`).join('\n')}\n\n${installed.length} skills installed for ${platforms.length} platform(s).`,
  };
}
```

- [ ] **Step 4: Register in index.ts**

Read `E:\space\open\project\forge\src\index.ts` to see the existing command structure. Add after the `validate` command:

```typescript
import { runSkillsInstall } from './commands/skills';

// forge skills
program
  .command('skills')
  .description('Manage Forge skills')
  .command('install')
  .description('Install Forge skills for detected platforms')
  .action(async () => {
    const projectRoot = process.cwd();
    const result = await runSkillsInstall(projectRoot);
    if (result.success) {
      console.log(result.output);
    } else {
      console.error(result.error);
      process.exitCode = 1;
    }
  });
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd forge && npx vitest run tests/unit/commands/skills.test.ts -v`
Expected: PASS (3+ tests)

- [ ] **Step 6: Commit**

```bash
cd forge
git add src/commands/skills.ts tests/unit/commands/skills.test.ts src/index.ts
git commit -m "feat: add forge skills install command for multi-platform skill deployment"
```

---

### Task 3: `forge manifest` Management Command

**Files:**
- Create: `forge/src/commands/manifest.ts`
- Create: `forge/tests/unit/commands/manifest.test.ts`
- Modify: `forge/src/index.ts` — register manifest command

- [ ] **Step 1: Write failing test for manifest command**

```typescript
// tests/unit/commands/manifest.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runManifest } from '../../../src/commands/manifest';
import * as fs from 'fs';
import * as path from 'path';

describe('Manifest Management', () => {
  const testDir = path.join(__dirname, '../../tmp-manifest');

  beforeEach(() => {
    fs.mkdirSync(path.join(testDir, '.forge'), { recursive: true });
    const config = {
      version: '1.0', test_mode: 'normal', gstack_installed: false, batch_size: 6,
      test_command: 'npm test', test_framework: 'vitest',
      test_coverage: { unit: 80, integration: 60, e2e: 'P0' },
      project_type: 'new', platforms: ['opencode'],
    };
    fs.writeFileSync(path.join(testDir, '.forge', 'config.json'), JSON.stringify(config));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('generate', () => {
    it('should generate manifests for all configured platforms', async () => {
      const result = await runManifest(testDir, 'generate');
      expect(result.success).toBe(true);
      expect(fs.existsSync(path.join(testDir, '.opencode', 'plugin.json'))).toBe(true);
    });
  });

  describe('add', () => {
    it('should add a platform manifest and update config', async () => {
      const result = await runManifest(testDir, 'add', { platform: 'claude' });
      expect(result.success).toBe(true);
      expect(fs.existsSync(path.join(testDir, '.claude-plugin', 'plugin.json'))).toBe(true);

      const config = JSON.parse(fs.readFileSync(path.join(testDir, '.forge', 'config.json'), 'utf-8'));
      expect(config.platforms).toContain('claude');
    });

    it('should fail for unknown platform', async () => {
      const result = await runManifest(testDir, 'add', { platform: 'unknown' });
      expect(result.success).toBe(false);
    });
  });

  describe('remove', () => {
    it('should remove a platform manifest and update config', async () => {
      await runManifest(testDir, 'add', { platform: 'claude' });
      expect(fs.existsSync(path.join(testDir, '.claude-plugin', 'plugin.json'))).toBe(true);

      const result = await runManifest(testDir, 'remove', { platform: 'claude' });
      expect(result.success).toBe(true);
      expect(fs.existsSync(path.join(testDir, '.claude-plugin', 'plugin.json'))).toBe(false);

      const config = JSON.parse(fs.readFileSync(path.join(testDir, '.forge', 'config.json'), 'utf-8'));
      expect(config.platforms).not.toContain('claude');
    });
  });

  describe('list', () => {
    it('should list installed manifests with status', async () => {
      await runManifest(testDir, 'add', { platform: 'claude' });
      const result = await runManifest(testDir, 'list');
      expect(result.success).toBe(true);
      expect(result.output).toContain('opencode');
      expect(result.output).toContain('claude');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd forge && npx vitest run tests/unit/commands/manifest.test.ts -v`
Expected: FAIL — module not found

- [ ] **Step 3: Write manifest command**

```typescript
// src/commands/manifest.ts
import { fileExists, readJson, writeJson } from '../utils/filesystem';
import { generateManifest, getManifestDir, VALID_PLATFORMS, Platform } from '../utils/manifest';
import * as path from 'path';
import type { ConfigJson } from '../types';
import { rm } from 'fs/promises';

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
    if (VALID_PLATFORMS.includes(platform as Platform)) {
      await generateManifest(projectRoot, platform as Platform);
    }
  }

  return { success: true, output: `Manifests generated for: ${(config.platforms || []).join(', ')}` };
}

async function runAdd(projectRoot: string, platform?: string): Promise<ManifestResult> {
  if (!platform) return { success: false, error: 'Platform is required. Usage: forge manifest add <platform>' };
  if (!VALID_PLATFORMS.includes(platform as Platform)) {
    return { success: false, error: `Unknown platform: ${platform}. Valid: ${VALID_PLATFORMS.join(', ')}` };
  }

  await generateManifest(projectRoot, platform as Platform);

  const config = await getConfig(projectRoot);
  if (config && !config.platforms.includes(platform as Platform)) {
    config.platforms.push(platform as Platform);
    await writeJson(path.join(projectRoot, '.forge', 'config.json'), config);
  }

  return { success: true, output: `Added ${platform} manifest` };
}

async function runRemove(projectRoot: string, platform?: string): Promise<ManifestResult> {
  if (!platform) return { success: false, error: 'Platform is required. Usage: forge manifest remove <platform>' };

  const manifestDir = getManifestDir(projectRoot, platform as Platform);
  if (await fileExists(manifestDir)) {
    await rm(manifestDir, { recursive: true, force: true });
  }

  const config = await getConfig(projectRoot);
  if (config) {
    config.platforms = config.platforms.filter(p => p !== platform);
    await writeJson(path.join(projectRoot, '.forge', 'config.json'), config);
  }

  return { success: true, output: `Removed ${platform} manifest` };
}

async function runList(projectRoot: string): Promise<ManifestResult> {
  const config = await getConfig(projectRoot);
  if (!config) {
    return { success: false, error: 'No config.json found.' };
  }

  const lines: string[] = ['Installed manifests:'];
  for (const platform of config.platforms || []) {
    const manifestDir = getManifestDir(projectRoot, platform as Platform);
    const manifestPath = path.join(manifestDir, 'plugin.json');
    const exists = await fileExists(manifestPath);
    lines.push(`  - ${platform}: ${exists ? '✅ installed' : '❌ missing'}`);
  }

  return { success: true, output: lines.join('\n') };
}
```

- [ ] **Step 4: Register in index.ts**

Add to `E:\space\open\project\forge\src\index.ts`:

```typescript
import { runManifest } from './commands/manifest';

// forge manifest
const manifestCmd = program
  .command('manifest')
  .description('Manage platform manifests');

manifestCmd
  .command('generate')
  .description('Generate manifests for all configured platforms')
  .action(async () => {
    const projectRoot = process.cwd();
    const result = await runManifest(projectRoot, 'generate');
    if (result.success) console.log(result.output);
    else { console.error(result.error); process.exitCode = 1; }
  });

manifestCmd
  .command('add <platform>')
  .description('Add a platform manifest')
  .action(async (platform) => {
    const projectRoot = process.cwd();
    const result = await runManifest(projectRoot, 'add', { platform });
    if (result.success) console.log(result.output);
    else { console.error(result.error); process.exitCode = 1; }
  });

manifestCmd
  .command('remove <platform>')
  .description('Remove a platform manifest')
  .action(async (platform) => {
    const projectRoot = process.cwd();
    const result = await runManifest(projectRoot, 'remove', { platform });
    if (result.success) console.log(result.output);
    else { console.error(result.error); process.exitCode = 1; }
  });

manifestCmd
  .command('list')
  .description('List installed manifests')
  .action(async () => {
    const projectRoot = process.cwd();
    const result = await runManifest(projectRoot, 'list');
    if (result.success) console.log(result.output);
    else { console.error(result.error); process.exitCode = 1; }
  });
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd forge && npx vitest run tests/unit/commands/manifest.test.ts -v`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
cd forge
git add src/commands/manifest.ts tests/unit/commands/manifest.test.ts src/index.ts
git commit -m "feat: add forge manifest command for multi-platform manifest management"
```

---

### Task 4: Update `forge init` to Use Shared Manifest Utility

**Files:**
- Modify: `forge/src/commands/init.ts` — replace inline `generateManifest` with shared utility

- [ ] **Step 1: Read current init.ts**

Read `E:\space\open\project\forge\src\commands\init.ts` lines 132-155 to see the inline `generateManifest` function.

- [ ] **Step 2: Refactor init.ts to use shared utility**

Replace the inline `generateManifest` function (lines 132-155) with an import from `../utils/manifest`:

```typescript
// Replace:
// async function generateManifest(projectRoot: string, platform: string): Promise<void> { ... }

// With:
import { generateManifest } from '../utils/manifest';
```

Remove the inline function entirely. The call site at line 104 (`await generateManifest(projectRoot, platform)`) works unchanged since the signature matches.

- [ ] **Step 3: Run tests to verify no regression**

Run: `cd forge && npx vitest run tests/unit/commands/init.test.ts -v`
Expected: PASS (7 tests, same as before)

- [ ] **Step 4: Commit**

```bash
cd forge
git add src/commands/init.ts
git commit -m "refactor: use shared manifest utility in forge init"
```

---

### Task 5: Integration Test — Multi-Platform End-to-End

**Files:**
- No new files

- [ ] **Step 1: Set up test project**

1. Create a temporary test directory
2. Run `forge init --platforms opencode,claude`
3. Verify both `.opencode/plugin.json` and `.claude-plugin/plugin.json` exist

- [ ] **Step 2: Test skills install**

Run `forge skills install`
Verify skill files exist in `.opencode/skills/forge/` and `.claude/skills/forge/`

- [ ] **Step 3: Test manifest add/remove**

Run `forge manifest add codex`
Verify `.codex-plugin/plugin.json` exists and config.json updated
Run `forge manifest remove codex`
Verify `.codex-plugin/` removed and config.json updated

- [ ] **Step 4: Test manifest list**

Run `forge manifest list`
Verify output shows opencode ✅ and claude ✅

- [ ] **Step 5: Document results**

Write a brief summary of integration test results.

---

### Task 6: Run Full Test Suite for Phase 1e

**Files:**
- No new files

- [ ] **Step 1: Run all forge CLI tests**

Run: `cd forge && npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Check test coverage**

Run: `cd forge && npx vitest run --coverage`
Expected: Coverage ≥80% for all source files

- [ ] **Step 3: Commit**

```bash
cd forge
git add .
git commit -m "chore: verify full test suite passes for Phase 1e"
```

---

## Self-Review Checklist

1. **Spec coverage:** ✅ All Phase 1e requirements covered:
   - Manifest generation for claude/opencode/codex ✅
   - `forge skills install` command ✅
   - `forge manifest` management (generate/add/remove/list) ✅
   - Shared manifest utility ✅
   - Integration test ✅

2. **No placeholders:** ✅ Every task has complete code and tests

3. **Type consistency:** ✅ `Platform` type from `manifest.ts` reused in `manifest.ts` command and `init.ts`

4. **Test quality:** ✅ Tests verify actual file creation, JSON content, and config.json updates

5. **DRY:** ✅ `generateManifest` extracted to shared utility, used by both `init.ts` and `manifest.ts`

6. **Platform coverage:** ✅ All 3 platforms (claude, opencode, codex) supported with correct directory names
