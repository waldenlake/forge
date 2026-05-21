---
name: progress-tracking
description: Standard operations after each task completes
---

# Progress Tracking

Internal skill. Called by `next/SKILL.md` after each subagent task completes.

## Purpose

Ensure consistent post-task operations: verify tests pass, commit changes,
update progress state. Keep orchestrator context minimal.

---

## Process

### Step 1: Determine Test Command

1. Read `.forge/config.json` → `test_command` field
2. If empty or field missing, auto-detect:

| File | Condition | Command |
|------|-----------|---------|
| `package.json` | has `scripts.test` | `npm test` |
| `pyproject.toml` or `pytest.ini` | exists | `pytest` |
| `go.mod` | exists | `go test ./...` |
| `Cargo.toml` | exists | `cargo test` |

3. If nothing detected → WARN: "No test command found. Skipping test verification."
   Proceed to Step 3 (commit without test verification).

### Step 2: Run Tests and Handle Failures

Run the test command.

**If tests PASS:** Proceed to Step 3.

**If tests FAIL:**

Auto-fix loop (maximum 3 rounds):

1. Read test output. Identify which tests fail and why.
2. Fix the implementation code.
   - Do NOT modify tests unless the test itself is clearly wrong
     (e.g., tests a behavior not in the scenario).
   - Focus on the minimal change to make tests pass.
3. Re-run the test command.
4. If tests pass → break loop, proceed to Step 3.
5. If tests still fail → increment round counter, repeat from 1.

**After 3 rounds still failing:**

1. Update `.forge/progress.json`:
   - Set current task: `"status": "failed"`
   - Set current batch: `"status": "failed"`
2. Output to orchestrator:
   > "Task <id> failed after 3 fix attempts.
   > Failing tests: <list of test names>
   > Error: <brief error summary>
   > Human intervention needed."
3. **STOP.** Do not proceed to the next task.

### Step 3: Git Commit

Stage all changes and commit:

```bash
git add -A
git commit -m "feat: <task-title> [forge task-<id>]"
```

Where:
- `<task-title>` is the task title from progress.json or the batch file
- `<id>` is the task ID number

Capture the resulting commit SHA (from `git rev-parse HEAD`).

### Step 4: Update progress.json

Read `.forge/progress.json`. Find the current task entry in the current batch.
Update it:

```json
{
  "id": <task-id>,
  "title": "<task-title>",
  "status": "done",
  "commit": "<commit-sha>",
  "completed_at": "<ISO-8601 now>"
}
```

Also update the root `updated_at` field to current timestamp.

### Step 5: Context Discipline

**CRITICAL:** After this skill completes, the orchestrator (the session
running /next) MUST NOT retain detailed results in conversation history.

The orchestrator records ONLY:
```
Task <id>: done
```

That's it. Four words maximum per task.

All details are preserved in:
- `.forge/progress.json` — status and commit reference
- Git history — actual code changes
- Test output — debugging info (transient, not stored)

Do NOT:
- Summarize what the task implemented
- Paste code snippets back to the orchestrator
- Describe test results in detail
- List files that were changed

---

## Error Conditions

| Condition | Action |
|-----------|--------|
| Test command not found and no detection possible | Warn and skip tests. Commit anyway. |
| Git commit fails (nothing to commit) | Warn: "No changes to commit for task <id>." Mark done anyway. |
| Git not initialized | ERROR: "Git not initialized. Cannot track progress." STOP. |
| progress.json missing | ERROR: "progress.json not found. Cannot update progress." STOP. |
| Task not found in progress.json | ERROR: "Task <id> not found in progress.json." STOP. |
