---
name: bugfix
description: Lightweight bug fix flow with regression test
---

# /bugfix <description>

Streamlined bug fix process. Skips full brainstorming/planning — goes straight
from description to fix using TDD (regression test first).

---

## Pre-Conditions

1. `<description>` must not be empty.
   - Empty → ERROR: "Please describe the bug. Include error messages, reproduction steps, or affected behavior."

2. Read `.forge/progress.json` (create if missing with idle state):
   - `status` = `"executing"` → WARN:
     > "Feature '<feature>' is in progress. Bugfix will run separately. Continue? (yes/no)"
     > If no → stop
   - `status` = `"bugfix"` → ERROR: "Another bugfix is already in progress. Complete it first."
   - `status` = `"idle"` or user confirmed → proceed

---

## Main Flow

### Step 1: Generate Bugfix ID

Create a short slug from the description:
- Take first 3-5 meaningful words
- Lowercase, hyphenate
- Prefix with `bugfix-`
- Example: "login fails with special characters" → `bugfix-login-special-chars`

### Step 2: Create Bugfix Directory

```
docs/forge/changes/bugfix-<id>/
```

### Step 3: Update progress.json

Write (or update) `.forge/progress.json`:

```json
{
  "version": "1.0",
  "feature": "bugfix-<id>",
  "status": "bugfix",
  "phase": "batch_execution",
  "created_at": "<ISO-8601 now>",
  "updated_at": "<ISO-8601 now>",
  "total_batches": 1,
  "current_batch": 1,
  "batches": [
    {
      "batch": 1,
      "status": "in_progress",
      "started_at": "<ISO-8601 now>",
      "tasks": []
    }
  ],
  "verification": {
    "status": "pending",
    "test_mode": "normal",
    "last_run": null
  }
}
```

Note: tasks array starts empty — populated after plan is generated in Step 5.

### Step 4: Clarify Reproduction

Evaluate the description. If it lacks concrete reproduction steps:

Ask the user:
> "To write an effective regression test, I need concrete reproduction steps:
> 1. What is the starting state? (e.g., logged in user, specific page)
> 2. What action triggers the bug? (e.g., click button, submit form, API call)
> 3. What happens? (the actual broken behavior)
> 4. What should happen instead? (the expected correct behavior)
> 
> Please provide these details."

Keep asking until you have:
- A clear starting state
- A specific trigger action
- Observable incorrect behavior
- Expected correct behavior

Write reproduction details to:
```
docs/forge/changes/bugfix-<id>/reproduction.md
```

Format:
```markdown
# Bug Reproduction: <short description>

## Starting State
<state description>

## Steps to Reproduce
1. <step 1>
2. <step 2>
3. ...

## Actual Behavior
<what happens — the bug>

## Expected Behavior
<what should happen — the fix target>

## Additional Context
<error messages, logs, screenshots referenced>
```

### Step 5: Generate Fix Plan

Create a lightweight plan (1-3 tasks maximum):

**Task 1: Write regression test**
- Convert reproduction steps into a failing test
- The test MUST fail on the current code (proves bug exists)
- Test should be minimal — only test the specific broken behavior

**Task 2: Fix the bug**
- Implement the minimal fix to make the regression test pass
- Do NOT refactor or change unrelated code
- Do NOT add features — only fix the specific bug

**Task 3 (only if needed): Verify no regressions**
- Only include this task if the fix touches shared/critical code
- Run full test suite and verify nothing else broke

Write plan to: `docs/forge/changes/bugfix-<id>/fix-plan.md`

Update progress.json tasks:
```json
{
  "tasks": [
    { "id": 1, "title": "Write regression test", "status": "pending" },
    { "id": 2, "title": "Fix the bug", "status": "pending" },
    { "id": 3, "title": "Verify no regressions", "status": "pending" }
  ]
}
```

### Step 6: Execute Fix (TDD)

For each task in order:

**Task 1 — Regression Test:**
1. Write a test that reproduces the bug
2. Run the test → it MUST FAIL
   - If it passes → the bug may already be fixed or the test is wrong
   - Investigate and adjust
3. Commit: `git commit -m "test: add regression test for <bug> [forge task-1]"`
4. Update progress.json: task 1 done

**Task 2 — Fix:**
1. Implement the minimal fix
2. Run the regression test → it MUST PASS now
3. Run the full test suite → all tests must pass
   - If other tests break → fix them (the fix introduced a regression)
4. Commit: `git commit -m "fix: <bug-description> [forge task-2]"`
5. Update progress.json: task 2 done

**Task 3 — Verify (if included):**
1. Run full test suite
2. All pass → commit and mark done
3. Something fails → investigate and fix
4. Commit: `git commit -m "test: verify no regressions from bugfix [forge task-3]"`
5. Update progress.json: task 3 done

Use the Forge `progress-tracking` skill after each task for consistent
commit and state management.

### Step 7: Archive

After all tasks complete:

1. Set batch status to `"done"` in progress.json

2. Move bugfix directory to archive:
   ```bash
   mkdir -p docs/forge/changes/archive/
   mv docs/forge/changes/bugfix-<id>/ docs/forge/changes/archive/<YYYY-MM-DD>-bugfix-<id>/
   ```

3. Clean progress.json → `{ "status": "idle" }` (full idle state)

4. Git commit:
   ```bash
   git add -A
   git commit -m "chore: archive bugfix-<id> [forge done]"
   ```

### Step 8: Output Summary

```
Bugfix Complete
════════════════════════════════
Bug:             <short description>
Regression test: <test file path>
Fix:             <one-line description of the change>
Tests passing:   ✅ all
Archived:        docs/forge/changes/archive/<date>-bugfix-<id>/
════════════════════════════════
```

---

## Error Handling

| Condition | Response |
|-----------|----------|
| Empty description | "Please describe the bug." |
| Regression test passes (bug not reproducible) | "Test passes — bug may already be fixed. Verify manually and close if resolved." |
| Fix breaks other tests (after 3 attempts) | "Fix introduces regressions that cannot be auto-resolved. Human intervention needed." STOP. |
| Cannot determine test file location | Ask user: "Where should the regression test be placed?" |

---

## Dependencies

This skill uses:
- **Superpowers: test-driven-development** — for TDD discipline during fix
- **Forge: progress-tracking** — for post-task state management
