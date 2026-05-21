# Forge Phase 1c: Remaining MVP Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the remaining MVP skills (`/resume`, `/done`, `/bugfix`, `session-handoff`) and supporting CLI commands to complete the Phase 1 core workflow.

**Architecture:** Skill-driven. Markdown skill files at `~/.agents/skills/forge/`. CLI provides infrastructure. Skills orchestrate by reading/writing `.forge/progress.json`.

**Tech Stack:** Markdown skill files, JSON state files, existing forge CLI utilities

**Dependencies:** Phase 1a (CLI skeleton) and Phase 1b (core loop: `/start`, `/next`, slug, batch) must be complete.

---

## File Structure

```
~/.agents/skills/forge/          ← User-level skill install (4 new files)
  ├── resume.md                  ← /resume skill
  ├── done.md                    ← /done skill
  ├── bugfix.md                  ← /bugfix skill
  └── session-handoff.md         ← Internal: cross-session context transfer

forge/
  src/
    commands/
      resume.ts                  ← CLI helper for /resume (state reconstruction)
      done.ts                    ← CLI helper for /done (archive + cleanup)
      bugfix.ts                  ← CLI helper for /bugfix (bug tracking ID)
    utils/
      archive.ts                 ← Archive directory management
  tests/
    unit/
      commands/
        resume.test.ts
        done.test.ts
        bugfix.test.ts
      utils/
        archive.test.ts
```

---

### Task 1: `/resume` Skill File + CLI Command

**Files:**
- Create: `~/.agents/skills/forge/resume.md`
- Create: `forge/src/commands/resume.ts`
- Create: `forge/tests/unit/commands/resume.test.ts`

- [ ] **Step 1: Write failing test for resume CLI command**

```typescript
// tests/unit/commands/resume.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readProgress, reconstructState } from '../../../src/commands/resume';
import * as fs from 'fs';
import * as path from 'path';

describe('Resume Command', () => {
  const testDir = path.join(__dirname, '../../tmp-resume-test');

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
    fs.mkdirSync(path.join(testDir, '.forge'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('readProgress', () => {
    it('should read valid progress.json', () => {
      const progress = {
        version: '1.0',
        feature: 'user-login',
        status: 'executing',
        phase: 'batch_execution',
        created_at: '2026-05-20T08:00:00Z',
        updated_at: '2026-05-21T10:30:00Z',
        total_batches: 3,
        current_batch: 2,
        batches: [
          { batch: 1, status: 'done', tasks: [{ id: 1, title: 'Task 1', status: 'done', commit: 'abc123', completed_at: '2026-05-20T09:00:00Z' }] },
          { batch: 2, status: 'in_progress', tasks: [{ id: 7, title: 'Task 7', status: 'done', commit: 'def456', completed_at: '2026-05-21T09:45:00Z' }, { id: 8, title: 'Task 8', status: 'in_progress' }] },
        ],
        verification: { status: 'pending', test_mode: 'normal', last_run: null, report_path: null },
      };
      fs.writeFileSync(path.join(testDir, '.forge', 'progress.json'), JSON.stringify(progress));
      const result = readProgress(testDir);
      expect(result.feature).toBe('user-login');
      expect(result.status).toBe('executing');
      expect(result.current_batch).toBe(2);
    });

    it('should throw when progress.json does not exist', () => {
      expect(() => readProgress(testDir)).toThrow('No progress.json found');
    });

    it('should throw when progress.json is invalid JSON', () => {
      fs.writeFileSync(path.join(testDir, '.forge', 'progress.json'), '{ invalid json }');
      expect(() => readProgress(testDir)).toThrow('Invalid progress.json');
    });
  });

  describe('reconstructState', () => {
    it('should generate accurate resume summary', () => {
      const progress = {
        version: '1.0',
        feature: 'user-login',
        status: 'executing',
        phase: 'batch_execution',
        created_at: '2026-05-20T08:00:00Z',
        updated_at: '2026-05-21T10:30:00Z',
        total_batches: 3,
        current_batch: 2,
        batches: [
          { batch: 1, status: 'done', tasks: [{ id: 1, title: 'Task 1', status: 'done' }, { id: 2, title: 'Task 2', status: 'done' }] },
          { batch: 2, status: 'in_progress', tasks: [{ id: 7, title: 'Task 7', status: 'done' }, { id: 8, title: 'Task 8', status: 'in_progress' }] },
          { batch: 3, status: 'pending', tasks: [{ id: 13, title: 'Task 13', status: 'pending' }] },
        ],
        verification: { status: 'pending', test_mode: 'normal', last_run: null, report_path: null },
      };
      const summary = reconstructState(progress);
      expect(summary).toContain('user-login');
      expect(summary).toContain('batch 1');
      expect(summary).toContain('batch 2, task 8');
    });

    it('should detect state inconsistency (task marked done but no commit)', () => {
      const progress = {
        version: '1.0',
        feature: 'test-feature',
        status: 'executing',
        phase: 'batch_execution',
        created_at: '2026-05-20T08:00:00Z',
        updated_at: '2026-05-21T10:30:00Z',
        total_batches: 1,
        current_batch: 1,
        batches: [
          { batch: 1, status: 'in_progress', tasks: [{ id: 1, title: 'Task 1', status: 'done' }] },
        ],
        verification: { status: 'pending', test_mode: 'normal', last_run: null, report_path: null },
      };
      const summary = reconstructState(progress);
      expect(summary).toContain('WARNING');
      expect(summary).toContain('Task 1');
    });

    it('should handle idle state gracefully', () => {
      const progress = {
        version: '1.0',
        feature: '',
        status: 'idle',
        phase: 'brainstorming',
        created_at: '2026-05-20T08:00:00Z',
        updated_at: '2026-05-20T08:00:00Z',
        total_batches: 0,
        current_batch: 0,
        batches: [],
        verification: { status: 'pending', test_mode: 'normal', last_run: null, report_path: null },
      };
      const summary = reconstructState(progress);
      expect(summary).toContain('No active feature');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd forge && npx vitest run tests/unit/commands/resume.test.ts -v`
