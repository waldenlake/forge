# Forge Phase 1a: Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Forge CLI foundation — environment detection, directory structure generation, config management, and state file validation.

**Architecture:** Skill-driven architecture. CLI is TypeScript + tsx with 4 commands (init, status, config, validate). Skills live at user-level (`~/.agents/skills/forge/`). CLI only handles infrastructure — no orchestration logic.

**Tech Stack:** TypeScript, tsx, zod (schema validation), commander (CLI), vitest (testing)

---

## File Structure

```
forge/
  package.json
  tsconfig.json
  src/
    index.ts                          # CLI entry point, command registration
    types/
      index.ts                        # Type definitions for config, progress, scenarios
    commands/
      init.ts                         # forge init
      status.ts                       # forge status
      config.ts                       # forge config get/set/list
      validate.ts                     # forge validate
    utils/
      detect.ts                       # Environment detection (git, superpowers, gitnexus, gstack, test framework)
      filesystem.ts                   # Directory/file creation, path resolution
      schema.ts                       # JSON Schema validation for progress.json, config.json, scenarios.json
  tests/
    unit/
      commands/
        init.test.ts
        status.test.ts
        config.test.ts
        validate.test.ts
      utils/
        detect.test.ts
        filesystem.test.ts
        schema.test.ts
      types.test.ts
```

---

### Task 1: Project Setup

**Files:**
- Create: `forge/package.json`
- Create: `forge/tsconfig.json`
- Create: `forge/.gitignore`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "forge-cli",
  "version": "0.1.0",
  "description": "AI-driven software development orchestration CLI",
  "type": "module",
  "bin": {
    "forge": "./src/index.ts"
  },
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint src/**/*.ts",
    "format": "prettier --write src/**/*.ts"
  },
  "keywords": ["ai", "orchestration", "cli"],
  "license": "MIT",
  "devDependencies": {
    "@types/node": "^20.11.0",
    "typescript": "^5.3.3",
    "vitest": "^1.2.0",
    "eslint": "^8.56.0",
    "prettier": "^3.2.0",
    "@vitest/coverage-v8": "^1.2.0"
  },
  "dependencies": {
    "commander": "^12.0.0",
    "zod": "^3.22.4",
    "tsx": "^4.7.0"
  }
}
```

- [ ] **Step 2: Run npm install to verify dependencies resolve**

Run: `cd forge && npm install`
Expected: All packages installed, no errors

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 4: Create .gitignore**

```
node_modules/
dist/
*.log
.DS_Store
```

- [ ] **Step 5: Commit**

```bash
cd forge
git add package.json tsconfig.json .gitignore
git commit -m "feat: initialize forge CLI project structure"
```

---

### Task 2: Type Definitions

**Files:**
- Create: `forge/src/types/index.ts`

- [ ] **Step 1: Write test for type exports**

```typescript
// tests/unit/types.test.ts
import { describe, it, expect } from 'vitest';
import {
  ProgressJsonSchema,
  ConfigJsonSchema,
  ScenariosJsonSchema,
  type ProgressJson,
  type ConfigJson,
  type ScenariosJson,
  type Scenario,
  type ScenarioAssertion,
  type Batch,
  type Task,
  type Verification,
} from '../../src/types';

