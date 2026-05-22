---
name: progress-tracking
description: Standard operations after each task completes, with Guard triggering
---

# Progress Tracking

Internal skill. Called by `next/SKILL.md` after each subagent task completes.

## Purpose

Ensure consistent post-task operations: verify tests pass, commit changes,
update progress state, **trigger Guards if conditions met**. Keep orchestrator
context minimal.

---

## Process

### Step 1: Determine Test Command (Lazy Detection)

**Always re-detect if the cached command is empty.** This handles cases where
init ran before project files (e.g., go.mod) existed.

1. Read `.forge/config.json` → `test_command` field.
2. If non-empty AND the source file still exists (e.g., `package.json` for npm test):
   - Use that command.
3. Otherwise (empty OR source file missing), re-detect from project files:

| File | Condition | Command |
|------|-----------|---------|
| `package.json` | has `scripts.test` | `npm test` |
| `pyproject.toml` or `pytest.ini` | exists | `pytest` |
| `go.mod` | exists | `go test ./...` |
| `Cargo.toml` | exists | `cargo test` |

4. If detection succeeds:
   - Update `.forge/config.json` fields `test_command` and `test_framework`
   - Use the new command

5. If nothing detected → WARN: "No test command found. Skipping test verification."
   Proceed to Step 3 (commit without test verification).

### Step 2: Run Tests and Handle Failures

Run the test command.

**If tests PASS:** Proceed to Step 3.

**If tests FAIL:**

Auto-fix loop (max 3 rounds):

1. Read test output. Identify failing tests and why.
2. Fix the implementation code (do NOT modify tests unless clearly wrong).
3. Re-run tests.
4. If pass → break loop, proceed to Step 3.
5. If still fail → increment round counter, repeat.

**After 3 rounds still failing:**

1. Update `.forge/progress.json`:
   - Current task: `"status": "failed"`
2. Output:
   ```
   Task <id> failed after 3 fix attempts.
   Failing tests: <list>
   Error: <brief summary>
   Human intervention needed.
   ```
3. **STOP.** Do not proceed to Step 3.

### Step 3: Git Commit

```bash
git add -A
git commit -m "feat: <task-title> [forge task-<id>]"
```

Capture the resulting commit SHA.

### Step 4: Update progress.json

**SCHEMA VALIDATION:** Before updating `.forge/progress.json`, reference
`schemas/progress.schema.json`. Task status enum is strict:
`pending | in_progress | done | failed | deferred`. Writing any other value
breaks downstream skills.

Update the task entry in `progress.json.tasks`:

```json
{
  "id": <task-id>,
  "title": "<task-title>",
  "status": "done",
  "commit": "<commit-sha>",
  "completed_at": "<ISO-8601>"
}
```

Increment `progress.json.completed_tasks`.
Update root `updated_at` field.

### Step 5: Check Guards

**SCHEMA VALIDATION:** Reference `schemas/progress.schema.json` for guard_history
entry format. Guard status enum: `passed | failed | skipped`. ID pattern: `guard-N`.

Read `.forge/config.json` → `guards` object.

For each enabled guard, evaluate trigger condition:

| Guard Type | Trigger |
|------------|---------|
| `batch-review` | `completed_tasks % every_n_tasks == 0` (default every 6) |

If triggered, run the Guard's `actions` list (see Guard Actions below).

Record result in `progress.json.guard_history`:

```json
{
  "id": "guard-<sequence>",
  "type": "<guard-type>",
  "triggered_at": "<ISO-8601>",
  "task_range": [<first task id since last guard>, <last task id (current)>],
  "status": "passed" | "failed" | "skipped",
  "notes": "<brief result>"
}
```

#### Guard Actions

**`spec-compliance-review`:**

1. Use the Superpowers `requesting-code-review` skill
2. Scope: commits since last guard (or feature start if first guard)
3. Review against:
   - `.forge/scenarios.json` (spec compliance — do tasks match the scenarios they reference?)
   - Code quality (DRY, YAGNI, naming, structure)
4. Pass criteria: no blocking issues found
5. Fail criteria: any blocking issue

**`session-handoff-suggestion`:** (optional, listed in guard `actions`)

1. Use the Forge `session-handoff` skill
2. Updates memory_file with current progress
3. Suggests opening a new session (does not force)

**Guard failure handling:**

If a Guard fails:
- Set its `status` to `"failed"` with `notes` describing the issue
- Do NOT proceed to next task
- Output the failure details to the user
- Return control to `/next` which will stop execution

### Step 6: Context Discipline

**CRITICAL:** After this skill completes, the orchestrator (the session running
/next) MUST NOT retain detailed results in conversation history.

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
- Paste code snippets back to orchestrator
- Describe test results in detail
- List files that were changed

---

## Error Conditions

| Condition | Action |
|-----------|--------|
| Test command not found | Warn and skip tests. Commit anyway. |
| Git commit fails (nothing to commit) | Warn: "No changes to commit for task <id>." Mark done. |
| Git not initialized | ERROR: "Git not initialized. Cannot track progress." STOP. |
| progress.json missing | ERROR: "progress.json not found." STOP. |
| Task not found in progress.json | ERROR: "Task <id> not found in progress.json." STOP. |
| Guard action skill not available | Skip that guard, log `status: "skipped"`. Continue. |