Expected: FAIL — module not found

- [ ] **Step 3: Write resume CLI command**

```typescript
// src/commands/resume.ts
import * as fs from 'fs';
import * as path from 'path';
import type { ProgressState } from '../types';

export function readProgress(projectRoot: string): ProgressState {
  const progressPath = path.join(projectRoot, '.forge', 'progress.json');
  if (!fs.existsSync(progressPath)) {
    throw new Error('No progress.json found. Run `forge init` first.');
  }
  try {
    const raw = fs.readFileSync(progressPath, 'utf-8');
    return JSON.parse(raw) as ProgressState;
  } catch (e) {
    if (e instanceof SyntaxError) {
      throw new Error('Invalid progress.json. File is corrupted.');
    }
    throw e;
  }
}

export function reconstructState(progress: ProgressState): string {
  if (progress.status === 'idle' || !progress.feature) {
    return 'No active feature. Run `/start` to begin.';
  }

  const lines: string[] = [];
  lines.push(`## Resume: ${progress.feature}`);
  lines.push('');

  // Count completed tasks
  let doneCount = 0;
  let totalTasks = 0;
  let currentTaskTitle = '';

  for (const batch of progress.batches || []) {
    for (const task of batch.tasks || []) {
      totalTasks++;
      if (task.status === 'done') {
        doneCount++;
      }
      if (task.status === 'in_progress') {
        currentTaskTitle = task.title;
      }
    }
  }

  // Completed batches
  const doneBatches = (progress.batches || []).filter(b => b.status === 'done');
  if (doneBatches.length > 0) {
    const batchNums = doneBatches.map(b => b.batch).join(', ');
    lines.push(`✅ Completed: batch ${batchNums} (${doneCount} tasks done)`);
  }

  // Current batch
  const currentBatch = (progress.batches || []).find(b => b.status === 'in_progress');
  if (currentBatch) {
    const currentTask = currentBatch.tasks?.find(t => t.status === 'in_progress');
    if (currentTask) {
      lines.push(`🔄 In progress: batch ${currentBatch.batch}, task ${currentTask.id} — ${currentTask.title}`);
    } else {
      lines.push(`⏳ Ready: batch ${currentBatch.batch} (all tasks pending)`);
    }
  }

  // Remaining batches
  const pendingBatches = (progress.batches || []).filter(b => b.status === 'pending');
  if (pendingBatches.length > 0) {
    const batchNums = pendingBatches.map(b => b.batch).join(', ');
    lines.push(`⏸ Pending: batch ${batchNums}`);
  }

  lines.push('');
  lines.push(`Progress: ${doneCount}/${totalTasks} tasks complete`);
  lines.push('');

  // State inconsistency warnings
  const warnings: string[] = [];
  for (const batch of progress.batches || []) {
    for (const task of batch.tasks || []) {
      if (task.status === 'done' && !task.commit) {
        warnings.push(`WARNING: ${task.title} (task ${task.id}) marked as done but has no commit SHA. May need re-execution.`);
      }
    }
  }
  if (warnings.length > 0) {
    lines.push('⚠️ State Inconsistencies:');
    warnings.forEach(w => lines.push(`  - ${w}`));
    lines.push('');
  }

  // Next action
  lines.push('**Next action:**');
  if (currentBatch && currentTaskTitle) {
    lines.push(`Run \`/next\` to continue with: ${currentTaskTitle}`);
  } else if (currentBatch) {
    lines.push(`Run \`/next\` to start batch ${currentBatch.batch}`);
  } else if (pendingBatches.length > 0) {
    lines.push(`Run \`/next\` to start batch ${pendingBatches[0].batch}`);
  } else {
    lines.push('All batches complete. Run `/done` to finish this feature.');
  }

  return lines.join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd forge && npx vitest run tests/unit/commands/resume.test.ts -v`
Expected: PASS (6 tests)

- [ ] **Step 5: Create resume.md skill file**

Create at `~/.agents/skills/forge/resume.md`:

```markdown
# Forge Skill: /resume

## Trigger

User runs: `/resume`

## Pre-flight Checks

1. Read `.forge/progress.json`
2. If file does not exist:
   - Output: "❌ Forge is not initialized. Run: `forge init`"
   - Stop.
3. If `status` is `idle`:
   - Output: "❌ No active feature to resume. Run `/start` to begin."
   - Stop.

## Behavior

### 1. State Reconstruction

1. Read `progress.json` to determine exact state
2. Run `forge resume` CLI command to generate structured summary
3. Read `CLAUDE.md` for any additional context about key decisions

### 2. Output Resume Summary

Display to user:
```
## Resume: <feature-slug>

✅ Completed: batch 1-2 (12 tasks done)
🔄 In progress: batch 3, task 13 — Implement JWT generation
⏸ Pending: batch 4

Progress: 12/16 tasks complete

**Next action:**
Run `/next` to continue with: Implement JWT generation
```

### 3. State Inconsistency Detection

Check for inconsistencies:
- Task marked `done` but no `commit` SHA → warn user
- Task marked `in_progress` but `completed_at` exists → warn user
- `progress.json` last updated > 24 hours ago → warn about staleness

If inconsistencies found:
```
⚠️ State Inconsistencies Detected:
- Task 5 marked done but no commit found. Re-execute? (y/n)
```

### 4. User Confirmation

Ask: "Resume from this point? (yes/no/view details)"

- **yes** → Update `progress.json` `updated_at`, proceed to `/next` behavior
- **no** → Stop, let user decide next action
- **view details** → Show full batch/task breakdown, then re-ask

### 5. Continue Execution

If user confirms:
1. If current task is `in_progress` → continue that task
2. If current batch is `done` but more batches → start next batch
3. If all batches `done` → trigger verification (same as `/next` State D)

