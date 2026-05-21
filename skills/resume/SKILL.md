---
name: resume
description: Resume work after session interruption
---

# /resume

Resume interrupted work. Reads state from files, locates current position,
confirms with user, then continues execution.

---

## Pre-Conditions

1. Read `.forge/progress.json`
   - File missing → ERROR: "No active Forge feature found. Use `/start` to begin."
   - `status` = `"idle"` → ERROR: "No active feature. Use `/start` to begin a new one."

---

## Main Flow

### Step 1: Read State

From `.forge/progress.json` extract:
- `feature` — feature slug
- `status` — current status
- `phase` — current phase
- `current_batch` — which batch we're on
- `total_batches` — total batches
- For each batch: status and task list with statuses
- `verification` — verification state

From `CLAUDE.md` (## Forge section):
- Read the Current Feature info for cross-reference

### Step 2: Output Location Summary

Display a formatted status overview:

```
Forge Resume
════════════════════════════════
Feature: <feature-slug>
Status:  <status> / <phase>

Progress: batch <current>/<total>
```

Then for each batch, show its status:

```
  Batch 1: ✅ done (<N> tasks)
  Batch 2: 🔄 in_progress
    - Task 7:  ✅ done
    - Task 8:  ⚠️  in_progress (interrupted here)
    - Task 9:  ⏳ pending
    - Task 10: ⏳ pending
  Batch 3: ⏳ pending (<N> tasks)
```

Then the recommended next action:

```
Next action: continue from Task <id> in Batch <N>
════════════════════════════════
```

### Step 3: Consistency Check

For each task marked `"done"` in progress.json:
1. Look for a git commit whose message contains `[forge task-<id>]`
2. If commit found → consistent ✓
3. If commit NOT found → inconsistency detected

If inconsistencies found, output:

```
⚠️  Inconsistencies detected:
  - Task <id> "<title>": marked done but no matching commit found
  - Task <id> "<title>": marked done but no matching commit found

Options:
  1. Continue anyway (trust progress.json)
  2. Re-execute inconsistent tasks
  3. Cancel
```

Wait for user's choice:
- "Continue" or "1" → proceed, ignoring inconsistencies
- "Re-execute" or "2" → set those tasks back to "pending" in progress.json, then proceed
- "Cancel" or "3" → stop

If NO inconsistencies, skip this step.

### Step 4: Confirm with User

```
Resume from this point? (yes / no / show-task)

  yes       → continue execution
  no        → stop (do nothing)
  show-task → display the full task definition of the next pending task
```

If user says "show-task":
- Read the task definition from the batch file
- Display it
- Ask again: "Continue? (yes / no)"

### Step 5: Continue Execution

Once user confirms, proceed as if `/next` was called:

- If current batch has pending tasks → execute them (Scenario B of next/SKILL.md)
- If current batch is done but more batches remain → start next batch (Scenario C)
- If all batches are done → run verification (Scenario D)
- If status is `"verification_complete"` → prompt for `/done`
- If status is `"bugfix"` → continue bugfix execution

---

## Special Cases

### Resuming a Blocked Batch

If the current batch has status `"blocked"` (from a code review):
1. Show the blocking issues from `review-batch-<N>.md`
2. Ask: "Have the blocking issues been resolved? (yes / no)"
3. If yes → set batch status back to `"in_progress"`, re-run code review
4. If no → "Fix the issues listed above, then run `/resume` again."

### Resuming After Verification Failure

If `verification.status` = `"failed"`:
1. Show: "Last verification failed. See report: <report_path>"
2. Ask: "Re-run verification? (yes / no)"
3. If yes → run Scenario D of /next
4. If no → stop

### Resuming With status = "planning"

If `status` = `"planning"`:
- `phase` = `"brainstorming"` → "Feature was mid-brainstorm. Run `/start <requirement>` to restart."
- `phase` = `"awaiting_confirmation"` → "Design is ready for review. Check scenarios in `docs/forge/changes/<feature>/scenarios.md`, then run `/next` to proceed."

---

## Error Handling

| Condition | Response |
|-----------|----------|
| progress.json missing | "No active feature. Use `/start` to begin." |
| progress.json parse error | "progress.json is corrupted. Attempting recovery from git log..." (then try to rebuild from `[forge task-N]` commits) |
| CLAUDE.md missing | Warn but continue (progress.json is the source of truth) |
| Batch file missing | "Batch file `batch-<N>.md` not found. Cannot read task definitions. Check `docs/forge/changes/<feature>/plans/`" |
| Git not available | Warn: "Cannot verify commit consistency (git not available). Proceeding with progress.json state." |

---

## Recovery from Corrupted progress.json

If progress.json cannot be parsed:

1. Scan git log for commits matching `[forge task-N]` pattern
2. Rebuild task completion list from commits found
3. Read CLAUDE.md for feature name and batch info
4. Write a reconstructed progress.json
5. Warn user: "Rebuilt progress.json from git history. Some information may be incomplete."
6. Show the reconstructed state and ask user to confirm before continuing
