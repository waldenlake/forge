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

## Pre-Conditions

1. `<description>` must not be empty.
   → ERROR: "Please describe the bug. Include error messages, reproduction steps, or affected behavior."

2. Read `.forge/progress.json`:
   - `status` = `"executing"` → WARN: "Feature '<feature>' in progress. Bugfix runs separately. Continue? (yes/no)"
     - No → stop
   - `status` = `"bugfix"` → ERROR: "Another bugfix in progress. Complete it first."
   - `status` = `"idle"` or user confirmed → proceed

---

## Main Flow

### Step 1: Setup

Generate bugfix ID from description (3-5 words, hyphenated, prefixed `bugfix-`).

Create: `docs/forge/changes/bugfix-<id>/`

Write `.forge/progress.json`:
```json
{
  "version": "1.0",
  "feature": "bugfix-<id>",
  "status": "bugfix",
  "phase": "batch_execution",
  "created_at": "<ISO-8601>",
  "updated_at": "<ISO-8601>",
  "total_batches": 1,
  "current_batch": 1,
  "batches": [{ "batch": 1, "status": "in_progress", "started_at": "<ISO-8601>", "tasks": [] }],
  "verification": { "status": "pending", "test_mode": "normal", "last_run": null }
}
```

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

Write to: `docs/forge/changes/bugfix-<id>/reproduction.md`

Output:
```
    ✓ Reproduction confirmed
```

### Step 3: Generate Fix Plan

Create lightweight plan (1-3 tasks):
- Task 1: Write regression test (must FAIL on current code)
- Task 2: Fix the bug (make test PASS)
- Task 3: Verify no regressions (if fix touches shared code)

Write to: `docs/forge/changes/bugfix-<id>/fix-plan.md`

Update progress.json tasks array.

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

1. Write test reproducing the bug
2. Run test → must FAIL (confirms bug exists)
   - If passes → bug may be fixed already, investigate
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

Use Forge `progress-tracking` skill after each task.

### Step 5: Archive

1. Set batch status `"done"`
2. Move: `docs/forge/changes/bugfix-<id>/` → `docs/forge/changes/archive/<YYYY-MM-DD>-bugfix-<id>/`
3. Clean progress.json → `{ "status": "idle" }`
4. Commit: `git commit -m "chore: archive bugfix-<id> [forge done]"`

### Step 6: Output Completion

```
▸ Complete ✓
    Bug:    <short description>
    Test:   <test file path>
    Fix:    <one-line change description>
    Tests:  ✓ all passing
    Archived: docs/forge/changes/archive/<date>-bugfix-<id>/
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