## Error Handling

- **No progress.json**: "❌ Forge is not initialized. Run: `forge init`"
- **Idle state**: "❌ No active feature. Run `/start` to begin."
- **Corrupted progress.json**: "❌ progress.json is corrupted. Attempting recovery from git log..."
  - Try to reconstruct from `[forge task-N]` commits
  - If recovery fails: "❌ Recovery failed. Please provide the last known state."
- **Git log recovery partial**: "⚠️ Recovered from git log. State may be incomplete. Review before continuing."

## Notes

- `/resume` is passive: it locates, reports, and asks before acting
- `/next` is active: it reads state and proceeds directly
- Always detect inconsistencies before resuming
- Never silently skip a failed task
```

- [ ] **Step 6: Add resume command to CLI index**

Update `forge/src/index.ts` to register the `resume` subcommand.

- [ ] **Step 7: Commit**

```bash
cd forge
git add src/commands/resume.ts tests/unit/commands/resume.test.ts
git commit -m "feat: add /resume skill and CLI command with state reconstruction"
```

---

### Task 2: `/done` Skill File + CLI Command

**Files:**
- Create: `~/.agents/skills/forge/done.md`
- Create: `forge/src/commands/done.ts`
- Create: `forge/tests/unit/commands/done.test.ts`

- [ ] **Step 1: Write failing test for done CLI command**

```typescript
// tests/unit/commands/done.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateDone, archiveFeature } from '../../../src/commands/done';
import * as fs from 'fs';
import * as path from 'path';

