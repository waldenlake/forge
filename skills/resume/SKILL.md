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

## Memory File

All references to "memory file" mean: read `.forge/config.json` → `memory_file`
field for the platform-appropriate filename (CLAUDE.md / AGENTS.md / GEMINI.md).

---

## Pre-Conditions

1. Read `.forge/progress.json`
   - File missing → ERROR: "No active Forge feature found. Use `/start` to begin."
   - `status` = `"idle"` → ERROR: "No active feature. Use `/start` to begin."

---

## Main Flow

### Step 1: Read State

From `.forge/progress.json`:
- `feature` — feature slug
- `status` — current status
- `tasks` — flat array with statuses
- `completed_tasks` / `total_tasks` — progress counts
- `guard_history` — guard results
- `verification` — verification state

From the memory file (`## Forge` section):
- Cross-reference Current Feature info

### Step 2: Output Location Summary

```
▸ Status Recovery
    ✓ Feature: <feature-slug>
    ✓ Progress: <completed_tasks>/<total_tasks> tasks done
```

Then list task statuses:
```
    Tasks:
      Task 1:  ✓ done
      Task 2:  ✓ done
      ...
      Task 7:  → in_progress (interrupted)
      Task 8:  · pending
      ...
```

Then guard history (if any):
```
    Guards:
      guard-1 (batch-review, tasks 1-6): ✓ passed
```

Then next action:
```
    → Next: continue Task <id> "<title>"
```

### Step 3: Consistency Check

For each task marked `"done"` in progress.json:
1. Look for git commit message containing `[forge task-<id>]`
2. If commit found → consistent
3. If commit NOT found → inconsistency

If inconsistencies found, output:
```
    ⚠ Inconsistencies detected:
      - Task <id> "<title>": done but no commit found

  Options:
    1. Continue anyway (trust progress.json)
    2. Re-execute inconsistent tasks
    3. Cancel
```

Wait for user choice:
- "1" or "Continue" → proceed
- "2" or "Re-execute" → set those tasks back to `"pending"`, then proceed
- "3" or "Cancel" → stop

### Step 4: Confirm with User

```
  Resume from Task <id>? (yes / no / show-task)
```

- "yes" → continue execution
- "no" → stop
- "show-task" → display the task definition from the plan file at `progress.json.plan_path`, then ask again

### Step 5: Continue Execution

Once confirmed, behave as if `/next` was called:
- Tasks have pending → execute (Scenario B of /next)
- All tasks done → run verification (Scenario C of /next)
- `verification_complete` → prompt for `/done`
- `bugfix` → continue bugfix execution

---

## Special Cases

### Resuming After Verification Failure

If `verification.status` = `"failed"`:
1. Output: `    ⚠ Last verification failed.`
2. Ask: "Re-run verification? (yes / no)"
3. Yes → run Scenario C of /next
4. No → stop

### Resuming With status = "planning"

- No `spec_path` set → "Feature mid-brainstorm. Run `/start <requirement>` to restart."
- No `plan_path` set, scenarios.json exists → "Design ready. Run `/next` to begin planning."

### Resuming a Feature with Failed Guard

If the latest entry in `guard_history` has `status: "failed"`:
1. Show the guard failure details
2. Ask: "Have the issues been resolved? (yes / no)"
3. Yes → re-run the guard, if passes → continue
4. No → "Fix the issues, then run `/resume` again."

---

## Error Handling

| Condition | Response |
|-----------|----------|
| progress.json missing | "No active feature. Use `/start`." |
| progress.json parse error | "progress.json corrupted. Attempting recovery from git log..." |
| memory file missing | Warn but continue (progress.json is source of truth) |
| Plan file missing | "Plan file not found at <plan_path>. Cannot show task details." |
| Git not available | Warn: "Cannot verify consistency. Proceeding with progress.json." |

---

## Recovery from Corrupted progress.json

If progress.json cannot be parsed:
1. Scan git log for `[forge task-N]` commits
2. Rebuild task completion list
3. Read memory file for feature info
4. Write reconstructed progress.json
5. Warn: "Rebuilt from git history. May be incomplete."
6. Show state, ask user to confirm before continuing
