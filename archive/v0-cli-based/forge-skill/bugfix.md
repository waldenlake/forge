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
   - Output: "There is already an active feature: `{feature}`. Complete it with `/done` or cancel before starting a bugfix."
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
   - `path/to/file1.ts` - <description>
   - `path/to/file2.ts` - <description>

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

The regression test is now part of the permanent test suite. Document it.

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

Bug: <description>
Fix: <brief description>
Regression test: added to test suite
Archived: docs/forge/changes/archive/<date>-<bugfix-id>/
```

## Error Handling

- **Bug not reproducible**: "Cannot reproduce the bug with the given steps. Please provide more detail or verify the environment."
- **Fix breaks other tests**: "Fix caused regressions in <N> tests. Re-evaluate the fix approach."
- **Root cause unclear**: "Root cause analysis inconclusive. More investigation needed. Continue? (yes/no)"
- **Another feature in progress**: "There is already an active feature. Complete it first."

## Notes

- `/bugfix` skips full planning — it's a lightweight flow
- Always write regression test FIRST (TDD)
- Always verify reproduction steps no longer trigger the bug
- Blast radius analysis is critical — don't introduce new bugs
