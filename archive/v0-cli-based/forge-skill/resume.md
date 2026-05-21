# Forge Skill: /resume

## Trigger

User runs: `/resume`

## Pre-flight Checks

1. Read `.forge/progress.json`
2. If file does not exist:
   - Output: "Forge is not initialized. Run: `forge init`"
   - Stop.
3. If `status` is `idle`:
   - Output: "No active feature to resume. Run `/start` to begin."
   - Stop.

## Behavior

### 1. State Reconstruction

1. Read `progress.json` to determine exact state
2. Run `forge resume` CLI command to generate structured summary
3. Read `CLAUDE.md` for any additional context about key decisions

### 2. Output Resume Summary

Display to user:
```
## Resume: <feature-slug>

Completed: batch 1-2 (12 tasks done)
In progress: batch 3, task 13 - Implement JWT generation
Pending: batch 4

Progress: 12/16 tasks complete

**Next action:**
Run `/next` to continue with: Implement JWT generation
```

### 3. State Inconsistency Detection

Check for inconsistencies:
- Task marked `done` but no `commit` SHA → warn user
- Task marked `in_progress` but `completed_at` exists → warn user
- `progress.json` last updated > 24 hours ago → warn about staleness

If inconsistencies found:
```
State Inconsistencies Detected:
- Task 5 marked done but no commit found. Re-execute? (y/n)
```

### 4. User Confirmation

Ask: "Resume from this point? (yes/no/view details)"

- **yes** → Update `progress.json` `updated_at`, proceed to `/next` behavior
- **no** → Stop, let user decide next action
- **view details** → Show full batch/task breakdown, then re-ask

### 5. Continue Execution

If user confirms:
1. If current task is `in_progress` → continue that task
2. If current batch is `done` but more batches → start next batch
3. If all batches `done` → trigger verification (same as `/next` State D)

## Error Handling

- **No progress.json**: "Forge is not initialized. Run: `forge init`"
- **Idle state**: "No active feature. Run `/start` to begin."
- **Corrupted progress.json**: "progress.json is corrupted. Attempting recovery from git log..."
  - Try to reconstruct from `[forge task-N]` commits
  - If recovery fails: "Recovery failed. Please provide the last known state."
- **Git log recovery partial**: "Recovered from git log. State may be incomplete. Review before continuing."

## Notes

- `/resume` is passive: it locates, reports, and asks before acting
- `/next` is active: it reads state and proceeds directly
- Always detect inconsistencies before resuming
- Never silently skip a failed task