describe('Done Command', () => {
  const testDir = path.join(__dirname, '../../tmp-done-test');

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
    fs.mkdirSync(path.join(testDir, '.forge'), { recursive: true });
    fs.mkdirSync(path.join(testDir, 'docs', 'forge', 'changes', 'test-feature'), { recursive: true });
    fs.mkdirSync(path.join(testDir, 'docs', 'forge', 'specs'), { recursive: true });
    fs.mkdirSync(path.join(testDir, 'docs', 'forge', 'changes', 'archive'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('validateDone', () => {
    it('should pass when all batches and tasks are done', () => {
      const progress = {
        version: '1.0',
        feature: 'test-feature',
        status: 'executing',
        phase: 'batch_execution',
        created_at: '2026-05-20T08:00:00Z',
        updated_at: '2026-05-21T10:30:00Z',
        total_batches: 2,
        current_batch: 2,
        batches: [
          { batch: 1, status: 'done', tasks: [{ id: 1, title: 'Task 1', status: 'done', commit: 'abc' }] },
          { batch: 2, status: 'done', tasks: [{ id: 7, title: 'Task 7', status: 'done', commit: 'def' }] },
        ],
        verification: { status: 'passed', test_mode: 'normal', last_run: '2026-05-21T10:00:00Z', report_path: 'docs/forge/changes/test-feature/test-report.html' },
      };
      const result = validateDone(progress);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail when tasks are incomplete', () => {
      const progress = {
        version: '1.0',
        feature: 'test-feature',
        status: 'executing',
        phase: 'batch_execution',
        created_at: '2026-05-20T08:00:00Z',
        updated_at: '2026-05-21T10:30:00Z',
        total_batches: 2,
        current_batch: 2,
        batches: [
          { batch: 1, status: 'done', tasks: [{ id: 1, title: 'Task 1', status: 'done', commit: 'abc' }] },
          { batch: 2, status: 'in_progress', tasks: [{ id: 7, title: 'Task 7', status: 'done', commit: 'def' }, { id: 8, title: 'Task 8', status: 'pending' }] },
        ],
        verification: { status: 'pending', test_mode: 'normal', last_run: null, report_path: null },
      };
      const result = validateDone(progress);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Task 8 (Task 8) is not done');
    });

    it('should fail when verification has not passed', () => {
      const progress = {
        version: '1.0',
        feature: 'test-feature',
        status: 'executing',
        phase: 'batch_execution',
        created_at: '2026-05-20T08:00:00Z',
        updated_at: '2026-05-21T10:30:00Z',
        total_batches: 1,
        current_batch: 1,
        batches: [
          { batch: 1, status: 'done', tasks: [{ id: 1, title: 'Task 1', status: 'done', commit: 'abc' }] },
        ],
        verification: { status: 'pending', test_mode: 'normal', last_run: null, report_path: null },
      };
      const result = validateDone(progress);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Verification has not passed');
    });

    it('should allow deferred tasks', () => {
      const progress = {
        version: '1.0',
        feature: 'test-feature',
        status: 'executing',
        phase: 'batch_execution',
        created_at: '2026-05-20T08:00:00Z',
        updated_at: '2026-05-21T10:30:00Z',
        total_batches: 1,
        current_batch: 1,
        batches: [
          { batch: 1, status: 'done', tasks: [{ id: 1, title: 'Task 1', status: 'done', commit: 'abc' }, { id: 2, title: 'Task 2', status: 'deferred' }] },
        ],
        verification: { status: 'passed', test_mode: 'normal', last_run: '2026-05-21T10:00:00Z', report_path: 'docs/forge/changes/test-feature/test-report.html' },
      };
      const result = validateDone(progress);
      expect(result.valid).toBe(true);
      expect(result.deferred).toEqual([{ id: 2, title: 'Task 2' }]);
    });
  });

  describe('archiveFeature', () => {
    it('should move change directory to archive', () => {
      // Create a file in the change directory
      fs.writeFileSync(path.join(testDir, 'docs', 'forge', 'changes', 'test-feature', 'proposal.md'), '# Test');

      archiveFeature(testDir, 'test-feature', '2026-05-21');

      const archivedPath = path.join(testDir, 'docs', 'forge', 'changes', 'archive', '2026-05-21-test-feature');
      expect(fs.existsSync(archivedPath)).toBe(true);
      expect(fs.existsSync(path.join(archivedPath, 'proposal.md'))).toBe(true);
      expect(fs.existsSync(path.join(testDir, 'docs', 'forge', 'changes', 'test-feature'))).toBe(false);
    });

    it('should copy scenarios to specs directory', () => {
      fs.writeFileSync(path.join(testDir, 'docs', 'forge', 'changes', 'test-feature', 'scenarios.md'), '# Scenarios');

      archiveFeature(testDir, 'test-feature', '2026-05-21');

      expect(fs.existsSync(path.join(testDir, 'docs', 'forge', 'specs', 'test-feature-scenarios.md'))).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd forge && npx vitest run tests/unit/commands/done.test.ts -v`
Expected: FAIL — module not found

- [ ] **Step 3: Write done CLI command**

```typescript
// src/commands/done.ts
import * as fs from 'fs';
import * as path from 'path';
import type { ProgressState, Batch, Task } from '../types';

export interface DoneValidationResult {
  valid: boolean;
  errors: string[];
  deferred: { id: number; title: string }[];
}

export function validateDone(progress: ProgressState): DoneValidationResult {
  const errors: string[] = [];
  const deferred: { id: number; title: string }[] = [];

  // Check verification status
  if (progress.verification?.status !== 'passed') {
    errors.push('Verification has not passed. Run full test suite before marking done.');
  }

  // Check all tasks
  for (const batch of progress.batches || []) {
    for (const task of batch.tasks || []) {
      if (task.status === 'done') continue;
      if (task.status === 'deferred') {
        deferred.push({ id: task.id, title: task.title });
        continue;
      }
      errors.push(`Task ${task.id} (${task.title}) is not done (status: ${task.status})`);
    }
  }

  return { valid: errors.length === 0, errors, deferred };
}

export function archiveFeature(projectRoot: string, featureSlug: string, date: string): void {
  const changesDir = path.join(projectRoot, 'docs', 'forge', 'changes');
  const featureDir = path.join(changesDir, featureSlug);
  const archiveDir = path.join(changesDir, 'archive', `${date}-${featureSlug}`);
  const specsDir = path.join(projectRoot, 'docs', 'forge', 'specs');

  // Ensure target directories exist
  fs.mkdirSync(archiveDir, { recursive: true });
  fs.mkdirSync(specsDir, { recursive: true });

  // Copy scenarios to specs
  const scenariosPath = path.join(featureDir, 'scenarios.md');
  if (fs.existsSync(scenariosPath)) {
    const destPath = path.join(specsDir, `${featureSlug}-scenarios.md`);
    fs.copyFileSync(scenariosPath, destPath);
  }

  // Move feature directory to archive
  fs.renameSync(featureDir, archiveDir);
}

export function resetProgress(projectRoot: string): void {
  const progressPath = path.join(projectRoot, '.forge', 'progress.json');
  const progress = JSON.parse(fs.readFileSync(progressPath, 'utf-8')) as ProgressState;

  progress.feature = '';
  progress.status = 'idle';
  progress.phase = 'brainstorming';
  progress.total_batches = 0;
  progress.current_batch = 0;
  progress.batches = [];
  progress.verification = { status: 'pending', test_mode: progress.verification?.test_mode || 'normal', last_run: null, report_path: null };
  progress.updated_at = new Date().toISOString();

  fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd forge && npx vitest run tests/unit/commands/done.test.ts -v`
Expected: PASS (6 tests)

- [ ] **Step 5: Create done.md skill file**

Create at `~/.agents/skills/forge/done.md`:

```markdown
# Forge Skill: /done

## Trigger

User runs: `/done`

## Pre-flight Checks

1. Read `.forge/progress.json`
2. If file does not exist:
   - Output: "❌ Forge is not initialized. Run: `forge init`"
   - Stop.
3. If `status` is `idle`:
   - Output: "❌ No active feature. Run `/start` to begin."
   - Stop.

## Phase 1: Validation

### 1.1 Run Done Validation

1. Run `forge done validate` CLI command
2. Check result:
   - `valid: true` → proceed to Phase 2
   - `valid: false` → output errors, stop

### 1.2 Output Validation Errors

If validation fails:
```
❌ Cannot complete feature yet:

<list each error>

- Task 7 (Implement JWT) is not done (status: in_progress)
- Verification has not passed

Fix the above, then run `/done` again.
```

If validation passes with deferred tasks:
```
✅ Validation passed with deferred tasks:
- Task 12 (Optional: Dark mode) — deferred

Proceed with archival? (yes/no)
```

## Phase 2: Archival

### 2.1 Merge Scenarios to Project Spec

1. Copy `docs/forge/changes/<feature>/scenarios.md` → `docs/forge/specs/<feature>-scenarios.md`
2. These become permanent project knowledge

### 2.2 Update CLAUDE.md

Append to `CLAUDE.md`:
```markdown
## Completed Features
- <feature-slug> (<date>)
  - Tasks: <total> completed, <deferred> deferred
  - Test coverage: <from verification report>
  - Key decisions: <extract from proposal.md and review files>
  - Deferred tasks: <list if any>
```

Extract key decisions from:
- `proposal.md` — architectural choices
- `review-batch-*.md` — significant trade-offs
- `scenarios.json` — scope decisions

### 2.3 Archive Change Directory

1. Run `forge done archive <feature-slug> <date>` CLI command
2. Moves `docs/forge/changes/<feature>/` → `docs/forge/changes/archive/<date>-<feature>/`
3. Preserves all artifacts: proposal, scenarios, plans, reviews, reports

### 2.4 Reset Progress

1. Run `forge done reset` CLI command
2. Clears feature state in `progress.json`:
   ```json
   {
     "feature": "",
     "status": "idle",
     "phase": "brainstorming",
     "total_batches": 0,
     "current_batch": 0,
     "batches": []
   }
   ```

### 2.5 Git Commit

```bash
git add docs/forge/specs/ docs/forge/changes/archive/ CLAUDE.md .forge/progress.json
git commit -m "chore: archive feature <feature-slug> [forge done]"
```

## Phase 3: Output Summary

```
## Feature Complete: <feature-slug>

📊 Summary:
- Total tasks: <N>
- Completed: <N>
- Deferred: <N> (<list if any>)
- Test coverage: <X>%

📁 Archived to: docs/forge/changes/archive/<date>-<feature>/
📋 Spec updated: docs/forge/specs/<feature>-scenarios.md

Run `/start` to begin a new feature.
```

## Error Handling

- **Incomplete tasks**: List each incomplete task with its status. Do NOT proceed.
- **Verification not passed**: "Verification must pass before marking done. Run `/next` to trigger verification."
- **Archive directory already exists**: Append timestamp to avoid collision: `<date>-<time>-<feature>/`
- **CLAUDE.md write fails**: Warn user but continue archival. "⚠️ Could not update CLAUDE.md. Update manually."
- **Scenarios file missing**: Warn but continue. "⚠️ scenarios.md not found. Skipping spec merge."

## Notes

- `/done` is irreversible — always validate first
- Deferred tasks are recorded but NOT re-tracked automatically
- Archived features are read-only history
- CLAUDE.md update is critical for future context
```

- [ ] **Step 6: Add done command to CLI index**

Update `forge/src/index.ts` to register `done` subcommand with `validate`, `archive`, `reset` sub-subcommands.

- [ ] **Step 7: Commit**

```bash
cd forge
git add src/commands/done.ts tests/unit/commands/done.test.ts
git commit -m "feat: add /done skill and CLI command with validation and archival"
```

---

### Task 3: `/bugfix` Skill File + CLI Command

**Files:**
- Create: `~/.agents/skills/forge/bugfix.md`
- Create: `forge/src/commands/bugfix.ts`
- Create: `forge/tests/unit/commands/bugfix.test.ts`

- [ ] **Step 1: Write failing test for bugfix CLI command**

```typescript
// tests/unit/commands/bugfix.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generateBugfixId, initBugfix } from '../../../src/commands/bugfix';
import * as fs from 'fs';
import * as path from 'path';

describe('Bugfix Command', () => {
  const testDir = path.join(__dirname, '../../tmp-bugfix-test');

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
    fs.mkdirSync(path.join(testDir, '.forge'), { recursive: true });
    fs.mkdirSync(path.join(testDir, 'docs', 'forge', 'changes'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('generateBugfixId', () => {
    it('should generate sequential bugfix IDs', () => {
      const id1 = generateBugfixId();
      const id2 = generateBugfixId();
      expect(id1).toMatch(/^bugfix-\d+$/);
      expect(id2).toMatch(/^bugfix-\d+$/);
      expect(id2).not.toBe(id1);
    });

    it('should generate unique IDs even when called rapidly', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateBugfixId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('initBugfix', () => {
    it('should create bugfix directory and progress entry', () => {
      const result = initBugfix(testDir, 'Login button not responding');
      expect(result.slug).toMatch(/^bugfix-\d+$/);
      expect(fs.existsSync(path.join(testDir, 'docs', 'forge', 'changes', result.slug))).toBe(true);

      const progress = JSON.parse(fs.readFileSync(path.join(testDir, '.forge', 'progress.json'), 'utf-8'));
      expect(progress.status).toBe('bugfix');
      expect(progress.feature).toBe(result.slug);
    });

    it('should fail if another feature is in progress', () => {
      // Set up an existing feature
      const existingProgress = {
        version: '1.0',
        feature: 'existing-feature',
        status: 'executing',
        phase: 'batch_execution',
        created_at: '2026-05-20T08:00:00Z',
        updated_at: '2026-05-21T10:30:00Z',
        total_batches: 1,
        current_batch: 1,
        batches: [{ batch: 1, status: 'in_progress', tasks: [] }],
        verification: { status: 'pending', test_mode: 'normal', last_run: null, report_path: null },
      };
      fs.writeFileSync(path.join(testDir, '.forge', 'progress.json'), JSON.stringify(existingProgress));

      expect(() => initBugfix(testDir, 'Test bug')).toThrow('active feature');
    });

    it('should write bug description to change directory', () => {
      const result = initBugfix(testDir, 'Login button not responding on mobile');
      const bugReportPath = path.join(testDir, 'docs', 'forge', 'changes', result.slug, 'bug-report.md');
      expect(fs.existsSync(bugReportPath)).toBe(true);
      const content = fs.readFileSync(bugReportPath, 'utf-8');
      expect(content).toContain('Login button not responding on mobile');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd forge && npx vitest run tests/unit/commands/bugfix.test.ts -v`
Expected: FAIL — module not found

- [ ] **Step 3: Write bugfix CLI command**

```typescript
// src/commands/bugfix.ts
import * as fs from 'fs';
import * as path from 'path';
import type { ProgressState } from '../types';

export function generateBugfixId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 6);
  return `bugfix-${timestamp}-${random}`;
}

export interface BugfixResult {
  slug: string;
  changeDir: string;
}

export function initBugfix(projectRoot: string, description: string): BugfixResult {
  const progressPath = path.join(projectRoot, '.forge', 'progress.json');

  // Check for active feature
  if (fs.existsSync(progressPath)) {
    const progress = JSON.parse(fs.readFileSync(progressPath, 'utf-8')) as ProgressState;
    if (progress.status !== 'idle' && progress.feature) {
      throw new Error(`Cannot start bugfix: there is already an active feature "${progress.feature}". Complete it with /done or cancel first.`);
    }
  }

  const slug = generateBugfixId();
  const changeDir = path.join(projectRoot, 'docs', 'forge', 'changes', slug);

  // Create change directory
  fs.mkdirSync(changeDir, { recursive: true });

  // Write bug report
  const bugReportPath = path.join(changeDir, 'bug-report.md');
  fs.writeFileSync(bugReportPath, `# Bug Report: ${slug}\n\n## Description\n\n${description}\n\n## Reproduction Steps\n\n<!-- To be filled during bugfix flow -->\n\n## Root Cause\n\n<!-- To be determined during investigation -->\n\n## Fix\n\n<!-- To be documented after fix -->\n`);

  // Update progress.json
  const progress: ProgressState = {
    version: '1.0',
    feature: slug,
    status: 'bugfix',
    phase: 'brainstorming',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    total_batches: 0,
    current_batch: 0,
    batches: [],
    verification: { status: 'pending', test_mode: 'normal', last_run: null, report_path: null },
  };
  fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));

  return { slug, changeDir };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd forge && npx vitest run tests/unit/commands/bugfix.test.ts -v`
Expected: PASS (5 tests)

- [ ] **Step 5: Create bugfix.md skill file**

Create at `~/.agents/skills/forge/bugfix.md`:

```markdown
# Forge Skill: /bugfix

## Trigger

User runs: `/bugfix <description>`

Where `<description>` is:
- Bug description text
- Path to error log file
- Reproduction steps
- Mixed (text + file paths)

## Pre-flight Checks

1. Read `.forge/progress.json`
2. If `status` is NOT `idle`:
   - Output: "❌ There is already an active feature: `{feature}`. Complete it with `/done` or cancel before starting a bugfix."
   - Stop.

## Phase 1: Bug Understanding

### 1.1 Initialize Bugfix

1. Run `forge bugfix init "<description>"` CLI command
2. Creates `docs/forge/changes/bugfix-<id>/`
3. Writes `bug-report.md`
4. Updates `progress.json` to `status: bugfix`

### 1.2 Reproduction Confirmation

1. Read `bug-report.md`
2. If description is unclear:
   - Ask user for clarification
   - Ask for reproduction steps
   - Ask for expected vs actual behavior
3. Attempt to reproduce the bug:
   - Run the application
   - Follow reproduction steps
   - Confirm the bug exists
4. Update `bug-report.md` with confirmed reproduction steps:
   ```markdown
   ## Reproduction Steps
   1. Step 1
   2. Step 2
   3. Step 3
   **Expected**: <expected behavior>
   **Actual**: <actual behavior>
   ```

### 1.3 Root Cause Analysis

1. Run GitNexus analysis (if available) to understand affected code
2. Trace the bug to its root cause:
   - Which file(s) contain the bug?
   - What is the specific issue?
   - What is the blast radius of the fix?
3. Update `bug-report.md`:
   ```markdown
   ## Root Cause
   <detailed explanation of the root cause>

   ## Affected Files
   - `path/to/file1.ts` — <description>
   - `path/to/file2.ts` — <description>

   ## Blast Radius
   <which functions/classes/tests are affected>
   ```

## Phase 2: Fix Planning

### 2.1 Generate Fix Plan

Create a lightweight fix plan (1-3 tasks):
```markdown
## Fix Plan

### Task 1: Write regression test
- File: `tests/xxx.test.ts`
- Write test that reproduces the bug (should fail)

### Task 2: Implement fix
- File: `src/xxx.ts`
- Fix the root cause
- Verify regression test passes

### Task 3: Verify no regressions
- Run full test suite
- Verify reproduction steps no longer trigger bug
```

### 2.2 Present to User

```
## Bugfix: <bugfix-id>

### Bug
<description>

### Reproduction
<confirmed steps>

### Root Cause
<analysis>

### Fix Plan (3 tasks)
<plan summary>

Proceed with fix? (yes/no)
```

## Phase 3: Fix Execution (TDD)

### 3.1 Write Regression Test (Red)

1. Write a test that reproduces the bug
2. Run the test to confirm it FAILS (red)
3. This ensures the bug is real and the test catches it

### 3.2 Implement Fix (Green)

1. Write minimal code to fix the root cause
2. Run the regression test to confirm it PASSES (green)
3. Do NOT refactor yet — just make it work

### 3.3 Refactor

1. Clean up the fix code
2. Ensure regression test still passes
3. Run full test suite to verify no regressions

### 3.4 Verify Reproduction Steps

1. Manually verify the reproduction steps no longer trigger the bug
2. Update `bug-report.md`:
   ```markdown
   ## Fix
   <description of the fix>

   ## Verification
   - [x] Regression test passes
   - [x] Full test suite passes
   - [x] Reproduction steps no longer trigger bug
   ```

### 3.5 Git Commit

```bash
git add <affected-files>
git commit -m "fix: <brief description> [forge <bugfix-id>]"
```

## Phase 4: Archive

### 4.1 Merge Regression Test

The regression test is now part of the permanent test suite. Document it:
```markdown
## Regression Tests Added
- `tests/xxx.test.ts` — <description of what it tests>
```

### 4.2 Archive Bugfix

1. Move `docs/forge/changes/<bugfix-id>/` → `docs/forge/changes/archive/<date>-<bugfix-id>/`
2. Reset `progress.json` to `status: idle`
3. Git commit:
   ```bash
   git add docs/forge/changes/archive/ .forge/progress.json
   git commit -m "chore: archive bugfix <bugfix-id> [forge done]"
   ```

### 4.3 Output Summary

```
## Bugfix Complete: <bugfix-id>

🐛 Bug: <description>
🔧 Fix: <brief description>
✅ Regression test: added to test suite
📁 Archived: docs/forge/changes/archive/<date>-<bugfix-id>/
```

## Error Handling

- **Bug not reproducible**: "Cannot reproduce the bug with the given steps. Please provide more detail or verify the environment."
- **Fix breaks other tests**: "Fix caused regressions in <N> tests. Re-evaluate the fix approach."
- **Root cause unclear**: "Root cause analysis inconclusive. More investigation needed. Continue? (yes/no)"
- **Another feature in progress**: "❌ There is already an active feature. Complete it first."

## Notes

- `/bugfix` skips full planning — it's a lightweight flow
- Always write regression test FIRST (TDD)
- Always verify reproduction steps no longer trigger the bug
- Blast radius analysis is critical — don't introduce new bugs
```

- [ ] **Step 6: Add bugfix command to CLI index**

Update `forge/src/index.ts` to register `bugfix` subcommand with `init` sub-subcommand.

- [ ] **Step 7: Commit**

```bash
cd forge
git add src/commands/bugfix.ts tests/unit/commands/bugfix.test.ts
git commit -m "feat: add /bugfix skill and CLI command with TDD regression testing"
```

---

### Task 4: `session-handoff` Internal Skill File

**Files:**
- Create: `~/.agents/skills/forge/session-handoff.md`

- [ ] **Step 1: Create the session-handoff.md skill file**

Create at `~/.agents/skills/forge/session-handoff.md`:

```markdown
# Forge Skill: session-handoff (Internal)

## Trigger

Called internally after each batch completes, or when user explicitly requests session handoff.

## Purpose

Prepare all information needed to seamlessly continue work in a new AI session.

## Behavior

### 1. Read Current State

1. Read `.forge/progress.json`
2. Read `CLAUDE.md` (existing content)
3. Read `docs/forge/changes/<feature>/` for latest artifacts

### 2. Update CLAUDE.md

Append or update the Forge section in `CLAUDE.md`:

```markdown
## Forge

**Current Feature**
- Feature: <feature-slug>
- Status: <status>/<phase>
- Completed: batch 1-<N> (<X> tasks done)
- Current: batch <N+1>, from task <id>
- Review: batch 1-<N> passed, no blocking issues

**Key Decisions**
- <date>: <decision> — <rationale>
(extract from proposal.md and review-batch-*.md)

**Completed Features**
- <previous-feature> (<date>)
  - Tasks: <N> completed, <M> deferred
  - Test coverage: <X>%
```

**Rules for CLAUDE.md updates:**
- If Forge section exists → update it (don't duplicate)
- If Forge section doesn't exist → create it
- Key decisions are cumulative (append, don't replace)
- Completed features are cumulative (append, don't replace)
- Current feature section is replaced each time

### 3. Generate Recovery Instructions

Output a standardized recovery block that the user can copy to a new session:

```
--- COPY BELOW TO NEW SESSION ---

Continue feature: <feature-slug>
Completed: batch 1-<N> (<X> tasks done)
Next: batch <N+1>
Execute: /next

--- END COPY ---
```

### 4. Output Session Handoff Summary

```
## Session Handoff: <feature-slug>

📊 Progress:
- Completed: batch 1-<N> (<X>/<total> tasks done)
- Next: batch <N+1>, starting with task <id>: <title>
- Review: passed, no blocking issues

📝 CLAUDE.md updated with:
- Current progress
- Key decisions from this batch
- <N> completed features total

🔄 To continue in a new session:
1. Open a new session in this project
2. Paste the recovery instructions below
3. Run /next

--- COPY BELOW TO NEW SESSION ---

Continue feature: <feature-slug>
Completed: batch 1-<N> (<X> tasks done)
Next: batch <N+1>
Execute: /next

--- END COPY ---
```

### 5. Verify Handoff Completeness

Before outputting, verify:
- [ ] `progress.json` is up to date
- [ ] `CLAUDE.md` has been updated
- [ ] Recovery instructions are accurate
- [ ] All batch artifacts (commits, reviews) are in place
- [ ] No tasks left in `in_progress` state without completion

## Error Handling

- **CLAUDE.md does not exist**: Create it with minimal Forge section.
- **CLAUDE.md write fails**: Warn user. "⚠️ Could not update CLAUDE.md. Please update manually before opening new session."
- **progress.json inconsistent**: "⚠️ progress.json has inconsistencies. Fix before handoff."

## Notes

- This skill ensures zero context loss between sessions
- Recovery instructions are the single source of truth for resuming
- CLAUDE.md is read automatically by Claude Code on session start
- Always suggest opening a new session after batch completion
```

- [ ] **Step 2: Verify the skill file is valid markdown**

- [ ] **Step 3: Document creation**

```bash
echo "Skill file created at user level: ~/.agents/skills/forge/session-handoff.md"
```

---

### Task 5: Archive Utility

**Files:**
- Create: `forge/src/utils/archive.ts`
- Create: `forge/tests/unit/utils/archive.test.ts`

- [ ] **Step 1: Write failing test for archive utility**

```typescript
// tests/unit/utils/archive.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createArchivePath, listArchivedFeatures, getFeatureArchive } from '../../../src/utils/archive';
import * as fs from 'fs';
import * as path from 'path';

describe('Archive Utility', () => {
  const testDir = path.join(__dirname, '../../tmp-archive-test');

  beforeEach(() => {
    fs.mkdirSync(path.join(testDir, 'docs', 'forge', 'changes', 'archive'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('createArchivePath', () => {
    it('should generate archive path with date prefix', () => {
      const archivePath = createArchivePath(testDir, 'user-login', '2026-05-21');
      expect(archivePath).toContain('2026-05-21-user-login');
      expect(archivePath).toContain('archive');
    });

    it('should handle name collisions by appending timestamp', () => {
      const existingPath = path.join(testDir, 'docs', 'forge', 'changes', 'archive', '2026-05-21-user-login');
      fs.mkdirSync(existingPath, { recursive: true });

      const archivePath = createArchivePath(testDir, 'user-login', '2026-05-21');
      expect(archivePath).toContain('2026-05-21-');
      expect(archivePath).not.toBe(existingPath); // Different path due to collision
    });
  });

  describe('listArchivedFeatures', () => {
    it('should return list of archived features', () => {
      fs.mkdirSync(path.join(testDir, 'docs', 'forge', 'changes', 'archive', '2026-05-20-feature-a'), { recursive: true });
      fs.mkdirSync(path.join(testDir, 'docs', 'forge', 'changes', 'archive', '2026-05-21-feature-b'), { recursive: true });

      const archived = listArchivedFeatures(testDir);
      expect(archived).toHaveLength(2);
      expect(archived).toContain('2026-05-20-feature-a');
      expect(archived).toContain('2026-05-21-feature-b');
    });

    it('should return empty array when no archives exist', () => {
      const archived = listArchivedFeatures(testDir);
      expect(archived).toHaveLength(0);
    });
  });

  describe('getFeatureArchive', () => {
    it('should return archive path for a known feature', () => {
      const archivePath = path.join(testDir, 'docs', 'forge', 'changes', 'archive', '2026-05-21-user-login');
      fs.mkdirSync(archivePath, { recursive: true });

      const result = getFeatureArchive(testDir, 'user-login');
      expect(result).toBe(archivePath);
    });

    it('should return null for unknown feature', () => {
      const result = getFeatureArchive(testDir, 'nonexistent');
      expect(result).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd forge && npx vitest run tests/unit/utils/archive.test.ts -v`
Expected: FAIL — module not found

- [ ] **Step 3: Write archive utility**

```typescript
// src/utils/archive.ts
import * as fs from 'fs';
import * as path from 'path';

export function createArchivePath(projectRoot: string, featureSlug: string, date: string): string {
  const archiveDir = path.join(projectRoot, 'docs', 'forge', 'changes', 'archive');
  let archivePath = path.join(archiveDir, `${date}-${featureSlug}`);

  // Handle name collision
  if (fs.existsSync(archivePath)) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    archivePath = path.join(archiveDir, `${date}-${timestamp}-${featureSlug}`);
  }

  fs.mkdirSync(archivePath, { recursive: true });
  return archivePath;
}

export function listArchivedFeatures(projectRoot: string): string[] {
  const archiveDir = path.join(projectRoot, 'docs', 'forge', 'changes', 'archive');
  if (!fs.existsSync(archiveDir)) {
    return [];
  }

  return fs.readdirSync(archiveDir).filter(entry => {
    const fullPath = path.join(archiveDir, entry);
    return fs.statSync(fullPath).isDirectory();
  });
}

export function getFeatureArchive(projectRoot: string, featureSlug: string): string | null {
  const archived = listArchivedFeatures(projectRoot);
  const match = archived.find(entry => entry.endsWith(`-${featureSlug}`));
  if (!match) {
    return null;
  }
  return path.join(projectRoot, 'docs', 'forge', 'changes', 'archive', match);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd forge && npx vitest run tests/unit/utils/archive.test.ts -v`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
cd forge
git add src/utils/archive.ts tests/unit/utils/archive.test.ts
git commit -m "feat: add archive utility for feature archival management"
```

---

### Task 6: Integration Test — Full Lifecycle

**Files:**
- No new files

- [ ] **Step 1: Set up test project**

1. Create a temporary test directory
2. Run `forge init` in it
3. Verify `.forge/progress.json` shows `status: idle`

- [ ] **Step 2: Test `/resume` with no active feature**

Run `forge resume` (or simulate `/resume`):
Expected: "No active feature. Run `/start` to begin."

- [ ] **Step 3: Test `/resume` with active feature**

1. Manually set up a `progress.json` with `status: executing, current_batch: 2`
2. Run `forge resume`
3. Verify resume summary shows correct batch/task state

- [ ] **Step 4: Test `/done` validation failure**

1. Set up `progress.json` with incomplete tasks
2. Run `forge done validate`
3. Verify validation errors are reported

- [ ] **Step 5: Test `/done` success path**

1. Set up `progress.json` with all tasks done and verification passed
2. Create `docs/forge/changes/test-feature/scenarios.md`
3. Run `forge done archive test-feature 2026-05-21`
4. Verify archive directory created
5. Verify scenarios copied to specs
6. Run `forge done reset`
7. Verify `progress.json` reset to idle

- [ ] **Step 6: Test `/bugfix` flow**

1. Run `forge bugfix init "Test bug description"`
2. Verify `progress.json` status is `bugfix`
3. Verify `docs/forge/changes/bugfix-*/bug-report.md` exists
4. Verify bugfix cannot start while another feature is active

- [ ] **Step 7: Document results**

Write a brief summary of integration test results.

---

### Task 7: Run Full Test Suite for Phase 1c

**Files:**
- No new files

- [ ] **Step 1: Run all forge CLI tests**

Run: `cd forge && npx vitest run`
Expected: All tests pass (81 from Phase 1b + ~27 new from Phase 1c = ~108 total)

- [ ] **Step 2: Check test coverage**

Run: `cd forge && npx vitest run --coverage`
Expected: Coverage ≥80% for all source files

- [ ] **Step 3: Commit**

```bash
cd forge
git add .
git commit -m "chore: verify full test suite passes for Phase 1c"
```

---

## Self-Review Checklist

1. **Spec coverage:** ✅ All Phase 1c requirements covered:
   - `/resume` skill: state reconstruction + inconsistency detection ✅
   - `/done` skill: validation + archival + CLAUDE.md update ✅
   - `/bugfix` skill: lightweight TDD bug fix flow ✅
   - `session-handoff` skill: cross-session context transfer ✅
   - Archive utility ✅
   - CLI commands for all skills ✅

2. **No placeholders:** ✅ Every skill file has complete instructions, every utility has complete code

3. **Type consistency:** ✅ All types from Phase 1a reused consistently

4. **Test quality:** ✅ Tests validate actual behavior, not just "something returned"

5. **Error handling:** ✅ All commands handle edge cases (no progress.json, corrupted state, active feature conflicts)

6. **State machine completeness:** ✅
   - idle → planning (`/start`)
   - planning → executing (`/next`)
   - executing → verification_complete (`/next`)
   - verification_complete → idle (`/done`)
   - idle → bugfix (`/bugfix`)
   - bugfix → idle (archive after fix)
   - any → any (`/resume` for recovery)
