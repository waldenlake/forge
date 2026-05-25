# Forge v2 CLI Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Forge v2 as a CLI Runtime that owns state mutation, validation, testing, git operations, memory writes, guard triggering, and audit output.

**Architecture:** Add a TypeScript CLI under `cli/` and convert Forge skills into thin orchestration wrappers. Runtime commands read and write `.forge/` files through schema-validated state modules; skills only call CLI commands, interpret JSON, invoke Superpowers skills, and talk to the user.

**Tech Stack:** Node.js 20+, TypeScript, commander, ajv, Vitest, JSON Schema Draft-07, Markdown skills.

---

## File Structure

Create:
- `cli/package.json`: CLI package, build/test scripts, runtime dependencies.
- `cli/tsconfig.json`: TypeScript config for `src` to `dist`.
- `cli/src/index.ts`: command registration and JSON output boundary.
- `cli/src/types.ts`: shared Forge state and command result types.
- `cli/src/lib/schema.ts`: AJV schema loading and validation.
- `cli/src/lib/detect.ts`: project, memory file, test profile, optional tool detection.
- `cli/src/lib/runner.ts`: command execution helper.
- `cli/src/lib/git.ts`: git helpers for commits, logs, changed files.
- `cli/src/lib/guard.ts`: deterministic guard trigger calculation.
- `cli/src/lib/logger.ts`: optional JSONL logger helper.
- `cli/src/state/config.ts`: read/write `.forge/config.json`.
- `cli/src/state/progress.ts`: read/write `.forge/progress.json`.
- `cli/src/state/memory.ts`: update and verify memory file sections.
- `cli/src/commands/*.ts`: one file per command group.
- `cli/src/commands/feature.ts`: feature planning state initialization.
- `cli/src/commands/plan.ts`: plan file task extraction and registration.
- `cli/src/migrations/config-1-to-2.ts`: v1 config to v2 config migration.
- `cli/test/*.test.ts`: CLI unit and integration-style tests with temp directories.
- `cli/install.sh`: local wrapper installer for Claude/plugin install path.

Modify:
- `schemas/config.schema.json`: upgrade to config version `2.0` with `test_profiles`.
- `schemas/progress.schema.json`: allow task fields needed by v2 guards, including optional `tags`, `requires_human_review`, `failure_reason`.
- `.gitignore`: ignore `cli/node_modules/`, `cli/dist/`, `.forge/`, and test temp output.
- `package.json`: plugin root metadata version `0.2.0`.
- `.claude-plugin/plugin.json`: version `0.2.0`, install script pointer.
- `README.md`: v2 CLI installation, command model, and migration notes.
- `.opencode/INSTALL.md`: mention CLI wrapper installation.
- `scripts/install-opencode.sh`: install/update CLI dependencies and build CLI.
- `scripts/install-opencode.cmd`: Windows install path for CLI build and wrapper.
- `skills/start/SKILL.md`: use `forge init`, `forge status`, and `forge phase:advance` boundary.
- `skills/next/SKILL.md`: use `forge phase:*`, `forge task:*`, `forge test`, `forge commit`, `forge verify`.
- `skills/progress-tracking/SKILL.md`: reduce to CLI-backed post-task helper or mark as internal compatibility wrapper.
- `skills/done/SKILL.md`: use `forge phase:finish`, `forge memory:complete-feature`, `forge reset`.
- `skills/resume/SKILL.md`: use `forge status`, `forge audit`, `forge commit:check`.
- `skills/bugfix/SKILL.md`: use CLI for progress state, test, commit, memory, reset.
- `skills/session-handoff/SKILL.md`: use `forge memory:set-feature`.
- `skills/using-forge/SKILL.md`: describe v2 CLI Runtime contract.

Do not modify:
- `docs/Forge-core-philosophy.md`.
- `docs/forge-design-spec-phase-1.md`.
- `docs/forge-design-spec-phase-2.md`.
- `docs/forge-cli-design.md`.
- Existing OpenCode bootstrap behavior except where install docs/scripts need CLI wiring.

---

### Task 1: Scaffold CLI Package And Baseline Tests

**Files:**
- Create: `cli/package.json`
- Create: `cli/tsconfig.json`
- Create: `cli/src/index.ts`
- Create: `cli/src/types.ts`
- Create: `cli/test/cli-baseline.test.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Write the failing baseline test**

Create `cli/test/cli-baseline.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cli = path.resolve(__dirname, '../dist/index.js');

