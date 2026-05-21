# Forge Phase 1b: Core Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the `/start` and `/next` skill files and the state machine that drives the core Forge workflow — from requirement input through planning to executing the first task.

**Architecture:** Skill-driven. Skills are markdown files installed at `~/.agents/skills/forge/`. They instruct the AI agent what to do. The CLI (`forge/`) provides the infrastructure (init, status, config, validate). The skills orchestrate the workflow by reading/writing `.forge/progress.json` and calling other skills (Superpowers brainstorming, writing-plans, etc.).

**Tech Stack:** Markdown skill files, JSON state files (progress.json, config.json, scenarios.json), existing forge CLI utilities

---

## File Structure

```
~/.agents/skills/forge/          ← User-level skill install
  ├── start.md                   ← /start skill
  ├── next.md                    ← /next skill
  ├── scenarios.md               ← Internal: scenario generation
  └── progress-tracking.md       ← Internal: progress externalization

forge/
  src/
    commands/
      start.ts                   ← CLI helper for /start (optional)
      next.ts                    ← CLI helper for /next (optional)
    utils/
      slug.ts                    ← Feature slug generation
      batch.ts                   ← Batch cutting logic (topological sort)
  tests/
    unit/
      utils/
        slug.test.ts
        batch.test.ts
```

---

### Task 1: Feature Slug Generation Utility

**Files:**
- Create: `forge/src/utils/slug.ts`
- Create: `forge/tests/unit/utils/slug.test.ts`

- [ ] **Step 1: Write failing test for slug utility**

```typescript
// tests/unit/utils/slug.test.ts
import { describe, it, expect } from 'vitest';
import { generateSlug } from '../../../src/utils/slug';

describe('Feature Slug Generation', () => {
  it('should convert simple text to slug', () => {
    expect(generateSlug('User Authentication')).toBe('user-authentication');
  });

  it('should handle Chinese characters by using pinyin-like fallback or hash', () => {
    const slug = generateSlug('用户登录功能');
    expect(slug).toMatch(/^[a-z0-9-]+$/);
    expect(slug.length).toBeGreaterThan(0);
  });

  it('should handle mixed Chinese and English', () => {
    const slug = generateSlug('用户登录 user login');
    expect(slug).toMatch(/^[a-z0-9-]+$/);
  });

  it('should lowercase and replace spaces with hyphens', () => {
    expect(generateSlug('Add Login Page')).toBe('add-login-page');
  });

  it('should remove special characters', () => {
    expect(generateSlug('Add login page! @#$')).toBe('add-login-page');
  });

  it('should truncate long slugs', () => {
    const long = 'a'.repeat(100);
    const slug = generateSlug(long);
    expect(slug.length).toBeLessThanOrEqual(50);
  });

  it('should handle empty input', () => {
    const slug = generateSlug('');
    expect(slug).toMatch(/^feature-[a-z0-9]+$/);
  });

  it('should generate unique slugs with counter', () => {
    const existing = ['user-auth', 'user-auth-2'];
    const slug = generateSlug('User Auth', existing);
    expect(slug).toBe('user-auth-3');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd forge && npx vitest run tests/unit/utils/slug.test.ts -v`
Expected: FAIL — module not found

- [ ] **Step 3: Write slug utility**

```typescript
// src/utils/slug.ts
export function generateSlug(input: string, existingSlugs: string[] = []): string {
  // Remove special characters, keep alphanumeric and spaces
  let slug = input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  // Handle non-Latin characters (Chinese, etc.) by converting to a hash
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(input)) {
    // Simple hash for non-Latin text
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    slug = `feature-${Math.abs(hash).toString(36)}`;
  }

  // Truncate to 50 chars
  if (slug.length > 50) {
    slug = slug.substring(0, 50).replace(/-[^-]*$/, '');
  }

  // Handle empty result
  if (!slug) {
    slug = `feature-${Date.now().toString(36)}`;
  }

  // Ensure uniqueness
  if (existingSlugs.includes(slug)) {
    let counter = 2;
    while (existingSlugs.includes(`${slug}-${counter}`)) {
      counter++;
    }
    slug = `${slug}-${counter}`;
  }

  return slug;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd forge && npx vitest run tests/unit/utils/slug.test.ts -v`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
