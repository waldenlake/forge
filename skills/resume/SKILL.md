---
name: resume
description: Resume work after session interruption
---

# /resume

Resume interrupted work. Reads state from files, locates current position,
confirms with user, then continues execution.

## First: Output Command Identifier

```
⚒ forge · /resume
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Pre-Conditions

1. Read `.forge/progress.json`
   - File missing → ERROR: "No active Forge feature found. Use `/start` to begin."
   - `status` = `"idle"` → ERROR: "No active feature. Use `/start` to begin."

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

Output:
```
▸ Status Recovery
    ✓ Feature: <feature-slug>
    ✓ Progress: batch <current>/<total>, task <done>/<all>
```

Then for each batch:
```
    Batch 1: ✓ done (<N> tasks)
    Batch 2: → in_progress
      - Task 7:  ✓ done
      - Task 8:  → in_progress (interrupted)
      - Task 9:  · pending
      - Task 10: · pending
    Batch 3: · pending (<N> tasks)
```

Then:
```
    → Next: continue Task <id> in Batch <N>
```

### Step 3: Consistency Check

For each task marked `"done"` in progress.json:
1. Look for a git commit whose message contains `[forge task-<id>]`
2. If commit found → consistent
3. If commit NOT found → inconsistency detected

If inconsistencies found, output:
```
    ⚠ Inconsistencies:
      - Task <id> "<title>": done but no commit found
```

Then ask:
```
  Options:
    1. Continue anyway (trust progress.json)
    2. Re-execute inconsistent tasks
    3. Cancel
```

Wait for user's choice:
- "1" or "Continue" → proceed, ignoring inconsistencies
- "2" or "Re-execute" → set those tasks back to "pending", then proceed
- "3" or "Cancel" → stop

If NO inconsistencies, skip this step.

### Step 4: Confirm with User

```
  Resume from this point? (yes / no / show-task)
```

- "yes" → continue execution
- "no" → stop
- "show-task" → display full task definition from batch file, then ask again

### Step 5: Continue Execution

Once confirmed, proceed as if `/next` was called:
- Current batch has pending tasks → execute them (Scenario B of next)
- Current batch done, more remain → start next batch (Scenario C)
- All batches done → verification (Scenario D)
- `verification_complete` → prompt for `/done`
- `bugfix` → continue bugfix execution

---

## Special Cases

### Resuming a Blocked Batch

If current batch status = `"blocked"`:
1. Show blocking issues from `review-batch-<N>.md`
2. Ask: "Have the blocking issues been resolved? (yes / no)"
3. Yes → set batch to `"in_progress"`, re-run code review
4. No → "Fix issues above, then run `/resume` again."

### Resuming After Verification Failure

If `verification.status` = `"failed"`:
1. Output: `    ⚠ Last verification failed. See: <report_path>`
2. Ask: "Re-run verification? (yes / no)"
3. Yes → run Scenario D of /next
4. No → stop

### Resuming With status = "planning"

- `phase` = `"brainstorming"` → "Feature mid-brainstorm. Run `/start <requirement>` to restart."
- `phase` = `"awaiting_confirmation"` → "Design ready. Review `scenarios.md`, then `/next` to proceed."

---

## Error Handling

| Condition | Response |
|-----------|----------|
| progress.json missing | "No active feature. Use `/start` to begin." |
| progress.json parse error | "progress.json corrupted. Attempting recovery from git log..." |
| CLAUDE.md missing | Warn but continue (progress.json is source of truth) |
| Batch file missing | "Batch file not found. Check `docs/forge/changes/<feature>/plans/`" |
| Git not available | Warn: "Cannot verify consistency. Proceeding with progress.json." |

---

## Recovery from Corrupted progress.json

If progress.json cannot be parsed:
1. Scan git log for `[forge task-N]` commits
2. Rebuild task completion list
3. Read CLAUDE.md for feature/batch info
4. Write reconstructed progress.json
5. Warn: "Rebuilt from git history. May be incomplete."
6. Show state, ask user to confirm before continuing