describe('Type Definitions', () => {
  it('should export Zod schemas', () => {
    expect(ProgressJsonSchema).toBeDefined();
    expect(ConfigJsonSchema).toBeDefined();
    expect(ScenariosJsonSchema).toBeDefined();
  });

  it('should validate valid progress.json', () => {
    const valid: ProgressJson = {
      version: '1.0',
      feature: 'test-feature',
      status: 'planning',
      phase: 'brainstorming',
      created_at: '2026-05-21T08:00:00Z',
      updated_at: '2026-05-21T08:00:00Z',
      total_batches: 0,
      current_batch: 0,
      batches: [],
      verification: {
        status: 'pending',
        test_mode: 'normal',
        last_run: null,
        report_path: null,
      },
    };
    const result = ProgressJsonSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('should reject invalid progress.json status', () => {
    const invalid = {
      version: '1.0',
      feature: 'test',
      status: 'invalid_status',
      phase: 'brainstorming',
      created_at: '2026-05-21T08:00:00Z',
      updated_at: '2026-05-21T08:00:00Z',
      total_batches: 0,
      current_batch: 0,
      batches: [],
      verification: {
        status: 'pending',
        test_mode: 'normal',
        last_run: null,
        report_path: null,
      },
    };
    const result = ProgressJsonSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should validate valid config.json', () => {
    const valid: ConfigJson = {
      version: '1.0',
      test_mode: 'normal',
      gstack_installed: false,
      batch_size: 6,
      test_command: 'npm test',
      test_framework: 'vitest',
      test_coverage: {
        unit: 80,
        integration: 60,
        e2e: 'P0',
      },
      project_type: 'new',
      platforms: ['claude', 'opencode'],
    };
    const result = ConfigJsonSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('should validate valid scenarios.json', () => {
    const valid: ScenariosJson = {
      version: '1.0',
      feature: 'test-feature',
      source: 'proposal.md',
      generated_at: '2026-05-21T08:15:00Z',
      scenarios: [
        {
          id: 1,
          title: 'Test scenario',
          given: 'Given condition',
          when: 'When action',
          then: [
            { assertion: 'Then result', type: 'functional' },
          ],
          testTypes: ['functional'],
          priority: 'P0',
        },
      ],
    };
    const result = ScenariosJsonSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('should reject invalid scenario priority', () => {
    const invalid = {
      version: '1.0',
      feature: 'test',
      source: 'proposal.md',
      generated_at: '2026-05-21T08:15:00Z',
      scenarios: [
        {
          id: 1,
          title: 'Test',
          given: 'Given',
          when: 'When',
          then: [{ assertion: 'Then', type: 'functional' }],
          testTypes: ['functional'],
          priority: 'P3',
        },
      ],
    };
    const result = ScenariosJsonSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd forge && npx vitest run tests/unit/types.test.ts -v`
Expected: FAIL — module not found

- [ ] **Step 3: Write type definitions**

```typescript
// src/types/index.ts
import { z } from 'zod';

// ==================== Scenario Types ====================

export const ScenarioAssertionSchema = z.object({
  assertion: z.string(),
  type: z.enum(['functional', 'ui', 'side-effect', 'performance']),
});

export type ScenarioAssertion = z.infer<typeof ScenarioAssertionSchema>;

export const ScenarioSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  given: z.string(),
  when: z.string(),
  then: z.array(ScenarioAssertionSchema),
  testTypes: z.array(z.enum(['functional', 'ui', 'integration', 'performance'])),
  priority: z.enum(['P0', 'P1', 'P2']),
});

export type Scenario = z.infer<typeof ScenarioSchema>;

export const ScenariosJsonSchema = z.object({
  version: z.literal('1.0'),
  feature: z.string(),
  source: z.string(),
  generated_at: z.string().datetime(),
  scenarios: z.array(ScenarioSchema),
});

export type ScenariosJson = z.infer<typeof ScenariosJsonSchema>;

// ==================== Progress Types ====================

export const TaskSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  status: z.enum(['pending', 'in_progress', 'done', 'failed', 'deferred']),
  commit: z.string().optional(),
  started_at: z.string().datetime().optional(),
  completed_at: z.string().datetime().optional(),
});

export type Task = z.infer<typeof TaskSchema>;

export const BatchSchema = z.object({
  batch: z.number().int().positive(),
  status: z.enum(['pending', 'in_progress', 'done', 'blocked', 'failed']),
  started_at: z.string().datetime().optional(),
  completed_at: z.string().datetime().optional(),
  tasks: z.array(TaskSchema),
});

export type Batch = z.infer<typeof BatchSchema>;

export const VerificationSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'passed', 'failed']),
  test_mode: z.enum(['normal', 'enhanced']),
  last_run: z.string().datetime().nullable(),
  report_path: z.string().nullable(),
});

export type Verification = z.infer<typeof VerificationSchema>;

export const ProgressJsonSchema = z.object({
  version: z.literal('1.0'),
  feature: z.string(),
  status: z.enum(['idle', 'planning', 'executing', 'verification_complete', 'bugfix']),
  phase: z.enum(['brainstorming', 'awaiting_confirmation', 'batch_execution', 'verification']),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  total_batches: z.number().int().nonnegative(),
  current_batch: z.number().int().nonnegative(),
  batches: z.array(BatchSchema),
  verification: VerificationSchema,
});

export type ProgressJson = z.infer<typeof ProgressJsonSchema>;

// ==================== Config Types ====================

export const TestCoverageSchema = z.object({
  unit: z.number().int().min(0).max(100),
  integration: z.number().int().min(0).max(100),
  e2e: z.enum(['P0', 'P0+P1', 'all']),
});

export type TestCoverage = z.infer<typeof TestCoverageSchema>;

export const ConfigJsonSchema = z.object({
  version: z.literal('1.0'),
  test_mode: z.enum(['normal', 'enhanced']),
  gstack_installed: z.boolean(),
  batch_size: z.number().int().min(1).max(10),
  test_command: z.string(),
  test_framework: z.string(),
  test_coverage: TestCoverageSchema,
  project_type: z.enum(['new', 'existing']),
  platforms: z.array(z.enum(['claude', 'opencode', 'codex'])),
});

export type ConfigJson = z.infer<typeof ConfigJsonSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd forge && npx vitest run tests/unit/types.test.ts -v`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
cd forge
git add src/types/index.ts tests/unit/types.test.ts
git commit -m "feat: add type definitions with Zod schemas for progress, config, scenarios"
```

---

### Task 3: Filesystem Utilities

**Files:**
- Create: `forge/src/utils/filesystem.ts`
- Create: `forge/tests/unit/utils/filesystem.test.ts`

- [ ] **Step 1: Write failing test for filesystem utilities**

```typescript
// tests/unit/utils/filesystem.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  ensureDir,
  writeJson,
  readJson,
  fileExists,
  readTextFile,
  writeTextFile,
  moveDir,
} from '../../../src/utils/filesystem';

const testDir = path.join(__dirname, '__test_fs__');

describe('Filesystem Utilities', () => {
  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  describe('ensureDir', () => {
    it('should create directory if it does not exist', async () => {
      const dir = path.join(testDir, 'new-dir');
      await ensureDir(dir);
      expect(fs.existsSync(dir)).toBe(true);
    });

    it('should not throw if directory already exists', async () => {
      fs.mkdirSync(testDir, { recursive: true });
      await expect(ensureDir(testDir)).resolves.not.toThrow();
    });

    it('should create nested directories', async () => {
      const dir = path.join(testDir, 'a', 'b', 'c');
      await ensureDir(dir);
      expect(fs.existsSync(dir)).toBe(true);
    });
  });

  describe('writeJson / readJson', () => {
    it('should write and read JSON correctly', async () => {
      const filePath = path.join(testDir, 'test.json');
      const data = { name: 'test', value: 42 };
      await writeJson(filePath, data);
      const result = await readJson(filePath);
      expect(result).toEqual(data);
    });

    it('should create parent directories when writing JSON', async () => {
      const filePath = path.join(testDir, 'nested', 'test.json');
      const data = { key: 'value' };
      await writeJson(filePath, data);
      expect(fs.existsSync(filePath)).toBe(true);
      const result = await readJson(filePath);
      expect(result).toEqual(data);
    });
  });

  describe('fileExists', () => {
    it('should return true for existing file', async () => {
      const filePath = path.join(testDir, 'exists.txt');
      fs.writeFileSync(filePath, 'test');
      expect(await fileExists(filePath)).toBe(true);
    });

    it('should return false for non-existing file', async () => {
      expect(await fileExists(path.join(testDir, 'nope.txt'))).toBe(false);
    });
  });

  describe('readTextFile / writeTextFile', () => {
    it('should write and read text correctly', async () => {
      const filePath = path.join(testDir, 'text.txt');
      await writeTextFile(filePath, 'hello world');
      const content = await readTextFile(filePath);
      expect(content).toBe('hello world');
    });
  });

  describe('moveDir', () => {
    it('should move directory contents', async () => {
      const src = path.join(testDir, 'src-dir');
      const dest = path.join(testDir, 'dest-dir');
      fs.mkdirSync(src, { recursive: true });
      fs.writeFileSync(path.join(src, 'file.txt'), 'content');
      await moveDir(src, dest);
      expect(fs.existsSync(path.join(dest, 'file.txt'))).toBe(true);
      expect(fs.existsSync(src)).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd forge && npx vitest run tests/unit/utils/filesystem.test.ts -v`
Expected: FAIL — module not found

- [ ] **Step 3: Write filesystem utilities**

```typescript
// src/utils/filesystem.ts
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
  return JSON.parse(content) as T;
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd forge && npx vitest run tests/unit/utils/filesystem.test.ts -v`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
cd forge
git add src/utils/filesystem.ts tests/unit/utils/filesystem.test.ts
git commit -m "feat: add filesystem utilities for JSON/text operations and directory management"
```

---

### Task 4: Schema Validation Utilities

**Files:**
- Create: `forge/src/utils/schema.ts`
- Create: `forge/tests/unit/utils/schema.test.ts`

- [ ] **Step 1: Write failing test for schema validation**

```typescript
// tests/unit/utils/schema.test.ts
import { describe, it, expect } from 'vitest';
import { validateProgressJson, validateConfigJson, validateScenariosJson } from '../../../src/utils/schema';
import type { ProgressJson, ConfigJson, ScenariosJson } from '../../../src/types';

describe('Schema Validation', () => {
  describe('validateProgressJson', () => {
    it('should return success for valid progress.json', () => {
      const valid: ProgressJson = {
        version: '1.0',
        feature: 'test',
        status: 'planning',
        phase: 'brainstorming',
        created_at: '2026-05-21T08:00:00Z',
        updated_at: '2026-05-21T08:00:00Z',
        total_batches: 0,
        current_batch: 0,
        batches: [],
        verification: {
          status: 'pending',
          test_mode: 'normal',
          last_run: null,
          report_path: null,
        },
      };
      const result = validateProgressJson(valid);
      expect(result.success).toBe(true);
    });

    it('should return error for invalid status', () => {
      const invalid = {
        version: '1.0',
        feature: 'test',
        status: 'invalid',
        phase: 'brainstorming',
        created_at: '2026-05-21T08:00:00Z',
        updated_at: '2026-05-21T08:00:00Z',
        total_batches: 0,
        current_batch: 0,
        batches: [],
        verification: {
          status: 'pending',
          test_mode: 'normal',
          last_run: null,
          report_path: null,
        },
      };
      const result = validateProgressJson(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('status');
      }
    });
  });

  describe('validateConfigJson', () => {
    it('should return success for valid config.json', () => {
      const valid: ConfigJson = {
        version: '1.0',
        test_mode: 'normal',
        gstack_installed: false,
        batch_size: 6,
        test_command: 'npm test',
        test_framework: 'vitest',
        test_coverage: { unit: 80, integration: 60, e2e: 'P0' },
        project_type: 'new',
        platforms: ['claude', 'opencode'],
      };
      const result = validateConfigJson(valid);
      expect(result.success).toBe(true);
    });

    it('should return error for invalid batch_size', () => {
      const invalid = {
        version: '1.0',
        test_mode: 'normal',
        gstack_installed: false,
        batch_size: 0,
        test_command: 'npm test',
        test_framework: 'vitest',
        test_coverage: { unit: 80, integration: 60, e2e: 'P0' },
        project_type: 'new',
        platforms: ['claude', 'opencode'],
      };
      const result = validateConfigJson(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('validateScenariosJson', () => {
    it('should return success for valid scenarios.json', () => {
      const valid: ScenariosJson = {
        version: '1.0',
        feature: 'test',
        source: 'proposal.md',
        generated_at: '2026-05-21T08:15:00Z',
        scenarios: [
          {
            id: 1,
            title: 'Test',
            given: 'Given',
            when: 'When',
            then: [{ assertion: 'Then', type: 'functional' }],
            testTypes: ['functional'],
            priority: 'P0',
          },
        ],
      };
      const result = validateScenariosJson(valid);
      expect(result.success).toBe(true);
    });

    it('should return error for invalid priority', () => {
      const invalid = {
        version: '1.0',
        feature: 'test',
        source: 'proposal.md',
        generated_at: '2026-05-21T08:15:00Z',
        scenarios: [
          {
            id: 1,
            title: 'Test',
            given: 'Given',
            when: 'When',
            then: [{ assertion: 'Then', type: 'functional' }],
            testTypes: ['functional'],
            priority: 'P3',
          },
        ],
      };
      const result = validateScenariosJson(invalid);
      expect(result.success).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd forge && npx vitest run tests/unit/utils/schema.test.ts -v`
Expected: FAIL — module not found

- [ ] **Step 3: Write schema validation utilities**

```typescript
// src/utils/schema.ts
import {
  ProgressJsonSchema,
  ConfigJsonSchema,
  ScenariosJsonSchema,
  type ProgressJson,
  type ConfigJson,
  type ScenariosJson,
} from '../types';

export type ValidationResult =
  | { success: true }
  | { success: false; error: string };

export function validateProgressJson(data: unknown): ValidationResult {
  const result = ProgressJsonSchema.safeParse(data);
  if (result.success) return { success: true };
  return { success: false, error: formatZodError(result.error) };
}

export function validateConfigJson(data: unknown): ValidationResult {
  const result = ConfigJsonSchema.safeParse(data);
  if (result.success) return { success: true };
  return { success: false, error: formatZodError(result.error) };
}

export function validateScenariosJson(data: unknown): ValidationResult {
  const result = ScenariosJsonSchema.safeParse(data);
  if (result.success) return { success: true };
  return { success: false, error: formatZodError(result.error) };
}

function formatZodError(error: import('zod').ZodError): string {
  return error.errors
    .map((e) => `${e.path.join('.')}: ${e.message}`)
    .join('; ');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd forge && npx vitest run tests/unit/utils/schema.test.ts -v`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
cd forge
git add src/utils/schema.ts tests/unit/utils/schema.test.ts
git commit -m "feat: add schema validation utilities using Zod"
```

---

### Task 5: Environment Detection Utilities

**Files:**
- Create: `forge/src/utils/detect.ts`
- Create: `forge/tests/unit/utils/detect.test.ts`

- [ ] **Step 1: Write failing test for environment detection**

```typescript
// tests/unit/utils/detect.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  detectGit,
  detectSuperpowers,
  detectTestFramework,
  TestFrameworkInfo,
} from '../../../src/utils/detect';

const testDir = path.join(__dirname, '__test_detect__');

describe('Environment Detection', () => {
  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  describe('detectGit', () => {
    it('should return true when .git directory exists', async () => {
      fs.mkdirSync(path.join(testDir, '.git'));
      const result = await detectGit(testDir);
      expect(result).toBe(true);
    });

    it('should return false when .git directory does not exist', async () => {
      const result = await detectGit(testDir);
      expect(result).toBe(false);
    });
  });

  describe('detectSuperpowers', () => {
    it('should return true when superpowers skills exist', async () => {
      const skillsDir = path.join(testDir, '.agents', 'skills', 'superpowers');
      fs.mkdirSync(skillsDir, { recursive: true });
      const result = await detectSuperpowers(testDir);
      expect(result).toBe(true);
    });

    it('should return false when superpowers skills do not exist', async () => {
      const result = await detectSuperpowers(testDir);
      expect(result).toBe(false);
    });
  });

  describe('detectTestFramework', () => {
    it('should detect npm test from package.json with vitest', async () => {
      const pkg = {
        scripts: { test: 'vitest run' },
        devDependencies: { vitest: '^1.0.0' },
      };
      fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify(pkg));
      const result = await detectTestFramework(testDir);
      expect(result).toEqual({
        command: 'npm test',
        framework: 'vitest',
      });
    });

    it('should detect pytest from pytest.ini', async () => {
      fs.writeFileSync(path.join(testDir, 'pytest.ini'), '');
      const result = await detectTestFramework(testDir);
      expect(result).toEqual({
        command: 'pytest',
        framework: 'pytest',
      });
    });

    it('should detect go test from go.mod', async () => {
      fs.writeFileSync(path.join(testDir, 'go.mod'), 'module test');
      const result = await detectTestFramework(testDir);
      expect(result).toEqual({
        command: 'go test',
        framework: 'go test',
      });
    });

    it('should detect cargo test from Cargo.toml', async () => {
      fs.writeFileSync(path.join(testDir, 'Cargo.toml'), '[package]');
      const result = await detectTestFramework(testDir);
      expect(result).toEqual({
        command: 'cargo test',
        framework: 'cargo test',
      });
    });

    it('should return null when no test framework detected', async () => {
      const result = await detectTestFramework(testDir);
      expect(result).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd forge && npx vitest run tests/unit/utils/detect.test.ts -v`
Expected: FAIL — module not found

- [ ] **Step 3: Write environment detection utilities**

```typescript
// src/utils/detect.ts
import * as fs from 'fs';
import * as path from 'path';

export async function detectGit(projectRoot: string): Promise<boolean> {
  const gitDir = path.join(projectRoot, '.git');
  try {
    const stat = await fs.promises.stat(gitDir);
    return stat.isDirectory();
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
  const pyprojectToml = path.join(projectRoot, 'pyproject.toml');
  const setupPy = path.join(projectRoot, 'setup.py');
  if (
    (await fileExists(pytestIni)) ||
    (await fileExists(pyprojectToml)) ||
    (await fileExists(setupPy))
  ) {
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd forge && npx vitest run tests/unit/utils/detect.test.ts -v`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
cd forge
git add src/utils/detect.ts tests/unit/utils/detect.test.ts
git commit -m "feat: add environment detection utilities for git, superpowers, test frameworks"
```

---

### Task 6: forge init Command

**Files:**
- Create: `forge/src/commands/init.ts`
- Create: `forge/tests/unit/commands/init.test.ts`

- [ ] **Step 1: Write failing test for forge init command**

```typescript
// tests/unit/commands/init.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { runInit } from '../../../src/commands/init';

const testDir = path.join(__dirname, '__test_init__');

describe('forge init', () => {
  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should create directory structure for new project', async () => {
    const output = await runInit(testDir, { platforms: ['opencode'] });

    expect(fs.existsSync(path.join(testDir, 'docs', 'forge', 'specs'))).toBe(true);
    expect(fs.existsSync(path.join(testDir, 'docs', 'forge', 'changes'))).toBe(true);
    expect(fs.existsSync(path.join(testDir, 'docs', 'forge', 'changes', 'archive'))).toBe(true);
    expect(fs.existsSync(path.join(testDir, 'docs', 'forge', 'decisions'))).toBe(true);
    expect(fs.existsSync(path.join(testDir, '.forge', 'config.json'))).toBe(true);
    expect(fs.existsSync(path.join(testDir, '.forge', 'progress.json'))).toBe(true);
  });

  it('should generate valid config.json', async () => {
    await runInit(testDir, { platforms: ['opencode'] });

    const configPath = path.join(testDir, '.forge', 'config.json');
    const content = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(content.version).toBe('1.0');
    expect(content.test_mode).toBe('normal');
    expect(content.project_type).toBe('new');
    expect(content.platforms).toContain('opencode');
  });

  it('should generate valid progress.json', async () => {
    await runInit(testDir, { platforms: ['opencode'] });

    const progressPath = path.join(testDir, '.forge', 'progress.json');
    const content = JSON.parse(fs.readFileSync(progressPath, 'utf-8'));
    expect(content.version).toBe('1.0');
    expect(content.status).toBe('idle');
  });

  it('should detect existing project when .git exists', async () => {
    fs.mkdirSync(path.join(testDir, '.git'));
    await runInit(testDir, { platforms: ['opencode'] });

    const configPath = path.join(testDir, '.forge', 'config.json');
    const content = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(content.project_type).toBe('existing');
  });

  it('should generate platform manifest', async () => {
    await runInit(testDir, { platforms: ['opencode'] });

    const manifestPath = path.join(testDir, '.opencode', 'plugin.json');
    expect(fs.existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(manifest.name).toBe('forge');
    expect(manifest.skills).toHaveLength(5);
  });

  it('should generate Claude Code manifest when platform includes claude', async () => {
    await runInit(testDir, { platforms: ['claude'] });

    const manifestPath = path.join(testDir, '.claude-plugin', 'plugin.json');
    expect(fs.existsSync(manifestPath)).toBe(true);
  });

  it('should return success message', async () => {
    const output = await runInit(testDir, { platforms: ['opencode'] });
    expect(output.success).toBe(true);
    expect(output.message).toContain('Forge initialized');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd forge && npx vitest run tests/unit/commands/init.test.ts -v`
Expected: FAIL — module not found

- [ ] **Step 3: Write forge init command**

```typescript
// src/commands/init.ts
import * as fs from 'fs';
import * as path from 'path';
import { ensureDir, writeJson, readTextFile, writeTextFile, fileExists } from '../utils/filesystem';
import { detectGit, detectSuperpowers, detectTestFramework } from '../utils/detect';
import type { ConfigJson, ProgressJson } from '../types';

export interface InitOptions {
  platforms: ('claude' | 'opencode' | 'codex')[];
}

export interface InitResult {
  success: boolean;
  message: string;
  warnings: string[];
}

export async function runInit(
  projectRoot: string,
  options: InitOptions,
): Promise<InitResult> {
  const warnings: string[] = [];

  // 1. Detect project type
  const hasGit = await detectGit(projectRoot);
  const projectType = hasGit ? 'existing' : 'new';

  // 2. Detect Superpowers
  const hasSuperpowers = await detectSuperpowers(projectRoot);
  if (!hasSuperpowers) {
    warnings.push(
      'Superpowers not detected. Install with: git clone https://github.com/anomalyco/superpowers ~/.agents/skills/superpowers',
    );
  }

  // 3. Detect GitNexus (existing projects only)
  if (projectType === 'existing') {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    const gitnexusPath = path.join(homeDir, '.agents', 'skills', 'gitnexus');
    const hasGitnexus = await fileExists(gitnexusPath);
    if (!hasGitnexus) {
      warnings.push(
        'GitNexus not detected. For existing projects, install with: npm install -g @gitnexus/cli',
      );
    }
  }

  // 4. Detect test framework
  const testInfo = await detectTestFramework(projectRoot);
  const testCommand = testInfo?.command || 'npm test';
  const testFramework = testInfo?.framework || 'unknown';

  // 5. Generate directory structure
  const dirs = [
    path.join(projectRoot, 'docs', 'forge', 'specs'),
    path.join(projectRoot, 'docs', 'forge', 'changes'),
    path.join(projectRoot, 'docs', 'forge', 'changes', 'archive'),
    path.join(projectRoot, 'docs', 'forge', 'decisions'),
    path.join(projectRoot, '.forge'),
  ];
  for (const dir of dirs) {
    await ensureDir(dir);
  }

  // 6. Generate config.json
  const config: ConfigJson = {
    version: '1.0',
    test_mode: 'normal',
    gstack_installed: false,
    batch_size: 6,
    test_command: testCommand,
    test_framework: testFramework,
    test_coverage: {
      unit: 80,
      integration: 60,
      e2e: 'P0',
    },
    project_type: projectType,
    platforms: options.platforms,
  };
  await writeJson(path.join(projectRoot, '.forge', 'config.json'), config);

  // 7. Generate progress.json
  const progress: ProgressJson = {
    version: '1.0',
    feature: '',
    status: 'idle',
    phase: 'brainstorming',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    total_batches: 0,
    current_batch: 0,
    batches: [],
    verification: {
      status: 'pending',
      test_mode: 'normal',
      last_run: null,
      report_path: null,
    },
  };
  await writeJson(path.join(projectRoot, '.forge', 'progress.json'), progress);

  // 8. Generate platform manifests
  for (const platform of options.platforms) {
    await generateManifest(projectRoot, platform);
  }

  // 9. Initialize CLAUDE.md
  await initializeClaudeMd(projectRoot);

  const message = `Forge initialized successfully.

Project type: ${projectType}
Test framework: ${testFramework} (${testCommand})
Platforms: ${options.platforms.join(', ')}
${warnings.length > 0 ? '\nWarnings:\n' + warnings.map((w) => `  - ${w}`).join('\n') : ''}

Next steps:
  1. Install Forge skills: npx forge skills install
  2. Start a feature: /start "your feature description"
`;

  return { success: true, message, warnings };
}

async function generateManifest(projectRoot: string, platform: string): Promise<void> {
  const manifestDir =
    platform === 'claude'
      ? path.join(projectRoot, '.claude-plugin')
      : platform === 'opencode'
        ? path.join(projectRoot, '.opencode')
        : path.join(projectRoot, '.codex-plugin');

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

async function initializeClaudeMd(projectRoot: string): Promise<void> {
  const claudeMdPath = path.join(projectRoot, 'CLAUDE.md');

  const forgeSection = `## Forge

**Project Info**
- Test mode: normal
- Platforms: Claude Code + OpenCode

**Current Feature**
- None (idle)

**Key Decisions**
- (Will be recorded as features are completed)

**Completed Features**
- (None yet)
`;

  if (await fileExists(claudeMdPath)) {
    const existing = await readTextFile(claudeMdPath);
    if (!existing.includes('## Forge')) {
      await writeTextFile(claudeMdPath, existing + '\n' + forgeSection);
    }
  } else {
    await writeTextFile(claudeMdPath, forgeSection);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd forge && npx vitest run tests/unit/commands/init.test.ts -v`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
cd forge
git add src/commands/init.ts tests/unit/commands/init.test.ts
git commit -m "feat: implement forge init command with directory structure and manifest generation"
```

---

### Task 7: forge status Command

**Files:**
- Create: `forge/src/commands/status.ts`
- Create: `forge/tests/unit/commands/status.test.ts`

- [ ] **Step 1: Write failing test for forge status command**

```typescript
// tests/unit/commands/status.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { runStatus } from '../../../src/commands/status';

const testDir = path.join(__dirname, '__test_status__');

describe('forge status', () => {
  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should return idle status when no feature is active', async () => {
    const progress = {
      version: '1.0',
      feature: '',
      status: 'idle',
      phase: 'brainstorming',
      created_at: '2026-05-21T08:00:00Z',
      updated_at: '2026-05-21T08:00:00Z',
      total_batches: 0,
      current_batch: 0,
      batches: [],
      verification: {
        status: 'pending',
        test_mode: 'normal',
        last_run: null,
        report_path: null,
      },
    };
    fs.writeFileSync(
      path.join(testDir, 'progress.json'),
      JSON.stringify(progress),
    );

    const result = await runStatus(testDir);
    expect(result.success).toBe(true);
    expect(result.output).toContain('No active feature');
  });

  it('should show progress for executing feature', async () => {
    const progress = {
      version: '1.0',
      feature: 'user-auth',
      status: 'executing',
      phase: 'batch_execution',
      created_at: '2026-05-21T08:00:00Z',
      updated_at: '2026-05-21T10:30:00Z',
      total_batches: 3,
      current_batch: 2,
      batches: [
        {
          batch: 1,
          status: 'done',
          tasks: [
            { id: 1, title: 'Task 1', status: 'done' },
            { id: 2, title: 'Task 2', status: 'done' },
          ],
        },
        {
          batch: 2,
          status: 'in_progress',
          tasks: [
            { id: 3, title: 'Task 3', status: 'done' },
            { id: 4, title: 'Task 4', status: 'in_progress' },
          ],
        },
        {
          batch: 3,
          status: 'pending',
          tasks: [
            { id: 5, title: 'Task 5', status: 'pending' },
          ],
        },
      ],
      verification: {
        status: 'pending',
        test_mode: 'normal',
        last_run: null,
        report_path: null,
      },
    };
    fs.writeFileSync(
      path.join(testDir, 'progress.json'),
      JSON.stringify(progress),
    );

    const result = await runStatus(testDir);
    expect(result.success).toBe(true);
    expect(result.output).toContain('user-auth');
    expect(result.output).toContain('executing');
    expect(result.output).toContain('batch 2/3');
  });

  it('should return error when progress.json is missing', async () => {
    const result = await runStatus(testDir);
    expect(result.success).toBe(false);
    expect(result.error).toContain('progress.json');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd forge && npx vitest run tests/unit/commands/status.test.ts -v`
Expected: FAIL — module not found

- [ ] **Step 3: Write forge status command**

```typescript
// src/commands/status.ts
import * as path from 'path';
import { readJson, fileExists } from '../utils/filesystem';
import type { ProgressJson, Batch } from '../types';

export interface StatusResult {
  success: boolean;
  output?: string;
  error?: string;
}

export async function runStatus(projectRoot: string): Promise<StatusResult> {
  const progressPath = path.join(projectRoot, '.forge', 'progress.json');

  if (!(await fileExists(progressPath))) {
    return {
      success: false,
      error: 'Forge not initialized. Run: forge init',
    };
  }

  const progress = await readJson<ProgressJson>(progressPath);

  if (progress.status === 'idle') {
    return {
      success: true,
      output: 'Forge Status\n============\nNo active feature\n\nRun /start to begin a new feature.',
    };
  }

  const lines: string[] = [
    'Forge Status',
    '============',
    `Feature: ${progress.feature}`,
    `Status: ${progress.status}`,
    `Phase: ${progress.phase}`,
  ];

  if (progress.total_batches > 0) {
    lines.push(`Progress: batch ${progress.current_batch}/${progress.total_batches}`);
    lines.push('');

    for (const batch of progress.batches) {
      const doneCount = batch.tasks.filter((t) => t.status === 'done').length;
      const totalCount = batch.tasks.length;
      const icon = batch.status === 'done' ? '✅' : batch.status === 'in_progress' ? '🔄' : '⏳';
      lines.push(`${icon} Batch ${batch.batch}: ${batch.status} (${doneCount}/${totalCount} tasks done)`);
    }
  }

  lines.push('');
  lines.push(`Test mode: ${progress.verification.test_mode}`);

  return {
    success: true,
    output: lines.join('\n'),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd forge && npx vitest run tests/unit/commands/status.test.ts -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
cd forge
git add src/commands/status.ts tests/unit/commands/status.test.ts
git commit -m "feat: implement forge status command with progress visualization"
```

---

### Task 8: forge config Command

**Files:**
- Create: `forge/src/commands/config.ts`
- Create: `forge/tests/unit/commands/config.test.ts`

- [ ] **Step 1: Write failing test for forge config command**

```typescript
// tests/unit/commands/config.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { runConfigGet, runConfigSet, runConfigList } from '../../../src/commands/config';

const testDir = path.join(__dirname, '__test_config__');

const defaultConfig = {
  version: '1.0',
  test_mode: 'normal',
  gstack_installed: false,
  batch_size: 6,
  test_command: 'npm test',
  test_framework: 'vitest',
  test_coverage: { unit: 80, integration: 60, e2e: 'P0' },
  project_type: 'new',
  platforms: ['opencode'],
};

describe('forge config', () => {
  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(path.join(testDir, '.forge'), { recursive: true });
    fs.writeFileSync(
      path.join(testDir, '.forge', 'config.json'),
      JSON.stringify(defaultConfig),
    );
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  describe('config get', () => {
    it('should get top-level value', async () => {
      const result = await runConfigGet(testDir, 'test_mode');
      expect(result.success).toBe(true);
      expect(result.value).toBe('normal');
    });

    it('should get nested value with dot notation', async () => {
      const result = await runConfigGet(testDir, 'test_coverage.unit');
      expect(result.success).toBe(true);
      expect(result.value).toBe(80);
    });

    it('should return error for missing key', async () => {
      const result = await runConfigGet(testDir, 'nonexistent');
      expect(result.success).toBe(false);
    });
  });

  describe('config set', () => {
    it('should set top-level value', async () => {
      const result = await runConfigSet(testDir, 'test_mode', 'enhanced');
      expect(result.success).toBe(true);

      const config = JSON.parse(
        fs.readFileSync(path.join(testDir, '.forge', 'config.json'), 'utf-8'),
      );
      expect(config.test_mode).toBe('enhanced');
    });

    it('should set nested value with dot notation', async () => {
      const result = await runConfigSet(testDir, 'test_coverage.unit', 90);
      expect(result.success).toBe(true);

      const config = JSON.parse(
        fs.readFileSync(path.join(testDir, '.forge', 'config.json'), 'utf-8'),
      );
      expect(config.test_coverage.unit).toBe(90);
    });
  });

  describe('config list', () => {
    it('should list all config values', async () => {
      const result = await runConfigList(testDir);
      expect(result.success).toBe(true);
      expect(result.output).toContain('test_mode');
      expect(result.output).toContain('batch_size');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd forge && npx vitest run tests/unit/commands/config.test.ts -v`
Expected: FAIL — module not found

- [ ] **Step 3: Write forge config command**

```typescript
// src/commands/config.ts
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

export async function runConfigGet(
  projectRoot: string,
  key: string,
): Promise<ConfigGetResult> {
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

export async function runConfigSet(
  projectRoot: string,
  key: string,
  value: unknown,
): Promise<ConfigSetResult> {
  const configPath = path.join(projectRoot, '.forge', 'config.json');

  if (!(await fileExists(configPath))) {
    return { success: false, error: 'Forge not initialized. Run: forge init' };
  }

  const config = await readJson<ConfigJson>(configPath);
  setNestedValue(config, key, value);
  await writeJson(configPath, config);

  return { success: true };
}

export async function runConfigList(
  projectRoot: string,
): Promise<ConfigListResult> {
  const configPath = path.join(projectRoot, '.forge', 'config.json');

  if (!(await fileExists(configPath))) {
    return { success: false, error: 'Forge not initialized. Run: forge init' };
  }

  const config = await readJson<ConfigJson>(configPath);
  const lines = ['Forge Config', '============'];

  function flatten(obj: Record<string, unknown>, prefix = ''): void {
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        flatten(value as Record<string, unknown>, fullKey);
      } else {
        lines.push(`${fullKey}: ${JSON.stringify(value)}`);
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

function setNestedValue(
  obj: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd forge && npx vitest run tests/unit/commands/config.test.ts -v`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
cd forge
git add src/commands/config.ts tests/unit/commands/config.test.ts
git commit -m "feat: implement forge config command with get/set/list and dot notation"
```

---

### Task 9: forge validate Command

**Files:**
- Create: `forge/src/commands/validate.ts`
- Create: `forge/tests/unit/commands/validate.test.ts`

- [ ] **Step 1: Write failing test for forge validate command**

```typescript
// tests/unit/commands/validate.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { runValidate } from '../../../src/commands/validate';

const testDir = path.join(__dirname, '__test_validate__');

describe('forge validate', () => {
  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(path.join(testDir, '.forge'), { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should validate all files when valid', async () => {
    const config = {
      version: '1.0',
      test_mode: 'normal',
      gstack_installed: false,
      batch_size: 6,
      test_command: 'npm test',
      test_framework: 'vitest',
      test_coverage: { unit: 80, integration: 60, e2e: 'P0' },
      project_type: 'new',
      platforms: ['opencode'],
    };
    fs.writeFileSync(
      path.join(testDir, '.forge', 'config.json'),
      JSON.stringify(config),
    );

    const progress = {
      version: '1.0',
      feature: 'test',
      status: 'idle',
      phase: 'brainstorming',
      created_at: '2026-05-21T08:00:00Z',
      updated_at: '2026-05-21T08:00:00Z',
      total_batches: 0,
      current_batch: 0,
      batches: [],
      verification: {
        status: 'pending',
        test_mode: 'normal',
        last_run: null,
        report_path: null,
      },
    };
    fs.writeFileSync(
      path.join(testDir, '.forge', 'progress.json'),
      JSON.stringify(progress),
    );

    const result = await runValidate(testDir);
    expect(result.success).toBe(true);
    expect(result.output).toContain('config.json: ✅ valid');
    expect(result.output).toContain('progress.json: ✅ valid');
  });

  it('should report validation errors', async () => {
    const invalidConfig = { version: '2.0' };
    fs.writeFileSync(
      path.join(testDir, '.forge', 'config.json'),
      JSON.stringify(invalidConfig),
    );

    const result = await runValidate(testDir);
    expect(result.success).toBe(false);
    expect(result.output).toContain('config.json: ❌ invalid');
  });

  it('should return error when files are missing', async () => {
    const result = await runValidate(testDir);
    expect(result.success).toBe(false);
    expect(result.output).toContain('config.json: ❌ missing');
  });

  it('should validate scenarios.json if it exists', async () => {
    const config = {
      version: '1.0',
      test_mode: 'normal',
      gstack_installed: false,
      batch_size: 6,
      test_command: 'npm test',
      test_framework: 'vitest',
      test_coverage: { unit: 80, integration: 60, e2e: 'P0' },
      project_type: 'new',
      platforms: ['opencode'],
    };
    fs.writeFileSync(
      path.join(testDir, '.forge', 'config.json'),
      JSON.stringify(config),
    );

    const progress = {
      version: '1.0',
      feature: 'test',
      status: 'idle',
      phase: 'brainstorming',
      created_at: '2026-05-21T08:00:00Z',
      updated_at: '2026-05-21T08:00:00Z',
      total_batches: 0,
      current_batch: 0,
      batches: [],
      verification: {
        status: 'pending',
        test_mode: 'normal',
        last_run: null,
        report_path: null,
      },
    };
    fs.writeFileSync(
      path.join(testDir, '.forge', 'progress.json'),
      JSON.stringify(progress),
    );

    const scenarios = {
      version: '1.0',
      feature: 'test',
      source: 'proposal.md',
      generated_at: '2026-05-21T08:15:00Z',
      scenarios: [
        {
          id: 1,
          title: 'Test',
          given: 'Given',
          when: 'When',
          then: [{ assertion: 'Then', type: 'functional' }],
          testTypes: ['functional'],
          priority: 'P0',
        },
      ],
    };
    fs.writeFileSync(
      path.join(testDir, 'docs', 'forge', 'changes', 'test', 'scenarios.json'),
      JSON.stringify(scenarios),
    );

    const result = await runValidate(testDir);
    expect(result.success).toBe(true);
    expect(result.output).toContain('scenarios.json');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd forge && npx vitest run tests/unit/commands/validate.test.ts -v`
Expected: FAIL — module not found

- [ ] **Step 3: Write forge validate command**

```typescript
// src/commands/validate.ts
import * as fs from 'fs';
import * as path from 'path';
import { readJson, fileExists } from '../utils/filesystem';
import { validateConfigJson, validateProgressJson, validateScenariosJson } from '../utils/schema';

export interface ValidateResult {
  success: boolean;
  output: string;
}

export async function runValidate(projectRoot: string): Promise<ValidateResult> {
  const lines: string[] = ['Forge Validate', '=============='];
  let allValid = true;
  const warnings: string[] = [];

  // Validate config.json
  const configPath = path.join(projectRoot, '.forge', 'config.json');
  if (await fileExists(configPath)) {
    const config = await readJson(configPath);
    const result = validateConfigJson(config);
    if (result.success) {
      lines.push('config.json: ✅ valid');
    } else {
      lines.push(`config.json: ❌ invalid — ${result.error}`);
      allValid = false;
    }
  } else {
    lines.push('config.json: ❌ missing');
    allValid = false;
  }

  // Validate progress.json
  const progressPath = path.join(projectRoot, '.forge', 'progress.json');
  if (await fileExists(progressPath)) {
    const progress = await readJson(progressPath);
    const result = validateProgressJson(progress);
    if (result.success) {
      lines.push('progress.json: ✅ valid');
    } else {
      lines.push(`progress.json: ❌ invalid — ${result.error}`);
      allValid = false;
    }
  } else {
    lines.push('progress.json: ❌ missing');
    allValid = false;
  }

  // Validate scenarios.json (if active feature has one)
  const changesDir = path.join(projectRoot, 'docs', 'forge', 'changes');
  if (await fileExists(changesDir)) {
    const entries = await fs.promises.readdir(changesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== 'archive') {
        const scenariosPath = path.join(changesDir, entry.name, 'scenarios.json');
        if (await fileExists(scenariosPath)) {
          const scenarios = await readJson(scenariosPath);
          const result = validateScenariosJson(scenarios);
          const scenarioCount = scenarios.scenarios?.length || 0;
          const p0Count = scenarios.scenarios?.filter((s: { priority: string }) => s.priority === 'P0').length || 0;
          const p1Count = scenarios.scenarios?.filter((s: { priority: string }) => s.priority === 'P1').length || 0;
          if (result.success) {
            lines.push(`scenarios.json: ✅ valid (${scenarioCount} scenarios, ${p0Count} P0, ${p1Count} P1)`);
          } else {
            lines.push(`scenarios.json: ❌ invalid — ${result.error}`);
            allValid = false;
          }
        }
      }
    }
  }

  // Check for inconsistencies
  if (await fileExists(progressPath)) {
    const progress = await readJson(progressPath);
    if (progress.status !== 'idle') {
      for (const batch of progress.batches || []) {
        for (const task of batch.tasks || []) {
          if (task.status === 'done' && !task.commit) {
            warnings.push(`task ${task.id} marked done but no commit found`);
          }
        }
      }
    }
  }

  if (warnings.length > 0) {
    lines.push('');
    lines.push('Warnings:');
    for (const w of warnings) {
      lines.push(`  - ${w}`);
    }
  }

  return {
    success: allValid && warnings.length === 0,
    output: lines.join('\n'),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd forge && npx vitest run tests/unit/commands/validate.test.ts -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
cd forge
git add src/commands/validate.ts tests/unit/commands/validate.test.ts
git commit -m "feat: implement forge validate command with schema validation and consistency checks"
```

---

### Task 10: CLI Entry Point

**Files:**
- Create: `forge/src/index.ts`

- [ ] **Step 1: Write CLI entry point**

```typescript
#!/usr/bin/env tsx
// Forge CLI - AI-driven software development orchestration

import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import { runInit } from './commands/init';
import { runStatus } from './commands/status';
import { runConfigGet, runConfigSet, runConfigList } from './commands/config';
import { runValidate } from './commands/validate';

const program = new Command();

program
  .name('forge')
  .description('AI-driven software development orchestration CLI')
  .version('0.1.0');

// forge init
program
  .command('init')
  .description('Initialize Forge in the current project')
  .option('--platforms <platforms>', 'Comma-separated list of platforms (claude,opencode,codex)', 'opencode')
  .action(async (opts) => {
    const projectRoot = process.cwd();
    const platforms = opts.platforms.split(',').map((p: string) => p.trim());
    const result = await runInit(projectRoot, { platforms });
    console.log(result.message);
    if (result.warnings.length > 0) {
      process.exitCode = 1;
    }
  });

// forge status
program
  .command('status')
  .description('Show current Forge status')
  .action(async () => {
    const projectRoot = process.cwd();
    const result = await runStatus(projectRoot);
    if (result.success) {
      console.log(result.output);
    } else {
      console.error(result.error);
      process.exitCode = 1;
    }
  });

// forge config
const configCmd = program
  .command('config')
  .description('Manage Forge configuration');

configCmd
  .command('get <key>')
  .description('Get a config value')
  .action(async (key) => {
    const projectRoot = process.cwd();
    const result = await runConfigGet(projectRoot, key);
    if (result.success) {
      console.log(result.value);
    } else {
      console.error(result.error);
      process.exitCode = 1;
    }
  });

configCmd
  .command('set <key> <value>')
  .description('Set a config value')
  .action(async (key, value) => {
    const projectRoot = process.cwd();
    // Try to parse as number, boolean, or JSON
    let parsed: unknown = value;
    if (value === 'true') parsed = true;
    else if (value === 'false') parsed = false;
    else if (!isNaN(Number(value))) parsed = Number(value);
    else {
      try {
        parsed = JSON.parse(value);
      } catch {
        // Keep as string
      }
    }
    const result = await runConfigSet(projectRoot, key, parsed);
    if (result.success) {
      console.log(`Config updated: ${key} = ${JSON.stringify(parsed)}`);
    } else {
      console.error(result.error);
      process.exitCode = 1;
    }
  });

configCmd
  .command('list')
  .description('List all config values')
  .action(async () => {
    const projectRoot = process.cwd();
    const result = await runConfigList(projectRoot);
    if (result.success) {
      console.log(result.output);
    } else {
      console.error(result.error);
      process.exitCode = 1;
    }
  });

// forge validate
program
  .command('validate')
  .description('Validate Forge state files')
  .action(async () => {
    const projectRoot = process.cwd();
    const result = await runValidate(projectRoot);
    console.log(result.output);
    if (!result.success) {
      process.exitCode = 1;
    }
  });

program.parse();
```

- [ ] **Step 2: Test CLI commands manually**

Run: `cd forge && npx tsx src/index.ts --help`
Expected: Shows help with init, status, config, validate commands

Run: `cd forge && npx tsx src/index.ts init --platforms opencode`
Expected: Initializes forge in current directory

Run: `cd forge && npx tsx src/index.ts status`
Expected: Shows idle status

Run: `cd forge && npx tsx src/index.ts config list`
Expected: Lists all config values

Run: `cd forge && npx tsx src/index.ts validate`
Expected: Shows all files valid

- [ ] **Step 3: Commit**

```bash
cd forge
git add src/index.ts
git commit -m "feat: add CLI entry point with commander for init, status, config, validate commands"
```

---

### Task 11: Run Full Test Suite

**Files:**
- No new files

- [ ] **Step 1: Run all tests**

Run: `cd forge && npx vitest run`
Expected: All tests pass (50+ tests across all modules)

- [ ] **Step 2: Check test coverage**

Run: `cd forge && npx vitest run --coverage`
Expected: Coverage ≥80% for all source files

- [ ] **Step 3: Commit**

```bash
cd forge
git add .
git commit -m "chore: verify full test suite passes for Phase 1a"
```

---

## Self-Review Checklist

1. **Spec coverage:** ✅ All Phase 1a requirements covered:
   - CLI with 4 commands (init, status, config, validate) ✅
   - Directory structure generation ✅
   - Config.json + progress.json schemas ✅
   - Environment detection (git, superpowers, test framework) ✅
   - Platform manifest generation ✅
   - CLAUDE.md initialization ✅
   - TDD throughout ✅

2. **No placeholders:** ✅ Every step has complete code, exact file paths, exact commands

3. **Type consistency:** ✅ All types defined in Task 2, used consistently across all commands

4. **Test quality:** ✅ Tests validate actual behavior, not just "something returned"