describe('forge CLI baseline', () => {
  it('prints JSON version information', () => {
    const result = spawnSync(process.execPath, [cli, '--version-json'], {
      encoding: 'utf8',
      cwd: path.resolve(__dirname, '..')
    });

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      version: '0.2.0',
      compatible: true
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
cd cli
npm test -- cli-baseline.test.ts
```

Expected: FAIL because `cli/package.json` and `dist/index.js` do not exist.

- [ ] **Step 3: Add CLI package and minimal index**

Create `cli/package.json`:

```json
{
  "name": "@forge/cli",
  "version": "0.2.0",
  "type": "module",
  "bin": {
    "forge": "dist/index.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "check": "npm run build && npm test"
  },
  "dependencies": {
    "ajv": "^8.17.1",
    "commander": "^12.1.0"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

Create `cli/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "rootDir": "src",
    "outDir": "dist",
    "types": ["node"]
  },
  "include": ["src/**/*.ts"]
}
```

Create `cli/src/types.ts`:

```ts
export const FORGE_CLI_VERSION = '0.2.0';

export type JsonObject = Record<string, unknown>;

export interface CommandOk extends JsonObject {
  ok: true;
}

export interface CommandError extends JsonObject {
  ok: false;
  error: string;
}
```

Create `cli/src/index.ts`:

```ts
#!/usr/bin/env node
import { Command } from 'commander';
import { FORGE_CLI_VERSION } from './types.js';

const program = new Command();

program
  .name('forge')
  .description('Forge engineering runtime')
  .version(FORGE_CLI_VERSION);

program.option('--version-json', 'Print machine-readable version information');

program.action((options: { versionJson?: boolean }) => {
  if (options.versionJson) {
    process.stdout.write(JSON.stringify({
      ok: true,
      version: FORGE_CLI_VERSION,
      compatible: true
    }, null, 2) + '\n');
    return;
  }
  program.help();
});

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stdout.write(JSON.stringify({ ok: false, error: message }, null, 2) + '\n');
  process.exitCode = 1;
});
```

Modify `.gitignore` by adding:

```gitignore

# Forge CLI build/test output
cli/node_modules/
cli/dist/
cli/coverage/
cli/.vitest/
```

- [ ] **Step 4: Install dependencies and verify test passes**

Run:

```powershell
cd cli
npm install
npm run build
npm test -- cli-baseline.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add .gitignore cli/package.json cli/package-lock.json cli/tsconfig.json cli/src/index.ts cli/src/types.ts cli/test/cli-baseline.test.ts
git commit -m "feat(cli): scaffold forge runtime package"
```

---

### Task 2: Upgrade Schemas To v2 Config

**Files:**
- Modify: `schemas/config.schema.json`
- Modify: `schemas/progress.schema.json`
- Create: `cli/test/schema.test.ts`
- Create: `cli/src/lib/schema.ts`
- Create: `cli/src/commands/schema-validate.ts`
- Modify: `cli/src/index.ts`

- [ ] **Step 1: Write failing schema tests**

Create `cli/test/schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateJsonFile } from '../src/lib/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

describe('Forge schemas', () => {
  it('accepts v2 config with test profiles', () => {
    const result = validateJsonFile(
      path.join(repoRoot, 'schemas/config.schema.json'),
      {
        version: '2.0',
        forge_cli_version: '0.2.0',
        memory_file: 'AGENTS.md',
        test_mode: 'normal',
        gstack_installed: false,
        project_type: 'existing',
        test_profiles: {
          default: {
            framework: 'vitest',
            command: 'npx vitest run',
            coverage_command: 'npx vitest run --coverage',
            working_dir: '.'
          }
        },
        test_coverage: { unit: 80, integration: 60, e2e: 'P0' },
        guards: {
          'batch-review': {
            enabled: true,
            every_n_tasks: 6,
            actions: ['spec-compliance-review']
          }
        }
      }
    );

    expect(result.ok).toBe(true);
  });

  it('rejects v1 config fields in v2 runtime', () => {
    const result = validateJsonFile(
      path.join(repoRoot, 'schemas/config.schema.json'),
      {
        version: '1.0',
        memory_file: 'AGENTS.md',
        test_mode: 'normal',
        project_type: 'existing',
        test_command: 'npm test',
        test_framework: 'npm'
      }
    );

    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('version');
  });

  it('schema:validate validates a file path', () => {
    const configPath = path.join(repoRoot, 'schemas/config.schema.json');
    const result = spawnSync(process.execPath, [
      path.join(repoRoot, 'cli/dist/index.js'),
      'schema:validate',
      '--file',
      configPath,
      '--schema',
      configPath
    ], { encoding: 'utf8', cwd: repoRoot });

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
cd cli
npm test -- schema.test.ts
```

Expected: FAIL because `cli/src/lib/schema.ts` and `schema:validate` do not exist and current config schema is v1.

- [ ] **Step 3: Implement schema helper**

Create `cli/src/lib/schema.ts`:

```ts
import fs from 'node:fs';
import Ajv, { type ErrorObject } from 'ajv';

export interface SchemaValidationResult {
  ok: boolean;
  errors: string[];
}

const ajv = new Ajv({ allErrors: true, strict: false });

export function validateJsonFile(schemaPath: string, value: unknown): SchemaValidationResult {
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8')) as object;
  const validate = ajv.compile(schema);
  const ok = validate(value);
  return {
    ok,
    errors: ok ? [] : formatErrors(validate.errors ?? [])
  };
}

function formatErrors(errors: ErrorObject[]): string[] {
  return errors.map((error) => {
    const path = error.instancePath || '/';
    return `${path} ${error.message ?? 'is invalid'}`;
  });
}
```

- [ ] **Step 4: Replace config schema with v2 contract**

Update `schemas/config.schema.json` so it has:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Forge Config",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "version",
    "forge_cli_version",
    "memory_file",
    "test_mode",
    "project_type",
    "test_profiles",
    "guards"
  ],
  "properties": {
    "version": { "type": "string", "const": "2.0" },
    "forge_cli_version": { "type": "string" },
    "memory_file": { "type": "string", "enum": ["CLAUDE.md", "AGENTS.md", "GEMINI.md"] },
    "test_mode": { "type": "string", "enum": ["normal", "enhanced"] },
    "gstack_installed": { "type": "boolean" },
    "project_type": { "type": "string", "enum": ["new", "existing"] },
    "test_profiles": {
      "type": "object",
      "minProperties": 1,
      "additionalProperties": {
        "type": "object",
        "additionalProperties": false,
        "required": ["framework", "command", "working_dir"],
        "properties": {
          "framework": { "type": "string", "minLength": 1 },
          "command": { "type": "string", "minLength": 1 },
          "coverage_command": { "type": "string" },
          "working_dir": { "type": "string", "minLength": 1 }
        }
      }
    },
    "test_coverage": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "unit": { "type": "integer", "minimum": 0, "maximum": 100 },
        "integration": { "type": "integer", "minimum": 0, "maximum": 100 },
        "e2e": { "type": "string", "enum": ["P0", "P0+P1", "all"] }
      }
    },
    "guards": {
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "required": ["enabled", "actions"],
        "properties": {
          "enabled": { "type": "boolean" },
          "trigger": { "type": "string" },
          "every_n_tasks": { "type": "integer", "minimum": 1 },
          "keywords": { "type": "array", "items": { "type": "string" } },
          "severity_threshold": { "type": "string" },
          "license_allowlist": { "type": "array", "items": { "type": "string" } },
          "budgets": { "type": "object" },
          "actions": { "type": "array", "items": { "type": "string" } }
        }
      }
    }
  }
}
```

- [ ] **Step 5: Extend progress schema for v2 task metadata**

Add optional task properties to `schemas/progress.schema.json`:

```json
"tags": { "type": "array", "items": { "type": "string" } },
"requires_human_review": { "type": "boolean" },
"failure_reason": { "type": "string" },
"defer_reason": { "type": "string" }
```

- [ ] **Step 6: Implement schema:validate command**

Create `cli/src/commands/schema-validate.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Command } from 'commander';
import { validateJsonFile } from '../lib/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function registerSchemaValidateCommand(program: Command): void {
  program.command('schema:validate')
    .requiredOption('--file <path>')
    .option('--schema <path>')
    .action((options: { file: string; schema?: string }) => {
      const filePath = path.resolve(options.file);
      const schemaPath = options.schema ? path.resolve(options.schema) : inferSchema(filePath);
      const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const result = validateJsonFile(schemaPath, value);
      process.stdout.write(JSON.stringify({ ok: result.ok, file: options.file, errors: result.errors }, null, 2) + '\n');
      if (!result.ok) process.exitCode = 1;
    });
}

function inferSchema(filePath: string): string {
  const name = path.basename(filePath);
  const repoRoot = path.resolve(__dirname, '../../..');
  if (name === 'config.json') return path.join(repoRoot, 'schemas/config.schema.json');
  if (name === 'progress.json') return path.join(repoRoot, 'schemas/progress.schema.json');
  if (name === 'scenarios.json') return path.join(repoRoot, 'schemas/scenarios.schema.json');
  throw new Error(`Cannot infer schema for ${filePath}; pass --schema`);
}
```

Register the command in `cli/src/index.ts`.

- [ ] **Step 7: Verify tests pass**

Run:

```powershell
cd cli
npm run build
npm test -- schema.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add schemas/config.schema.json schemas/progress.schema.json cli/src/lib/schema.ts cli/src/commands/schema-validate.ts cli/src/index.ts cli/test/schema.test.ts
git commit -m "feat(cli): enforce v2 config schema"
```

---

### Task 3: Add State Readers And Writers

**Files:**
- Create: `cli/src/state/config.ts`
- Create: `cli/src/state/progress.ts`
- Create: `cli/test/state.test.ts`

- [ ] **Step 1: Write failing state tests**

Create `cli/test/state.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readConfig, writeConfig } from '../src/state/config.js';
import { idleProgress, readProgress, writeProgress } from '../src/state/progress.js';

function tempProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'forge-state-'));
}

