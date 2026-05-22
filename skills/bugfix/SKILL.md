---
name: bugfix
description: Lightweight bug fix flow with regression test
---

# /bugfix <description>

Streamlined bug fix process. Skips full brainstorming/planning — goes straight
from description to fix using TDD (regression test first).

## First: Output Command Identifier

```
⚒ forge · /bugfix
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Memory File

All references to "memory file" mean: read `.forge/config.json` → `memory_file`
field for the platform-appropriate filename.

---

## Pre-Conditions

1. `<description>` must not be empty.
   → ERROR: "Please describe the bug. Include error messages, reproduction steps, or affected behavior."

2. Read `.forge/progress.json` (create if missing with idle state):
   - `status` = `"executing"` → WARN: "Feature '<feature>' in progress. Bugfix runs separately. Continue? (yes/no)"
     - No → stop
   - `status` = `"bugfix"` → ERROR: "Another bugfix in progress. Complete it first."
   - `status` = `"idle"` or user confirmed → proceed

---

## Main Flow

**SCHEMA VALIDATION:** progress.json writes must conform to
`schemas/progress.schema.json`. Use status `bugfix` for bug fix sessions.
Task status enum: `pending | in_progress | done | failed | deferred`.

### Step 1: Setup

Generate bugfix ID from description (3-5 words, hyphenated, prefixed `bugfix-`).

Write `.forge/progress.json`:

```json
{
  "version": "1.0",
  "feature": "bugfix-<id>",
  "status": "bugfix",
  "created_at": "<ISO-8601>",
  "updated_at": "<ISO-8601>",
  "spec_path": null,
  "plan_path": null,
  "total_tasks": 0,
  "completed_tasks": 0,
  "tasks": [],
  "guard_history": [],
  "verification": { "status": "pending", "test_mode": "normal", "last_run": null }
}
```

Note: bugfix doesn't use Superpowers brainstorming/writing-plans, so `spec_path`
and `plan_path` remain null.

### Step 2: Bug Analysis

Output:
```
▸ Phase 1 · Bug Analysis
    → Clarifying reproduction steps...
```

If description lacks concrete steps, ask:
```
  To write a regression test, I need:
  1. Starting state (e.g., logged in, specific page)
  2. Action that triggers the bug
  3. What happens (actual broken behavior)
  4. What should happen (expected behavior)
```

Keep asking until reproduction is concrete.

(Optional) Write reproduction details to `.forge/bugfix-<id>-reproduction.md`
for later reference.

Output:
```
    ✓ Reproduction confirmed
```

### Step 3: Generate Fix Plan

Create lightweight plan (1-3 tasks):
- Task 1: Write regression test (must FAIL on current code)
- Task 2: Fix the bug (make test PASS)
- Task 3: Verify no regressions (only if fix touches shared code)

Update progress.json:

```json
{
  "total_tasks": <N>,
  "tasks": [
    { "id": 1, "title": "Write regression test", "status": "pending" },
    { "id": 2, "title": "Fix the bug", "status": "pending" }
  ]
}
```

Output:
```
    ✓ Fix plan: <N> tasks
```

### Step 4: Execute Fix (TDD)

Output:
```
▸ Phase 2 · Fix (TDD)
```

**Task 1 — Regression Test:**

Output: `    → Task 1: Write regression test...`

1. Write a test reproducing the bug
2. Run test → must FAIL (confirms bug exists)
   - If passes → bug may be fixed, investigate
3. Commit: `git commit -m "test: regression test for <bug> [forge task-1]"`

Output: `    ✓ Task 1: regression test fails (bug confirmed)`

**Task 2 — Fix:**

Output: `    → Task 2: Implement fix...`

1. Implement minimal fix
2. Run regression test → must PASS now
3. Run full test suite → all must pass
   - If other tests break → fix (max 3 rounds)
4. Commit: `git commit -m "fix: <bug-description> [forge task-2]"`

Output: `    ✓ Task 2: test passes (bug fixed)`

**Task 3 — Verify (if included):**

Output: `    → Task 3: Verify no regressions...`

1. Run full test suite
2. All pass → commit
3. Something fails → fix (max 3 rounds)

Output: `    ✓ Task 3: all tests passing`

Use the Forge `progress-tracking` skill after each task for consistent
commit and state management. (Bugfix typically doesn't need Guards since
it's only 1-3 tasks, but the `progress-tracking` skill will check anyway.)

### Step 5: Update Memory File

Add to memory file's `**Completed Features**` section:

```markdown
- bugfix-<id> (<YYYY-MM-DD>)
  - Bug: <short description>
  - Fix: <one-line change description>
  - Regression test: <test file path>
```

### Step 6: Clean progress.json

Reset to idle:
```json
{ "status": "idle", ... }
```

### Step 7: Git Commit

```bash
git add -A
git commit -m "chore: complete bugfix-<id> [forge done]"
```

### Step 8: Output Completion

```
▸ Complete ✓
    Bug:    <short description>
    Test:   <test file path>
    Fix:    <one-line change description>
    Tests:  ✓ all passing
```

---

## Error Handling

| Condition | Response |
|-----------|----------|
| Empty description | "Please describe the bug." |
| Regression test passes unexpectedly | "Test passes — bug may be fixed. Verify manually." |
| Fix breaks other tests (3 attempts) | "Fix introduces regressions. Human intervention needed." STOP. |
| Cannot determine test location | Ask: "Where should the regression test go?" |

---

## Dependencies

- **Superpowers: test-driven-development** — TDD discipline
- **Forge: progress-tracking** — post-task state management