cd forge
git add src/utils/slug.ts tests/unit/utils/slug.test.ts
git commit -m "feat: add feature slug generation utility with CJK support"
```

---

### Task 2: Batch Cutting Utility

**Files:**
- Create: `forge/src/utils/batch.ts`
- Create: `forge/tests/unit/utils/batch.test.ts`

- [ ] **Step 1: Write failing test for batch utility**

```typescript
// tests/unit/utils/batch.test.ts
import { describe, it, expect } from 'vitest';
import { cutBatches } from '../../../src/utils/batch';

describe('Batch Cutting', () => {
  it('should cut tasks into batches of max size', () => {
    const tasks = Array.from({ length: 16 }, (_, i) => ({
      id: i + 1,
      title: `Task ${i + 1}`,
      dependencies: [],
    }));
    const batches = cutBatches(tasks, 6);
    expect(batches).toHaveLength(3);
    expect(batches[0]).toHaveLength(6);
    expect(batches[1]).toHaveLength(6);
    expect(batches[2]).toHaveLength(4);
  });

  it('should respect dependency order', () => {
    const tasks = [
      { id: 1, title: 'Task 1', dependencies: [] },
      { id: 2, title: 'Task 2', dependencies: [1] },
      { id: 3, title: 'Task 3', dependencies: [2] },
      { id: 4, title: 'Task 4', dependencies: [] },
    ];
    const batches = cutBatches(tasks, 6);
    // Task 1 must be before Task 2, Task 2 before Task 3
    const batchOf1 = batches.findIndex(b => b.some(t => t.id === 1));
    const batchOf2 = batches.findIndex(b => b.some(t => t.id === 2));
    const batchOf3 = batches.findIndex(b => b.some(t => t.id === 3));
    expect(batchOf1).toBeLessThanOrEqual(batchOf2);
    expect(batchOf2).toBeLessThanOrEqual(batchOf3);
  });

  it('should handle tasks with no dependencies', () => {
    const tasks = [
      { id: 1, title: 'Task 1', dependencies: [] },
      { id: 2, title: 'Task 2', dependencies: [] },
    ];
    const batches = cutBatches(tasks, 6);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);
  });

  it('should handle empty task list', () => {
    const batches = cutBatches([], 6);
    expect(batches).toHaveLength(0);
  });

  it('should handle single task', () => {
    const tasks = [{ id: 1, title: 'Task 1', dependencies: [] }];
    const batches = cutBatches(tasks, 6);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(1);
  });

  it('should handle complex dependency graph', () => {
    const tasks = [
      { id: 1, title: 'Base A', dependencies: [] },
      { id: 2, title: 'Base B', dependencies: [] },
      { id: 3, title: 'Depends on A', dependencies: [1] },
      { id: 4, title: 'Depends on B', dependencies: [2] },
      { id: 5, title: 'Depends on A and B', dependencies: [1, 2] },
      { id: 6, title: 'Depends on 3 and 4', dependencies: [3, 4] },
    ];
    const batches = cutBatches(tasks, 6);
    // Verify dependency ordering
    for (const task of tasks) {
      const taskBatch = batches.findIndex(b => b.some(t => t.id === task.id));
      for (const depId of task.dependencies) {
        const depBatch = batches.findIndex(b => b.some(t => t.id === depId));
        expect(depBatch).toBeLessThan(taskBatch);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd forge && npx vitest run tests/unit/utils/batch.test.ts -v`
Expected: FAIL — module not found

- [ ] **Step 3: Write batch cutting utility**

```typescript
// src/utils/batch.ts
export interface TaskWithDeps {
  id: number;
  title: string;
  dependencies: number[];
}

export function cutBatches(tasks: TaskWithDeps[], maxBatchSize: number): TaskWithDeps[][] {
  if (tasks.length === 0) return [];

  // Topological sort
  const sorted = topologicalSort(tasks);

  // Cut into batches respecting max size
  const batches: TaskWithDeps[][] = [];
  let currentBatch: TaskWithDeps[] = [];
  const completedIds = new Set<number>();

  for (const task of sorted) {
    // Check if all dependencies are in completed batches
    const depsMet = task.dependencies.every(depId => completedIds.has(depId));

    if (!depsMet) {
      // Flush current batch and start new one
      if (currentBatch.length > 0) {
        batches.push(currentBatch);
        currentBatch.forEach(t => completedIds.add(t.id));
        currentBatch = [];
      }
    }

    if (currentBatch.length >= maxBatchSize) {
      batches.push(currentBatch);
      currentBatch.forEach(t => completedIds.add(t.id));
      currentBatch = [];
    }

    currentBatch.push(task);
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

function topologicalSort(tasks: TaskWithDeps[]): TaskWithDeps[] {
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  const visited = new Set<number>();
  const result: TaskWithDeps[] = [];

  function visit(id: number): void {
    if (visited.has(id)) return;
    visited.add(id);

    const task = taskMap.get(id);
    if (!task) return;

    for (const depId of task.dependencies) {
      visit(depId);
    }

    result.push(task);
  }

  for (const task of tasks) {
    visit(task.id);
  }

  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd forge && npx vitest run tests/unit/utils/batch.test.ts -v`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
cd forge
git add src/utils/batch.ts tests/unit/utils/batch.test.ts
git commit -m "feat: add batch cutting utility with topological sort for dependency ordering"
```

---

### Task 3: `/start` Skill File

**Files:**
- Create: `~/.agents/skills/forge/start.md`

- [ ] **Step 1: Create the start.md skill file**

This is a markdown skill file that instructs the AI agent what to do when the user runs `/start <requirement>`.

Create the file at `~/.agents/skills/forge/start.md` with this content:

```markdown
# Forge Skill: /start

## Trigger

User runs: `/start <requirement>`

Where `<requirement>` is:
- Text description of a feature
- Path to a PRD document (.md / .pdf / .docx)
- Path to UI design files (.png / .jpg / .figma URL)
- Mixed (text + file paths)

## Pre-flight Checks

1. Read `.forge/progress.json`
2. If `status` is NOT `idle`:
   - Output: "❌ There is already an active feature: `{feature}`. Complete it with `/done` or cancel before starting a new one."
   - Stop.
3. If `.forge/progress.json` does not exist:
   - Output: "❌ Forge is not initialized in this project. Run: `forge init`"
   - Stop.

## Phase 1: Requirement Understanding

### 1.1 Create Feature Directory

1. Generate a feature slug from the requirement text (use `forge/src/utils/slug.ts` logic: lowercase, hyphenate, remove specials, truncate to 50 chars, handle CJK with hash)
2. Create directory: `docs/forge/changes/<feature-slug>/`
3. Initialize `progress.json`:
   ```json
   {
     "version": "1.0",
     "feature": "<feature-slug>",
     "status": "planning",
     "phase": "brainstorming",
     "created_at": "<ISO-8601>",
     "updated_at": "<ISO-8601>",
     "total_batches": 0,
     "current_batch": 0,
     "batches": [],
     "verification": {
       "status": "pending",
       "test_mode": "normal",
       "last_run": null,
       "report_path": null
     }
   }
   ```

### 1.2 Brainstorming

1. If requirement includes file paths, read those files first
2. Invoke the **superpowers:brainstorming** skill with the requirement as input
3. Follow the brainstorming process:
   - Ask clarifying questions one at a time
   - If UI is involved, offer visual companion
   - Propose 2-3 approaches
   - Present design sections incrementally
4. Output: `docs/forge/changes/<feature-slug>/proposal.md`

### 1.3 Scenario Generation

1. Read `proposal.md`
2. Invoke the **forge scenarios** skill (internal):
   - Parse all feature points from the proposal
   - For each feature point, generate Given/When/Then scenarios
   - If mockup exists, generate UI scenarios
   - If performance requirements mentioned, generate performance scenarios
   - Each scenario includes:
     - `id`: sequential number
     - `title`: short description
     - `given`: precondition
     - `when`: action
     - `then`: array of assertions with type (`functional`, `ui`, `side-effect`, `performance`)
     - `testTypes`: array (`functional`, `ui`, `integration`, `performance`)
     - `priority`: `P0`, `P1`, or `P2`
3. Output: `docs/forge/changes/<feature-slug>/scenarios.json`
4. Also render as `docs/forge/changes/<feature-slug>/scenarios.md` for human reading

### 1.4 Present to User

Output:
```
## Feature: <feature-slug>

### Proposal Summary
<2-3 sentence summary from proposal.md>

### Scenarios (<count> total, <P0-count> P0, <P1-count> P1, <P2-count> P2)

<Rendered scenarios from scenarios.md>

---

Do these scenarios accurately describe your requirements?

A) ✅ Confirm → Run `/next` to proceed to planning
B) ✏️ Modify → Edit `docs/forge/changes/<feature-slug>/scenarios.json` or `proposal.md`, then re-run `/start`
C) ❌ Cancel → Delete `docs/forge/changes/<feature-slug>/` directory
```

### 1.5 Update State

Update `progress.json`:
```json
{
  "phase": "awaiting_confirmation"
}
```
Set `updated_at` to current timestamp.

## Error Handling

- **Empty requirement**: "Please provide a requirement description, file path, or both."
- **File not found**: "File not found: <path>. Please check the path and try again."
- **Brainstorming fails**: "Brainstorming failed. Please try again or provide more detail."
- **Scenario generation fails**: "Failed to generate scenarios. Check proposal.md for completeness."

## Notes

- Do NOT proceed to planning without user confirmation
- Do NOT make assumptions about unclear requirements — ask the user
- If the requirement spans multiple independent subsystems (>3 domains), suggest splitting into multiple features
- All state changes must be written to `.forge/progress.json` immediately
```

- [ ] **Step 2: Verify the skill file is valid markdown**

Read the file back and confirm it's well-formed.

- [ ] **Step 3: Commit**

```bash
git add ~/.agents/skills/forge/start.md 2>/dev/null || echo "Skill file created at user level (not in repo)"
```

Note: Skill files are at user level and may not be in the repo. Document their creation.

---

### Task 4: `/next` Skill File

**Files:**
- Create: `~/.agents/skills/forge/next.md`

- [ ] **Step 1: Create the next.md skill file**

Create the file at `~/.agents/skills/forge/next.md` with this content:

```markdown
# Forge Skill: /next

## Trigger

User runs: `/next`

## Pre-flight Checks

1. Read `.forge/progress.json`
2. If file does not exist:
   - Output: "❌ Forge is not initialized. Run: `forge init`"
   - Stop.
3. Read `status` and `phase` fields to determine behavior.

## Behavior by State

### State A: `status=planning, phase=awaiting_confirmation` → Phase 2: Planning

**2.1 Codebase Analysis (Existing Projects Only)**

1. Read `.forge/config.json` to check `project_type`
2. If `project_type` is `existing`:
   - Check if GitNexus is available
   - If available, run codebase analysis to get dependency graph
   - Store analysis results for later use
3. If `project_type` is `new`:
   - Skip codebase analysis

**2.2 Task Planning**

1. Read `docs/forge/changes/<feature>/proposal.md`
2. Read `docs/forge/changes/<feature>/scenarios.json`
3. Read GitNexus dependency graph (if available)
4. Invoke the **superpowers:writing-plans** skill with:
   - proposal.md as context
   - scenarios.json as test source
   - dependency graph (if available)
5. Rules for writing-plans:
   - Each task should be 2-5 minutes of work
   - Each task includes: file paths, complete code, TDD steps, verification steps
   - TDD steps come from scenarios.json matching scenarios
   - Assume implementer has zero context and poor taste
   - DRY, YAGNI, TDD, frequent commits
6. Output: `docs/forge/changes/<feature>/plans/full-plan.md`

**2.3 Batch Cutting**

1. Parse `full-plan.md` to extract tasks and their dependencies
2. Use the batch cutting algorithm:
   - Topological sort by dependencies
   - Cut into batches of max 6 tasks (from `config.json.batch_size`)
   - Respect dependency order (task A depends on B → B must be in earlier batch)
3. Write batch files:
   - `docs/forge/changes/<feature>/plans/batch-1.md`
   - `docs/forge/changes/<feature>/plans/batch-2.md`
   - ...
4. Each batch file contains:
   - Batch number
   - Task list with: id, title, files to modify, TDD steps, verification steps, impact analysis

**2.4 Update Progress**

Update `progress.json`:
```json
{
  "status": "executing",
  "phase": "batch_execution",
  "total_batches": <N>,
  "current_batch": 1,
  "batches": [
    {
      "batch": 1,
      "status": "pending",
      "tasks": [
        { "id": 1, "title": "...", "status": "pending" },
        ...
      ]
    },
    ...
  ]
}
```

**2.5 Execute Batch 1**

Proceed to "Execute Current Batch" section below.

---

### State B: `status=executing, current batch NOT done` → Continue Current Batch

Proceed to "Execute Current Batch" section.

---

### State C: `status=executing, current batch done, more batches` → Next Batch

1. Increment `current_batch` by 1
2. Set new batch status to `in_progress`
3. Update `progress.json`
4. Proceed to "Execute Current Batch" section.

---

### State D: `status=executing, all batches done` → Phase 4: Verification

1. Run full test suite:
   - Read `config.json.test_command`
   - Execute the test command
   - Capture output
2. Run build verification:
   - Execute build command (`npm run build` or equivalent)
3. Update `progress.json`:
   ```json
   {
     "status": "verification_complete",
     "verification": {
       "status": "passed" | "failed",
       "last_run": "<ISO-8601>",
       "report_path": "docs/forge/changes/<feature>/test-report.html"
     }
   }
   ```
4. Output verification summary.
5. If passed: "All tests passed. Run `/done` to complete this feature."
6. If failed: "Some tests failed. Review the report and fix before running `/done`."

---

## Execute Current Batch

For each task in the current batch:

### 3.1 Read Task Definition

Read `docs/forge/changes/<feature>/plans/batch-<N>.md` for the current task:
- task id, title
- files to create/modify
- TDD steps (from scenarios)
- verification steps
- impact analysis

### 3.2 Execute Task (TDD)

1. **Write the failing test first**
   - Convert the scenario's Given/When/Then into test code
   - Run the test to confirm it fails (red)
2. **Write minimal implementation**
   - Write only enough code to make the test pass (green)
3. **Refactor**
   - Clean up code while keeping tests passing
4. **Run verification steps**
   - Execute the task's verification steps from the plan

### 3.3 Update Progress

After task completion:
1. Run unit tests for the affected files
2. If tests fail → auto-fix (max 3 rounds):
   - Read test error output
   - Fix the code
   - Re-run tests
   - If still failing after 3 rounds → mark task as `failed`, stop batch
3. If tests pass:
   - Git commit: `git commit -m "feat: <task-title> [forge task-<id>]"`
   - Update `progress.json`:
     ```json
     {
       "batches": [
         {
           "batch": <N>,
           "tasks": [
             {
               "id": <id>,
               "status": "done",
               "commit": "<git-sha>",
               "completed_at": "<ISO-8601>"
             }
           ]
         }
       ]
     }
     ```

### 3.4 After All Tasks in Batch

1. Set batch status to `done`
2. Run integration tests
3. If integration tests fail → mark batch as `failed`, stop
4. Invoke **superpowers:requesting-code-review** skill:
   - Stage 1: Spec compliance (does code match scenarios?)
   - Stage 2: Code quality (DRY, YAGNI, naming, structure)
5. Write review results to `docs/forge/changes/<feature>/review-batch-<N>.md`
6. If review has blocking issues → mark batch as `blocked`, stop
7. Invoke **forge session-handoff** skill:
   - Update `CLAUDE.md` with current progress
   - Generate recovery instructions
8. Output to user:
   ```
   Batch <N> complete (<done-count>/<total-count> tasks done).

   Suggestion: Open a new session to avoid context overflow.
   Run `/next` to continue with batch <N+1>.
   ```

## Error Handling

- **No active feature**: "❌ No feature in progress. Run `/start` to begin."
- **State mismatch**: "❌ Current state is `<status>`/`<phase>`. `/next` is not applicable. Try `/resume` or `/start`."
- **Task execution fails (3 rounds)**: "Task <id> failed after 3 fix attempts. Please review and fix manually, then run `/resume`."
- **Code review blocking**: "Code review found blocking issues. See `review-batch-<N>.md`. Fix and run `/resume`."

## Notes

- Always read `progress.json` first to determine current state
- Never skip TDD — test first, then implement
- Never skip code review after each batch
- Write all state changes to `progress.json` immediately
- If uncertain about anything, ask the user — do not guess
```

- [ ] **Step 2: Verify the skill file is valid markdown**

Read the file back and confirm it's well-formed.

- [ ] **Step 3: Commit**

```bash
git add ~/.agents/skills/forge/next.md 2>/dev/null || echo "Skill file created at user level (not in repo)"
```

---

### Task 5: `scenarios` Internal Skill File

**Files:**
- Create: `~/.agents/skills/forge/scenarios.md`

- [ ] **Step 1: Create the scenarios.md skill file**

Create the file at `~/.agents/skills/forge/scenarios.md` with this content:

```markdown
# Forge Skill: scenarios (Internal)

## Trigger

Called internally by the `/start` skill after brainstorming completes.

## Input

- `docs/forge/changes/<feature>/proposal.md` — The brainstorming output
- `docs/forge/changes/<feature>/mockup.html` — UI mockup (if exists)

## Behavior

### 1. Parse Proposal

1. Read `proposal.md`
2. Identify all feature points, user flows, and requirements
3. For each feature point, determine:
   - Is it a functional requirement? → functional scenario
   - Does it involve UI? → UI scenario
   - Does it mention performance? → performance scenario
   - Does it involve multiple components? → integration scenario

### 2. Generate Scenarios

For each identified feature point, generate a scenario in this format:

```json
{
  "id": 1,
  "title": "Short descriptive title",
  "given": "Precondition state",
  "when": "User action or system trigger",
  "then": [
    { "assertion": "Expected outcome 1", "type": "functional" },
    { "assertion": "Expected UI change", "type": "ui" },
    { "assertion": "Expected side effect", "type": "side-effect" }
  ],
  "testTypes": ["functional", "ui"],
  "priority": "P0"
}
```

**Priority rules:**
- P0 (blocking): Core functionality, must work for the feature to be usable
- P1 (warning): Important but not critical, feature works without it but degraded
- P2 (record): Nice to have, edge cases, optional features

**Assertion type rules:**
- `functional`: Business logic, API responses, data transformations
- `ui`: Visual changes, navigation, user feedback
- `side-effect`: Database changes, file writes, external API calls, localStorage
- `performance`: Response time, throughput, resource usage

### 3. Write Output

1. Write `docs/forge/changes/<feature>/scenarios.json` with all scenarios
2. Render as `docs/forge/changes/<feature>/scenarios.md` for human reading:

```markdown
# Scenarios: <Feature Name>

## Scenario 1: <title>
**Given**: <given>
**When**: <when>
**Then**:
- <then[0].assertion>
- <then[1].assertion>

**Test Type**: <testTypes joined>
**Priority**: <priority>
```

### 4. Quality Checks

Before outputting, verify:
- Every scenario is testable (no vague assertions like "system works well")
- Every scenario has at least one `then` assertion
- P0 scenarios cover all core user flows
- No duplicate scenarios
- Scenario IDs are sequential starting from 1

## Output

- `docs/forge/changes/<feature>/scenarios.json` — Machine-readable
- `docs/forge/changes/<feature>/scenarios.md` — Human-readable

## Notes

- Scenarios must be derived from the proposal, not invented
- If the proposal is unclear about a requirement, include a scenario with a `[CLARIFY]` tag and ask the user
- Performance scenarios must have measurable thresholds (not "fast", but "response time <500ms")
```

- [ ] **Step 2: Verify the skill file is valid markdown**

- [ ] **Step 3: Commit**

---

### Task 6: `progress-tracking` Internal Skill File

**Files:**
- Create: `~/.agents/skills/forge/progress-tracking.md`

- [ ] **Step 1: Create the progress-tracking.md skill file**

Create the file at `~/.agents/skills/forge/progress-tracking.md` with this content:

```markdown
# Forge Skill: progress-tracking (Internal)

## Trigger

Called after each task is completed by a subagent.

## Purpose

Defines the standard operations a subagent must perform after completing a task.

## Behavior

### 1. Run Unit Tests

1. Execute the test command from `.forge/config.json.test_command`
2. If tests pass → proceed to step 2
3. If tests fail → auto-fix (max 3 rounds):
   - Read the test error output
   - Fix the failing code
   - Re-run tests
   - If still failing after 3 rounds → go to step 4

### 2. Git Commit

1. Stage changed files: `git add <affected-files>`
2. Commit with standard message format:
   ```
   feat: <task-title> [forge task-<id>]
   ```
3. Capture the commit SHA

### 3. Update progress.json

Read the current `progress.json`, then update the specific task:

```json
{
  "batches": [
    {
      "batch": <N>,
      "tasks": [
        {
          "id": <id>,
          "status": "done" | "failed",
          "commit": "<git-sha>",
          "completed_at": "<ISO-8601>"
        }
      ]
    }
  ],
  "updated_at": "<ISO-8601>"
}
```

### 4. Report to Orchestrator

Return ONLY this structured result:
```json
{
  "taskId": <id>,
  "status": "done" | "failed",
  "commit": "<git-sha>"
}
```

Do NOT return detailed implementation results. The orchestrator only needs the status.

## Prohibited

- Do NOT return detailed task results to the orchestrator
- Do NOT hold task details in conversation history
- Do NOT skip test execution
- Do NOT commit without running tests first

## Error Handling

- **Tests fail after 3 rounds**: Set task status to `failed`, return error summary
- **Git commit fails**: Return error immediately, do not update progress.json
- **progress.json write fails**: Return error immediately

## Notes

- The orchestrator's context grows by only 4 tokens per task ("task N: done")
- All detailed results are in files (git commits, test output, code changes)
- This skill ensures consistent task completion across all subagents
```

- [ ] **Step 2: Verify the skill file is valid markdown**

- [ ] **Step 3: Commit**

---

### Task 7: Integration Test — Run `/start` End-to-End

**Files:**
- No new files

- [ ] **Step 1: Set up test project**

1. Create a temporary test directory
2. Run `forge init` in it
3. Verify `.forge/progress.json` shows `status: idle`

- [ ] **Step 2: Run `/start` with a simple requirement**

Execute `/start "Add a user login feature with email and password"`

Expected behavior:
1. Feature directory created: `docs/forge/changes/user-login-feature/`
2. `progress.json` updated to `status: planning, phase: brainstorming`
3. Brainstorming questions asked
4. `proposal.md` generated
5. `scenarios.json` generated
6. `progress.json` updated to `phase: awaiting_confirmation`
7. User prompt shown with scenarios

- [ ] **Step 3: Verify state files**

1. Check `progress.json` has correct status
2. Check `scenarios.json` has valid structure
3. Check `proposal.md` exists and has content
4. Run `forge validate` to confirm all files valid

- [ ] **Step 4: Run `/next` to trigger planning**

Execute `/next`

Expected behavior:
1. `progress.json` read, status confirmed as `planning/awaiting_confirmation`
2. Writing-plans skill invoked
3. `full-plan.md` generated
4. Batches cut and written to `batch-1.md`, etc.
5. `progress.json` updated to `status: executing, current_batch: 1`
6. First task execution begins

- [ ] **Step 5: Verify batch files**

1. Check `batch-1.md` exists and has tasks
2. Check tasks have TDD steps from scenarios
3. Check batch size ≤ 6
4. Run `forge validate` to confirm

- [ ] **Step 6: Document results**

Write a brief summary of the end-to-end test results, including:
- What worked
- What failed
- Any issues found

---

### Task 8: Run Full Test Suite for Phase 1b

**Files:**
- No new files

- [ ] **Step 1: Run all forge CLI tests**

Run: `cd forge && npx vitest run`
Expected: All tests pass (67+ from Phase 1a + new tests from Phase 1b)

- [ ] **Step 2: Check test coverage**

Run: `cd forge && npx vitest run --coverage`
Expected: Coverage ≥80% for all source files

- [ ] **Step 3: Commit**

```bash
cd forge
git add .
git commit -m "chore: verify full test suite passes for Phase 1b"
```

---

## Self-Review Checklist

1. **Spec coverage:** ✅ All Phase 1b requirements covered:
   - `/start` skill: brainstorming → scenarios → human confirm ✅
   - `/next` skill: planning → batch cutting → execution ✅
   - State machine transitions (idle → planning → executing) ✅
   - `scenarios` internal skill ✅
   - `progress-tracking` internal skill ✅
   - Slug generation utility ✅
   - Batch cutting utility ✅

2. **No placeholders:** ✅ Every skill file has complete instructions, every utility has complete code

3. **Type consistency:** ✅ All types from Phase 1a reused consistently

4. **Test quality:** ✅ Tests validate actual behavior, not just "something returned"