describe('state modules', () => {
  it('round-trips v2 config through schema validation', () => {
    const cwd = tempProject();
    const config = {
      version: '2.0' as const,
      forge_cli_version: '0.2.0',
      memory_file: 'AGENTS.md' as const,
      test_mode: 'normal' as const,
      gstack_installed: false,
      project_type: 'existing' as const,
      test_profiles: {
        default: { framework: 'npm', command: 'npm test', working_dir: '.' }
      },
      guards: {
        'batch-review': { enabled: true, every_n_tasks: 6, actions: ['spec-compliance-review'] }
      }
    };

    writeConfig(cwd, config);
    expect(readConfig(cwd)).toEqual(config);
  });

  it('writes idle progress with valid schema', () => {
    const cwd = tempProject();
    writeProgress(cwd, idleProgress());
    expect(readProgress(cwd).status).toBe('idle');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
cd cli
npm test -- state.test.ts
```

Expected: FAIL because state modules do not exist.

- [ ] **Step 3: Implement config state module**

Create `cli/src/state/config.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateJsonFile } from '../lib/schema.js';
import { FORGE_CLI_VERSION } from '../types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type MemoryFile = 'CLAUDE.md' | 'AGENTS.md' | 'GEMINI.md';
export type ProjectType = 'new' | 'existing';

export interface TestProfile {
  framework: string;
  command: string;
  coverage_command?: string;
  working_dir: string;
}

export interface ForgeConfig {
  version: '2.0';
  forge_cli_version: string;
  memory_file: MemoryFile;
  test_mode: 'normal' | 'enhanced';
  gstack_installed: boolean;
  project_type: ProjectType;
  test_profiles: Record<string, TestProfile>;
  test_coverage?: { unit?: number; integration?: number; e2e?: 'P0' | 'P0+P1' | 'all' };
  guards: Record<string, Record<string, unknown>>;
}

export function defaultConfig(input: {
  memoryFile: MemoryFile;
  projectType: ProjectType;
  testProfiles: Record<string, TestProfile>;
  gstackInstalled: boolean;
}): ForgeConfig {
  return {
    version: '2.0',
    forge_cli_version: FORGE_CLI_VERSION,
    memory_file: input.memoryFile,
    test_mode: 'normal',
    gstack_installed: input.gstackInstalled,
    project_type: input.projectType,
    test_profiles: input.testProfiles,
    test_coverage: { unit: 80, integration: 60, e2e: 'P0' },
    guards: {
      'batch-review': { enabled: true, every_n_tasks: 6, actions: ['spec-compliance-review'] },
      'coverage-gate': { enabled: false, trigger: 'phase-complete', actions: ['coverage-check'] },
      'security-scan': {
        enabled: false,
        trigger: 'keyword',
        keywords: ['auth', 'crypto', 'password', 'token', 'permission', 'jwt', 'oauth'],
        severity_threshold: 'HIGH',
        actions: ['security-audit']
      },
      'dependency-audit': {
        enabled: false,
        trigger: 'new-dependency',
        actions: ['dependency-check'],
        license_allowlist: ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC']
      },
      'performance-budget': {
        enabled: false,
        trigger: 'keyword',
        keywords: ['component', 'page', 'ui', 'frontend'],
        budgets: { bundle_size_kb: 500, lcp_ms: 2500 },
        actions: ['bundle-size-check']
      },
      'human-review': { enabled: false, trigger: 'manual', actions: ['pause-for-human'] }
    }
  };
}

export function configPath(cwd: string): string {
  return path.join(cwd, '.forge', 'config.json');
}

export function readConfig(cwd: string): ForgeConfig {
  const file = configPath(cwd);
  const value = JSON.parse(fs.readFileSync(file, 'utf8')) as ForgeConfig;
  assertConfig(cwd, value);
  return value;
}

export function writeConfig(cwd: string, config: ForgeConfig): void {
  assertConfig(cwd, config);
  fs.mkdirSync(path.join(cwd, '.forge'), { recursive: true });
  fs.writeFileSync(configPath(cwd), JSON.stringify(config, null, 2) + '\n');
}

export function assertConfig(cwd: string, value: unknown): void {
  const result = validateJsonFile(path.join(cwd, 'schemas', 'config.schema.json'), value);
  const schemaPath = path.join(cwd, 'schemas', 'config.schema.json');
  const fallback = path.resolve(__dirname, '../../../schemas/config.schema.json');
  const actual = fs.existsSync(schemaPath) ? schemaPath : fallback;
  const checked = validateJsonFile(actual, value);
  if (!checked.ok) throw new Error(`Invalid config.json: ${checked.errors.join('; ')}`);
}
```

- [ ] **Step 4: Fix duplicate validation path bug in config module**

Replace `assertConfig` with this exact version:

```ts
export function assertConfig(cwd: string, value: unknown): void {
  const projectSchema = path.join(cwd, 'schemas', 'config.schema.json');
  const packagedSchema = path.resolve(__dirname, '../../../schemas/config.schema.json');
  const schemaPath = fs.existsSync(projectSchema) ? projectSchema : packagedSchema;
  const checked = validateJsonFile(schemaPath, value);
  if (!checked.ok) throw new Error(`Invalid config.json: ${checked.errors.join('; ')}`);
}
```

- [ ] **Step 5: Implement progress state module**

Create `cli/src/state/progress.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateJsonFile } from '../lib/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type ProgressStatus = 'idle' | 'planning' | 'executing' | 'verification_complete' | 'bugfix';
export type TaskStatus = 'pending' | 'in_progress' | 'done' | 'failed' | 'deferred';
export type VerificationStatus = 'pending' | 'in_progress' | 'passed' | 'failed';

export interface ForgeTask {
  id: number;
  title: string;
  status: TaskStatus;
  commit?: string;
  started_at?: string;
  completed_at?: string;
  tags?: string[];
  requires_human_review?: boolean;
  failure_reason?: string;
  defer_reason?: string;
}

export interface ForgeProgress {
  version: '1.0';
  feature: string | null;
  status: ProgressStatus;
  created_at: string | null;
  updated_at: string;
  spec_path: string | null;
  plan_path: string | null;
  total_tasks: number;
  completed_tasks: number;
  tasks: ForgeTask[];
  guard_history: Array<Record<string, unknown>>;
  verification: {
    status: VerificationStatus;
    test_mode: 'normal' | 'enhanced';
    last_run: string | null;
    report_path?: string | null;
  };
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function idleProgress(): ForgeProgress {
  return {
    version: '1.0',
    feature: null,
    status: 'idle',
    created_at: null,
    updated_at: nowIso(),
    spec_path: null,
    plan_path: null,
    total_tasks: 0,
    completed_tasks: 0,
    tasks: [],
    guard_history: [],
    verification: { status: 'pending', test_mode: 'normal', last_run: null, report_path: null }
  };
}

export function progressPath(cwd: string): string {
  return path.join(cwd, '.forge', 'progress.json');
}

export function readProgress(cwd: string): ForgeProgress {
  const file = progressPath(cwd);
  const value = JSON.parse(fs.readFileSync(file, 'utf8')) as ForgeProgress;
  assertProgress(cwd, value);
  return value;
}

export function writeProgress(cwd: string, progress: ForgeProgress): void {
  assertProgress(cwd, progress);
  fs.mkdirSync(path.join(cwd, '.forge'), { recursive: true });
  fs.writeFileSync(progressPath(cwd), JSON.stringify(progress, null, 2) + '\n');
}

export function assertProgress(cwd: string, value: unknown): void {
  const projectSchema = path.join(cwd, 'schemas', 'progress.schema.json');
  const packagedSchema = path.resolve(__dirname, '../../../schemas/progress.schema.json');
  const schemaPath = fs.existsSync(projectSchema) ? projectSchema : packagedSchema;
  const checked = validateJsonFile(schemaPath, value);
  if (!checked.ok) throw new Error(`Invalid progress.json: ${checked.errors.join('; ')}`);
}
```

- [ ] **Step 6: Verify tests pass**

Run:

```powershell
cd cli
npm run build
npm test -- state.test.ts schema.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add cli/src/state/config.ts cli/src/state/progress.ts cli/test/state.test.ts
git commit -m "feat(cli): add schema-validated state modules"
```

---

### Task 4: Implement Detection, Init, Status, Doctor, And Migration

**Files:**
- Create: `cli/src/lib/detect.ts`
- Create: `cli/src/commands/init.ts`
- Create: `cli/src/commands/status.ts`
- Create: `cli/src/commands/doctor.ts`
- Create: `cli/src/commands/migrate.ts`
- Create: `cli/src/migrations/config-1-to-2.ts`
- Modify: `cli/src/index.ts`
- Create: `cli/test/init-status-migrate.test.ts`

- [ ] **Step 1: Write failing command tests**

Create `cli/test/init-status-migrate.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cli = path.resolve(__dirname, '../dist/index.js');
let cwd: string;

function run(args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
}

beforeEach(() => {
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-init-'));
  fs.cpSync(path.resolve(__dirname, '../../schemas'), path.join(cwd, 'schemas'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ scripts: { test: 'node --test' } }));
});

describe('init/status/migrate commands', () => {
  it('initializes v2 config and idle progress', () => {
    const result = run(['init', '--auto-detect', '--superpowers-available', 'true']);
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.ok).toBe(true);
    expect(output.detected.test_profiles.default.command).toBe('npm test');

    const config = JSON.parse(fs.readFileSync(path.join(cwd, '.forge/config.json'), 'utf8'));
    expect(config.version).toBe('2.0');
    expect(config.test_profiles.default.framework).toBe('npm');
    expect(config.test_command).toBeUndefined();
  });

  it('status reports migration_required for v1 config', () => {
    fs.mkdirSync(path.join(cwd, '.forge'));
    fs.writeFileSync(path.join(cwd, '.forge/config.json'), JSON.stringify({
      version: '1.0',
      memory_file: 'AGENTS.md',
      test_mode: 'normal',
      project_type: 'existing',
      test_command: 'npm test',
      test_framework: 'npm',
      guards: {}
    }));

    const result = run(['status']);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).migration_required).toBe(true);
  });

  it('migrates v1 config to v2 test_profiles.default', () => {
    fs.mkdirSync(path.join(cwd, '.forge'));
    fs.writeFileSync(path.join(cwd, '.forge/config.json'), JSON.stringify({
      version: '1.0',
      memory_file: 'AGENTS.md',
      test_mode: 'normal',
      gstack_installed: false,
      project_type: 'existing',
      test_command: 'npm test',
      test_framework: 'npm',
      guards: { 'batch-review': { enabled: true, every_n_tasks: 6, actions: ['spec-compliance-review'] } }
    }));

    const result = run(['migrate', '--from', '1.0', '--to', '2.0']);
    expect(result.status).toBe(0);
    const config = JSON.parse(fs.readFileSync(path.join(cwd, '.forge/config.json'), 'utf8'));
    expect(config.version).toBe('2.0');
    expect(config.test_profiles.default.command).toBe('npm test');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
cd cli
npm run build
npm test -- init-status-migrate.test.ts
```

Expected: FAIL because commands are not registered.

- [ ] **Step 3: Implement detection helper**

Create `cli/src/lib/detect.ts` with deterministic file checks:

```ts
import fs from 'node:fs';
import path from 'node:path';
import type { MemoryFile, ProjectType, TestProfile } from '../state/config.js';

export function detectProjectType(cwd: string): ProjectType {
  return fs.existsSync(path.join(cwd, '.git')) ? 'existing' : 'new';
}

export function detectMemoryFile(cwd: string): MemoryFile {
  for (const file of ['CLAUDE.md', 'AGENTS.md', 'GEMINI.md'] as MemoryFile[]) {
    if (fs.existsSync(path.join(cwd, file))) return file;
  }
  if (process.env.CLAUDE_PLUGIN_ROOT) return 'CLAUDE.md';
  if (process.env.GEMINI_CLI) return 'GEMINI.md';
  return 'AGENTS.md';
}

export function detectTestProfiles(cwd: string): Record<string, TestProfile> {
  const packageJson = path.join(cwd, 'package.json');
  if (fs.existsSync(packageJson)) {
    const parsed = JSON.parse(fs.readFileSync(packageJson, 'utf8')) as { scripts?: Record<string, string>; devDependencies?: Record<string, string>; dependencies?: Record<string, string> };
    const deps = { ...(parsed.dependencies ?? {}), ...(parsed.devDependencies ?? {}) };
    if (deps.vitest) return { default: { framework: 'vitest', command: 'npx vitest run', coverage_command: 'npx vitest run --coverage', working_dir: '.' } };
    if (deps.jest) return { default: { framework: 'jest', command: 'npx jest', working_dir: '.' } };
    if (parsed.scripts?.test) return { default: { framework: frameworkFromScript(parsed.scripts.test), command: 'npm test', working_dir: '.' } };
  }
  if (fs.existsSync(path.join(cwd, 'go.mod'))) return { default: { framework: 'go', command: 'go test ./...', working_dir: '.' } };
  if (fs.existsSync(path.join(cwd, 'Cargo.toml'))) return { default: { framework: 'cargo', command: 'cargo test', working_dir: '.' } };
  if (fs.existsSync(path.join(cwd, 'pyproject.toml')) || fs.existsSync(path.join(cwd, 'pytest.ini'))) return { default: { framework: 'pytest', command: 'pytest', working_dir: '.' } };
  return { default: { framework: 'unknown', command: 'echo "No test command configured"', working_dir: '.' } };
}

export function detectOptionalTool(name: string): boolean {
  const pathDirs = (process.env.PATH ?? '').split(path.delimiter);
  const names = process.platform === 'win32' ? [name, `${name}.cmd`, `${name}.exe`] : [name];
  return pathDirs.some((dir) => names.some((candidate) => fs.existsSync(path.join(dir, candidate))));
}

function frameworkFromScript(script: string): string {
  for (const name of ['vitest', 'jest', 'mocha', 'ava', 'tap', 'playwright']) {
    if (script.includes(name)) return name;
  }
  return 'npm';
}
```

- [ ] **Step 4: Implement commands and register them**

Implement `init`, `status`, `doctor`, and `migrate` modules with exported `registerX(program: Command)` functions. Register those functions in `cli/src/index.ts`.

`init` must:
- Create `.forge/`, `.forge/specs/`, `.forge/bin/`, `.forge/backups/`.
- Write v2 config with `defaultConfig`.
- Write idle progress if missing.
- Create memory file if missing and append a `## Forge` section.
- Output `ok`, `detected`, `created`, `forge_cli_version`.

`status` must:
- Output `migration_required: true` when `.forge/config.json` exists with `version !== "2.0"`.
- Not silently migrate.
- Output `status: "idle"` when progress is missing.

`migrate` must:
- Require `--from 1.0 --to 2.0` for the first implementation.
- Backup old config to `.forge/backups/config-<timestamp>.json`.
- Convert `test_command/test_framework` to `test_profiles.default`.

`doctor` must:
- Check CLI version, Node major version, config schema if config exists, progress schema if progress exists, git availability, optional GitNexus, optional gstack.
- Output JSON by default.

- [ ] **Step 5: Verify tests pass**

Run:

```powershell
cd cli
npm run build
npm test -- init-status-migrate.test.ts state.test.ts schema.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add cli/src/lib/detect.ts cli/src/commands/init.ts cli/src/commands/status.ts cli/src/commands/doctor.ts cli/src/commands/migrate.ts cli/src/migrations/config-1-to-2.ts cli/src/index.ts cli/test/init-status-migrate.test.ts
git commit -m "feat(cli): add init status doctor and config migration"
```

---

### Task 5: Implement Phase Transition Commands

**Files:**
- Create: `cli/src/commands/feature.ts`
- Create: `cli/src/commands/plan.ts`
- Create: `cli/src/commands/phase.ts`
- Modify: `cli/src/index.ts`
- Create: `cli/test/phase.test.ts`

- [ ] **Step 1: Write failing phase tests**

Create `cli/test/phase.test.ts` covering:
- `phase:advance` rejects planning state without `.forge/scenarios.json`.
- `phase:advance` rejects scenarios with no P0.
- `phase:advance` changes `planning` to `executing` when scenarios and `spec_path` are valid.
- `phase:complete` rejects pending tasks.
- `phase:complete` changes executing to `verification_complete` when tasks are `done` or `deferred`.
- `phase:finish` rejects when verification is not `passed`.
- `feature:start --feature auth --spec docs/spec.md` writes planning progress with `spec_path`.
- `plan:register --plan docs/plan.md` extracts `### Task N: Title` headings and populates pending tasks.

Use JSON fixtures written into temp `.forge/` directories. Assert exact `blocked_by` messages such as `scenarios.json not found`, `no P0 scenario found`, `tasks not finished`, and `verification not passed`.

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
cd cli
npm run build
npm test -- phase.test.ts
```

Expected: FAIL because feature, plan, and phase commands are missing.

- [ ] **Step 3: Implement feature and plan commands**

Create `cli/src/commands/feature.ts`:

```ts
import type { Command } from 'commander';
import { nowIso, writeProgress, type ForgeProgress } from '../state/progress.js';

export function registerFeatureCommands(program: Command): void {
  program.command('feature:start')
    .requiredOption('--feature <slug>')
    .requiredOption('--spec <path>')
    .action((options: { feature: string; spec: string }) => {
      const now = nowIso();
      const progress: ForgeProgress = {
        version: '1.0',
        feature: options.feature,
        status: 'planning',
        created_at: now,
        updated_at: now,
        spec_path: options.spec,
        plan_path: null,
        total_tasks: 0,
        completed_tasks: 0,
        tasks: [],
        guard_history: [],
        verification: { status: 'pending', test_mode: 'normal', last_run: null, report_path: null }
      };
      writeProgress(process.cwd(), progress);
      process.stdout.write(JSON.stringify({ ok: true, feature: options.feature, status: 'planning', spec_path: options.spec }, null, 2) + '\n');
    });
}
```

Create `cli/src/commands/plan.ts`:

```ts
import fs from 'node:fs';
import type { Command } from 'commander';
import { readProgress, writeProgress } from '../state/progress.js';

export function registerPlanCommands(program: Command): void {
  program.command('plan:register')
    .requiredOption('--plan <path>')
    .action((options: { plan: string }) => {
      const text = fs.readFileSync(options.plan, 'utf8');
      const tasks = [...text.matchAll(/^### Task\s+(\d+):\s+(.+)$/gm)].map((match) => ({
        id: Number(match[1]),
        title: match[2].trim(),
        status: 'pending' as const
      }));
      if (tasks.length === 0) {
        process.stdout.write(JSON.stringify({ ok: false, error: 'no task headings found in plan' }, null, 2) + '\n');
        process.exitCode = 1;
        return;
      }
      const progress = readProgress(process.cwd());
      progress.plan_path = options.plan;
      progress.total_tasks = tasks.length;
      progress.completed_tasks = 0;
      progress.tasks = tasks;
      progress.updated_at = new Date().toISOString();
      writeProgress(process.cwd(), progress);
      process.stdout.write(JSON.stringify({ ok: true, plan_path: options.plan, tasks_extracted: tasks.length, tasks }, null, 2) + '\n');
    });
}
```

- [ ] **Step 4: Implement phase commands**

Create `cli/src/commands/phase.ts` with:

```ts
import fs from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import { readProgress, writeProgress } from '../state/progress.js';

export function registerPhaseCommands(program: Command): void {
  program.command('phase:advance').action(() => phaseAdvance(process.cwd()));
  program.command('phase:complete').action(() => phaseComplete(process.cwd()));
  program.command('phase:finish').action(() => phaseFinish(process.cwd()));
}

function print(value: unknown): void {
  process.stdout.write(JSON.stringify(value, null, 2) + '\n');
}

export function phaseAdvance(cwd: string): void {
  const progress = readProgress(cwd);
  if (progress.status !== 'planning') {
    print({ ok: false, from: progress.status, blocked_by: 'not in planning status' });
    process.exitCode = 1;
    return;
  }
  const scenariosPath = path.join(cwd, '.forge', 'scenarios.json');
  if (!fs.existsSync(scenariosPath)) {
    print({ ok: false, from: 'planning', blocked_by: 'scenarios.json not found' });
    process.exitCode = 1;
    return;
  }
  const scenarios = JSON.parse(fs.readFileSync(scenariosPath, 'utf8')) as { scenarios?: Array<{ priority?: string }> };
  const hasP0 = (scenarios.scenarios ?? []).some((scenario) => scenario.priority === 'P0');
  if (!hasP0) {
    print({ ok: false, from: 'planning', blocked_by: 'no P0 scenario found' });
    process.exitCode = 1;
    return;
  }
  if (!progress.spec_path) {
    print({ ok: false, from: 'planning', blocked_by: 'spec_path not set' });
    process.exitCode = 1;
    return;
  }
  progress.status = 'executing';
  progress.updated_at = new Date().toISOString();
  writeProgress(cwd, progress);
  print({ ok: true, from: 'planning', to: 'executing', checks: { scenarios_exist: true, has_p0_scenario: true, spec_path_set: true, scenarios_count: scenarios.scenarios?.length ?? 0 } });
}
```

Also implement `phaseComplete` and `phaseFinish` following the same explicit `blocked_by` style. Register `feature`, `plan`, and `phase` commands in `cli/src/index.ts`.

- [ ] **Step 5: Verify tests pass**

Run:

```powershell
cd cli
npm run build
npm test -- phase.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add cli/src/commands/feature.ts cli/src/commands/plan.ts cli/src/commands/phase.ts cli/src/index.ts cli/test/phase.test.ts
git commit -m "feat(cli): enforce phase transition preconditions"
```

---

### Task 6: Implement Task And Guard Runtime

**Files:**
- Create: `cli/src/lib/guard.ts`
- Create: `cli/src/commands/task.ts`
- Create: `cli/src/commands/guard.ts`
- Modify: `cli/src/index.ts`
- Create: `cli/test/task-guard.test.ts`

- [ ] **Step 1: Write failing task and guard tests**

Create tests for:
- `task:start --id 1` changes a pending task to `in_progress`.
- `task:done --id 1` records completion time, increments `completed_tasks`, and does not trigger guard at task 1 when `every_n_tasks` is 6.
- `task:done --id 6` triggers `batch-review`.
- `task:done` triggers `security-scan` when enabled and title contains `token`.
- `guard:record --type batch-review --status passed --tasks 1,2,3,4,5,6` appends `guard-1`.
- `guard:history` returns all guard entries.

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
cd cli
npm run build
npm test -- task-guard.test.ts
```

Expected: FAIL because commands are missing.

- [ ] **Step 3: Implement guard trigger calculation**

Create `cli/src/lib/guard.ts`:

```ts
import type { ForgeConfig } from '../state/config.js';
import type { ForgeProgress, ForgeTask } from '../state/progress.js';

export interface TriggeredGuard {
  type: string;
  tasks: number[];
  reason: string;
}

const ORDER = ['security-scan', 'dependency-audit', 'batch-review', 'performance-budget', 'human-review'];

export function triggeredGuards(config: ForgeConfig, progress: ForgeProgress, task: ForgeTask): TriggeredGuard[] {
  const guards: TriggeredGuard[] = [];
  for (const type of ORDER) {
    const guard = config.guards[type];
    if (!guard || guard.enabled !== true) continue;
    if (type === 'batch-review') {
      const every = typeof guard.every_n_tasks === 'number' ? guard.every_n_tasks : 6;
      if (progress.completed_tasks > 0 && progress.completed_tasks % every === 0) {
        guards.push({ type, tasks: tasksSinceLastGuard(progress), reason: `completed_tasks is ${progress.completed_tasks}` });
      }
    }
    if (type === 'security-scan' || type === 'performance-budget') {
      const keywords = Array.isArray(guard.keywords) ? guard.keywords.map(String) : [];
      const haystack = `${task.title} ${(task.tags ?? []).join(' ')}`.toLowerCase();
      const match = keywords.find((keyword) => haystack.includes(keyword.toLowerCase()));
      if (match) guards.push({ type, tasks: [task.id], reason: `task contains '${match}'` });
    }
    if (type === 'human-review' && task.requires_human_review) {
      guards.push({ type, tasks: [task.id], reason: 'task requires human review' });
    }
  }
  return guards;
}

function tasksSinceLastGuard(progress: ForgeProgress): number[] {
  const last = [...progress.guard_history].reverse().find((entry) => Array.isArray(entry.task_range));
  const start = Array.isArray(last?.task_range) && typeof last.task_range[1] === 'number' ? last.task_range[1] + 1 : 1;
  return progress.tasks.filter((task) => task.id >= start && task.status === 'done').map((task) => task.id);
}
```

- [ ] **Step 4: Implement task and guard commands**

`task:start` must reject unknown task IDs and non-pending tasks except interrupted `in_progress`.

`task:done` must:
- Require current task status `in_progress` or `pending`.
- Mark `done`.
- Set `completed_at`.
- Recompute `completed_tasks` from `tasks`.
- Write progress before returning.
- Call `triggeredGuards`.
- Return `guard_triggered`, `guards`, and `guard_type` for backward-compatible skill reading.

`task:fail` and `task:defer` must write `failure_reason` or `defer_reason`.

`guard:record` must append:

```json
{
  "id": "guard-<next>",
  "type": "<type>",
  "triggered_at": "<ISO>",
  "task_range": [<min>, <max>],
  "status": "passed",
  "notes": "<notes>"
}
```

- [ ] **Step 5: Verify tests pass**

Run:

```powershell
cd cli
npm run build
npm test -- task-guard.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add cli/src/lib/guard.ts cli/src/commands/task.ts cli/src/commands/guard.ts cli/src/index.ts cli/test/task-guard.test.ts
git commit -m "feat(cli): manage tasks and guard triggers"
```

---

### Task 7: Implement Test Runner And Verification Commands

**Files:**
- Create: `cli/src/lib/runner.ts`
- Create: `cli/src/commands/test.ts`
- Create: `cli/src/commands/verify.ts`
- Modify: `cli/src/index.ts`
- Create: `cli/test/test-verify.test.ts`

- [ ] **Step 1: Write failing runner tests**

Create tests for:
- `forge test --profile default` runs config `test_profiles.default.command`.
- `forge test --all-profiles` runs all configured profiles and fails if any profile fails.
- `forge verify --coverage` runs tests, optionally build command, writes `verification.status = "passed"` on success.
- Failed test command writes `verification.status = "failed"` when run through `verify`.

Use a temp project with `package.json` scripts:

```json
{
  "scripts": {
    "test": "node -e \"process.exit(0)\"",
    "fail": "node -e \"process.exit(2)\"",
    "build": "node -e \"process.exit(0)\""
  }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
cd cli
npm run build
npm test -- test-verify.test.ts
```

Expected: FAIL because runner and commands do not exist.

- [ ] **Step 3: Implement runner helper**

Create `cli/src/lib/runner.ts`:

```ts
import { spawnSync } from 'node:child_process';
import path from 'node:path';

export interface RunResult {
  ok: boolean;
  command: string;
  cwd: string;
  status: number | null;
  stdout: string;
  stderr: string;
  duration_ms: number;
}

export function runShellCommand(root: string, workingDir: string, command: string): RunResult {
  const cwd = path.resolve(root, workingDir);
  const started = Date.now();
  const result = spawnSync(command, {
    cwd,
    shell: true,
    encoding: 'utf8'
  });
  return {
    ok: result.status === 0,
    command,
    cwd,
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    duration_ms: Date.now() - started
  };
}
```

- [ ] **Step 4: Implement test command**

`forge test` must:
- Read v2 config.
- Select profiles by `--profile`, `--all-profiles`, or default profile.
- Use `coverage_command` when `--coverage` is passed and command exists.
- Print JSON with `ok`, `profiles`, `passed`, `failed`, and `duration_ms`.
- Set exit code 1 when any profile fails.
- Never modify source code.

- [ ] **Step 5: Implement verify command**

`forge verify --coverage` must:
- Set `verification.status = "in_progress"` and write progress before running.
- Run `forge test` equivalent internally without spawning `forge`.
- Detect build command from root `package.json.scripts.build`, `go.mod`, or `Cargo.toml`.
- Write `.forge/verification-<timestamp>.json`.
- Set `verification.status = "passed"` only if tests and build pass.
- Set `verification.status = "failed"` otherwise.

- [ ] **Step 6: Verify tests pass**

Run:

```powershell
cd cli
npm run build
npm test -- test-verify.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add cli/src/lib/runner.ts cli/src/commands/test.ts cli/src/commands/verify.ts cli/src/index.ts cli/test/test-verify.test.ts
git commit -m "feat(cli): run tests and verification through runtime"
```

---

### Task 8: Implement Git, Commit, Audit, And Reset Commands

**Files:**
- Create: `cli/src/lib/git.ts`
- Create: `cli/src/commands/commit.ts`
- Create: `cli/src/commands/audit.ts`
- Create: `cli/src/commands/reset.ts`
- Modify: `cli/src/index.ts`
- Create: `cli/test/git-audit-reset.test.ts`

- [ ] **Step 1: Write failing git command tests**

Create tests using a temp git repo:
- `forge commit --message "Add x" --tag "forge task-1"` commits all changes and outputs hash.
- `forge commit:check --task-ids 1,2` reports task 1 consistent and task 2 missing.
- `forge audit` lists task commits and guard history inconsistencies.
- `forge reset --backup` backs up existing progress and writes idle progress.

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
cd cli
npm run build
npm test -- git-audit-reset.test.ts
```

Expected: FAIL because commands are missing.

- [ ] **Step 3: Implement git helper**

Create `cli/src/lib/git.ts` with functions:
- `isGitRepo(cwd): boolean`
- `git(cwd, args): { ok, stdout, stderr, status }`
- `commitAll(cwd, message): { ok, hash, message }`
- `findTaskCommit(cwd, taskId): { hash, message, at } | null`
- `changedDependencyFiles(cwd): string[]`

Use `spawnSync('git', args, { cwd, encoding: 'utf8' })`.

- [ ] **Step 4: Implement commit and audit commands**

`forge commit` must:
- Run `git add -A`.
- Commit message must include `[<tag>]`.
- If there is nothing to commit, return `{ ok: false, error: "nothing to commit" }`.

`forge commit:check` must:
- Parse comma-separated `--task-ids`.
- Search `git log --grep "[forge task-N]"`.

`forge audit` must:
- Read progress if present.
- List phase-like state from progress.
- List task done entries and matching commit status.
- Include `inconsistencies` for done tasks without commits.

`forge reset --backup` must:
- Copy `.forge/progress.json` to `.forge/backups/progress-<timestamp>.json`.
- Write idle progress.

- [ ] **Step 5: Verify tests pass**

Run:

```powershell
cd cli
npm run build
npm test -- git-audit-reset.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add cli/src/lib/git.ts cli/src/commands/commit.ts cli/src/commands/audit.ts cli/src/commands/reset.ts cli/src/index.ts cli/test/git-audit-reset.test.ts
git commit -m "feat(cli): add git audit commit and reset runtime commands"
```

---

### Task 9: Implement Memory Runtime

**Files:**
- Create: `cli/src/state/memory.ts`
- Create: `cli/src/commands/memory.ts`
- Modify: `cli/src/index.ts`
- Create: `cli/test/memory.test.ts`

- [ ] **Step 1: Write failing memory tests**

Create tests for:
- `memory:set-feature` creates or replaces `**Current Feature**` inside `## Forge`.
- `memory:complete-feature` removes current feature, appends completed entry, reads file again, and returns `verified: true`.
- Command fails with `verified: false` if the configured memory file cannot contain the completed marker after two attempts.

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
cd cli
npm run build
npm test -- memory.test.ts
```

Expected: FAIL because memory modules are missing.

- [ ] **Step 3: Implement memory state helper**

Create `cli/src/state/memory.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import type { ForgeConfig } from './config.js';

export function memoryPath(cwd: string, config: ForgeConfig): string {
  return path.join(cwd, config.memory_file);
}

export function ensureForgeSection(content: string): string {
  return content.includes('## Forge') ? content : `${content.trimEnd()}\n\n## Forge\n\n**Current Feature:** none\n`;
}

export function replaceCurrentFeature(content: string, block: string): string {
  const withSection = ensureForgeSection(content);
  const pattern = /\*\*Current Feature\*\*[\s\S]*?(?=\n\*\*Completed Features\*\*|\n## |\s*$)/;
  if (pattern.test(withSection)) return withSection.replace(pattern, block.trimEnd() + '\n');
  return withSection.replace('## Forge', `## Forge\n\n${block.trimEnd()}`);
}

export function appendCompletedFeature(content: string, entry: string): string {
  const withoutCurrent = replaceCurrentFeature(content, '**Current Feature:** none');
  if (withoutCurrent.includes('**Completed Features**')) {
    return withoutCurrent.replace('**Completed Features**', `**Completed Features**\n${entry.trimEnd()}`);
  }
  return `${withoutCurrent.trimEnd()}\n\n**Completed Features**\n${entry.trimEnd()}\n`;
}

export function writeAndVerify(file: string, content: string, marker: string): boolean {
  fs.writeFileSync(file, content);
  return fs.readFileSync(file, 'utf8').includes(marker);
}
```

- [ ] **Step 4: Implement memory commands**

`memory:set-feature` inputs:
- `--feature`
- `--progress`
- `--next-task-id`
- `--next-task-title`

`memory:complete-feature` inputs:
- `--feature`
- `--date`
- `--tasks`
- `--deferred`
- `--spec`
- `--plan`
- `--scenarios`

Both commands must read `.forge/config.json` to find `memory_file`.

- [ ] **Step 5: Verify tests pass**

Run:

```powershell
cd cli
npm run build
npm test -- memory.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add cli/src/state/memory.ts cli/src/commands/memory.ts cli/src/index.ts cli/test/memory.test.ts
git commit -m "feat(cli): manage memory file with read-after-write verification"
```

---

### Task 10: Add Scenario Archive And Phase 2 Stub Interfaces

**Files:**
- Modify: `cli/src/commands/guard.ts`
- Create: `cli/src/commands/gstack.ts`
- Create: `cli/src/commands/scenarios.ts`
- Modify: `cli/src/index.ts`
- Create: `cli/test/phase2-stubs.test.ts`

- [ ] **Step 1: Write failing stub tests**

Create tests for:
- `guard:preview --next-task-id 5 --next-task-title "Add token refresh"` returns security preview when enabled.
- `guard:run --type security-scan --task-id 5` returns `{ ok: false, unsupported: true }` when scanner is not implemented.
- `guard:coverage-check` returns structured unsupported output when coverage parser is not configured.
- `test:gstack --type visual` returns `{ ok: false, unavailable: true }` when `gstack_installed` is false.
- `scenarios:export` and `scenarios:import` return structured unsupported output in first implementation.
- `scenarios:archive` copies `.forge/scenarios.json` to `.forge/specs/<feature>-scenarios.json` and returns the archive path.

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
cd cli
npm run build
npm test -- phase2-stubs.test.ts
```

Expected: FAIL because stub commands are missing.

- [ ] **Step 3: Implement deterministic stubs**

Add commands that output stable JSON and non-zero exit only when the command cannot be used as a passing guard:

```json
{
  "ok": false,
  "unsupported": true,
  "feature": "security-scan",
  "message": "security-scan interface exists; scanner implementation is not part of v2 core runtime"
}
```

`test:gstack` should return:

```json
{
  "ok": false,
  "unavailable": true,
  "type": "visual",
  "message": "gstack is not installed or not enabled in config.json"
}
```

`scenarios:archive` is a real v2 core command because `/done` must not copy scenario files directly. It must:
- Read progress to get `feature`.
- Copy `.forge/scenarios.json` to `.forge/specs/<feature>-scenarios.json`.
- Return `{ ok: true, archived_to: ".forge/specs/<feature>-scenarios.json" }`.

`scenarios:export` and `scenarios:import` return structured unsupported output in first implementation.

- [ ] **Step 4: Verify tests pass**

Run:

```powershell
cd cli
npm run build
npm test -- phase2-stubs.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add cli/src/commands/guard.ts cli/src/commands/gstack.ts cli/src/commands/scenarios.ts cli/src/index.ts cli/test/phase2-stubs.test.ts
git commit -m "feat(cli): expose phase two command interfaces"
```

---

### Task 11: Rewrite Skills To Use CLI Runtime

**Files:**
- Modify: `skills/start/SKILL.md`
- Modify: `skills/next/SKILL.md`
- Modify: `skills/progress-tracking/SKILL.md`
- Modify: `skills/done/SKILL.md`
- Modify: `skills/resume/SKILL.md`
- Modify: `skills/bugfix/SKILL.md`
- Modify: `skills/session-handoff/SKILL.md`
- Modify: `skills/using-forge/SKILL.md`
- Create: `cli/test/skills-contract.test.ts`

- [ ] **Step 1: Write failing skills contract tests**

Create `cli/test/skills-contract.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

const skillFiles = [
  'skills/start/SKILL.md',
  'skills/next/SKILL.md',
  'skills/progress-tracking/SKILL.md',
  'skills/done/SKILL.md',
  'skills/resume/SKILL.md',
  'skills/bugfix/SKILL.md',
  'skills/session-handoff/SKILL.md'
];

describe('v2 skill runtime contract', () => {
  it('teaches skills to resolve FORGE_CMD', () => {
    for (const file of skillFiles) {
      const text = fs.readFileSync(path.join(root, file), 'utf8');
      expect(text, file).toContain('FORGE_CMD=');
    }
  });

  it('removes direct progress/config writes from orchestration skills', () => {
    for (const file of ['skills/next/SKILL.md', 'skills/done/SKILL.md', 'skills/resume/SKILL.md']) {
      const text = fs.readFileSync(path.join(root, file), 'utf8');
      expect(text, file).not.toContain('Overwrite `.forge/progress.json`');
      expect(text, file).not.toContain('Update progress.json');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
cd cli
npm run build
npm test -- skills-contract.test.ts
```

Expected: FAIL because skills still describe direct file writes.

- [ ] **Step 3: Add CLI resolution block to every skill**

Use this exact block near the top of each modified skill:

```markdown
## Forge CLI

Before calling any Forge Runtime command, resolve the executable:

```bash
FORGE_CMD=$(command -v forge 2>/dev/null || echo ".forge/bin/forge")
```

All Runtime commands output JSON by default. Read the JSON, report blocking
errors exactly, and do not edit `.forge/*.json` directly.
```
```

- [ ] **Step 4: Rewrite start skill**

`start/SKILL.md` must:
- Use `forge status` to detect active state.
- Use `forge init --auto-detect --superpowers-available true|false` when config is absent or user asks to re-init.
- Keep Superpowers brainstorming in skill.
- Keep scenarios generation in `skills/scenarios/SKILL.md` for now, but after writing scenarios call `forge schema:validate --file .forge/scenarios.json`.
- Use `feature:start` for progress setup; do not tell the skill to write progress JSON directly.

```bash
$FORGE_CMD feature:start --feature <slug> --spec <path>
```

It writes planning progress with `spec_path`.

- [ ] **Step 5: Rewrite next and progress-tracking skills**

`next/SKILL.md` must:
- Call `forge status`.
- In planning, call `forge phase:advance` before writing-plans.
- After plan creation, call `forge plan:register --plan <path>` to parse task headings and populate progress.
- For each task: `task:start`, Superpowers subagent, `forge test --coverage`, up to 3 AI fix loops, `forge commit`, `task:done`, guard action, `guard:record`.
- Use `forge verify --coverage` for full verification.

`progress-tracking/SKILL.md` becomes a compatibility helper that delegates to the same CLI commands and says it must not write `.forge/*.json` directly.

- [ ] **Step 6: Rewrite done, resume, bugfix, session-handoff, using-forge**

`done` uses:
- `forge status`
- `forge phase:finish`
- `forge scenarios:archive`
- `forge memory:complete-feature`
- `forge reset --backup`

`resume` uses:
- `forge status`
- `forge audit`
- `forge commit:check`

`bugfix` uses:
- TDD skill for regression workflow
- `forge task:*`, `forge test`, `forge commit`, `forge memory:complete-feature`, `forge reset`

`session-handoff` uses:
- `forge memory:set-feature`

`using-forge` states:
- Runtime owns reality-changing operations.
- Direct edits to `.forge/*.json` are invalid during active Forge work.
- v2 config is not backward-compatible; run `forge migrate`.

- [ ] **Step 7: Verify skills contract tests pass**

Run:

```powershell
cd cli
npm run build
npm test -- skills-contract.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add skills/start/SKILL.md skills/next/SKILL.md skills/progress-tracking/SKILL.md skills/done/SKILL.md skills/resume/SKILL.md skills/bugfix/SKILL.md skills/session-handoff/SKILL.md skills/using-forge/SKILL.md cli/test/skills-contract.test.ts
git commit -m "feat(skills): delegate reality changes to forge cli"
```

---

### Task 12: Wire Installation And Documentation

**Files:**
- Create: `cli/install.sh`
- Modify: `.claude-plugin/plugin.json`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `.opencode/INSTALL.md`
- Modify: `scripts/install-opencode.sh`
- Modify: `scripts/install-opencode.cmd`
- Create: `cli/test/metadata.test.ts`

- [ ] **Step 1: Write failing metadata tests**

Create `cli/test/metadata.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

describe('plugin metadata', () => {
  it('publishes v0.2.0 metadata', () => {
    expect(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version).toBe('0.2.0');
    expect(JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin/plugin.json'), 'utf8')).version).toBe('0.2.0');
  });

  it('declares CLI install script for Claude plugin', () => {
    const plugin = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin/plugin.json'), 'utf8'));
    expect(plugin.install.script).toBe('cli/install.sh');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
cd cli
npm run build
npm test -- metadata.test.ts
```

Expected: FAIL because metadata is still `0.1.0` and install script is absent.

- [ ] **Step 3: Add CLI install script**

Create `cli/install.sh`:

```sh
#!/bin/sh
set -eu

PLUGIN_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CLI_DIR="$PLUGIN_DIR/cli"
PROJECT_DIR="$(pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js 20+ required"
  exit 1
fi

cd "$CLI_DIR"
npm install --production=false
npm run build

FORGE_BIN="$PROJECT_DIR/.forge/bin/forge"
mkdir -p "$PROJECT_DIR/.forge/bin"
cat > "$FORGE_BIN" << EOF
#!/bin/sh
node "$CLI_DIR/dist/index.js" "\$@"
EOF
chmod +x "$FORGE_BIN"

echo "forge CLI installed: $FORGE_BIN"
node "$CLI_DIR/dist/index.js" --version-json
```

- [ ] **Step 4: Update plugin metadata**

Root `package.json`:

```json
{
  "name": "forge",
  "version": "0.2.0",
  "type": "module",
  "main": ".opencode/plugins/forge.js"
}
```

`.claude-plugin/plugin.json`:
- Set `"version": "0.2.0"`.
- Add:

```json
"install": {
  "script": "cli/install.sh",
  "description": "Install forge CLI runtime"
}
```

- [ ] **Step 5: Update OpenCode installers**

`scripts/install-opencode.sh` must after clone/update:

```sh
echo "Building forge CLI"
(cd "${FORGE_DIR}/cli" && npm install --production=false && npm run build)
```

`scripts/install-opencode.cmd` must after clone/update:

```cmd
echo Building forge CLI
pushd "%FORGE_DIR%\cli" >nul
call npm install --production=false
if errorlevel 1 exit /b 1
call npm run build
if errorlevel 1 exit /b 1
popd >nul
```

Do not create `.forge/bin/forge` in OpenCode install scripts because they install into the OpenCode plugin directory, not the user's project. Skills resolve global `forge` first and project `.forge/bin/forge` second.

- [ ] **Step 6: Update README and OpenCode install docs**

Document:
- Forge v2 has a CLI Runtime.
- `config.json` v1 is not accepted by v2.
- Run `forge migrate --from 1.0 --to 2.0` for old projects.
- `forge doctor` verifies install.
- Skills must not directly edit `.forge/*.json`.

- [ ] **Step 7: Verify metadata tests pass**

Run:

```powershell
cd cli
npm run build
npm test -- metadata.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add cli/install.sh .claude-plugin/plugin.json package.json README.md .opencode/INSTALL.md scripts/install-opencode.sh scripts/install-opencode.cmd cli/test/metadata.test.ts
git commit -m "feat: wire forge cli runtime into plugin installation"
```

---

### Task 13: Full Verification And Release Readiness

**Files:**
- Modify only files required by test failures discovered in this task.

- [ ] **Step 1: Run full CLI verification**

Run:

```powershell
cd cli
npm run check
```

Expected: TypeScript build passes and all Vitest tests pass.

- [ ] **Step 2: Run root metadata smoke checks**

Run:

```powershell
git status --short
node .\cli\dist\index.js --version-json
node .\cli\dist\index.js doctor
```

Expected:
- Git status contains only intentional uncommitted files if a previous step failed before commit.
- Version JSON reports `0.2.0`.
- Doctor returns JSON and does not crash outside a Forge project.

- [ ] **Step 3: Manual temp-project smoke test**

Run in a temp directory:

```powershell
$tmp = Join-Path $env:TEMP "forge-v2-smoke"
Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
New-Item -ItemType Directory $tmp | Out-Null
Copy-Item -Recurse E:\space\open\project\forge\schemas $tmp\schemas
Set-Content -LiteralPath "$tmp\package.json" -Value '{"scripts":{"test":"node -e \"process.exit(0)\"","build":"node -e \"process.exit(0)\""}}'
Push-Location $tmp
node E:\space\open\project\forge\cli\dist\index.js init --auto-detect --superpowers-available true
node E:\space\open\project\forge\cli\dist\index.js status
node E:\space\open\project\forge\cli\dist\index.js test
node E:\space\open\project\forge\cli\dist\index.js doctor
Pop-Location
```

Expected: all commands output valid JSON and exit 0 except optional warnings.

- [ ] **Step 4: Run skill text contract check**

Run:

```powershell
cd cli
npm test -- skills-contract.test.ts metadata.test.ts
```

Expected: PASS.

- [ ] **Step 5: Inspect uncommitted changes**

Run:

```powershell
git status --short
git diff --stat
```

Expected: no uncommitted changes. If changes exist, inspect and either commit intentional fixes or report them.

- [ ] **Step 6: Final commit if verification fixes were needed**

Only if Task 13 changed files:

```powershell
git add <changed-files>
git commit -m "test: verify forge v2 cli runtime"
```

---

## Self-Review

**Spec coverage:**
- CLI Runtime package and command boundary: Tasks 1, 4-10.
- v2 incompatible config schema with `test_profiles`: Tasks 2, 4.
- State as Contract through schema-validated readers/writers: Tasks 2, 3.
- Phase transition precondition enforcement: Task 5.
- Task progress and Guard trigger calculation: Task 6.
- Runtime-owned tests and verification: Task 7.
- Runtime-owned git and audit trail: Task 8.
- Runtime-owned memory write and read-after-write verification: Task 9.
- Phase 2 stable interfaces with scoped non-implementation: Task 10.
- Skill thin-wrapper rewrite: Task 11.
- Plugin/install/docs wiring: Task 12.
- Verification evidence: Task 13.

**Placeholder scan:** No placeholder markers or incomplete implementation notes. Deferred Phase 2 internals have explicit structured unsupported outputs and are not part of first-round acceptance.

**Type consistency:** Config version is `2.0`; progress version remains `1.0`; `test_profiles.default` replaces `test_command/test_framework`; task statuses and verification statuses match existing schemas.

**Runtime boundary note:** Feature startup, plan registration, and scenario archival are explicit Runtime commands in Tasks 5 and 10. Do not let skills directly edit `.forge/*.json` as a shortcut.
