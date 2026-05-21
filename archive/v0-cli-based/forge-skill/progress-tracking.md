# Forge Skill: progress-tracking (Internal)

## Trigger

Called after each task is completed by a subagent.

## Purpose

Defines the standard operations a subagent must perform after completing a task.

## Behavior

### 1. Run Unit Tests

1. Execute the test command from `.forge/config.json.test_command`
2. If tests pass -> proceed to step 2
3. If tests fail -> auto-fix (max 3 rounds):
   - Read the test error output
   - Fix the failing code
   - Re-run tests
   - If still failing after 3 rounds -> go to step 4

### 2. Git Commit

1. Stage changed files: `git add <affected-files>`
2. Commit with standard message format:
   ```
   feat: <task-title> [forge task-<id>]
   ```
3. Capture the commit SHA

### 3. Update progress.json

Read the current `progress.json`, then update the specific task:

```json
{
  "batches": [
    {
      "batch": <N>,
      "tasks": [
        {
          "id": <id>,
          "status": "done" | "failed",
          "commit": "<git-sha>",
          "completed_at": "<ISO-8601>"
        }
      ]
    }
  ],
  "updated_at": "<ISO-8601>"
}
```

### 4. Report to Orchestrator

Return ONLY this structured result:
```json
{
  "taskId": <id>,
  "status": "done" | "failed",
  "commit": "<git-sha>"
}
```

Do NOT return detailed implementation results. The orchestrator only needs the status.

## Prohibited

- Do NOT return detailed task results to the orchestrator
- Do NOT hold task details in conversation history
- Do NOT skip test execution
- Do NOT commit without running tests first

## Error Handling

- **Tests fail after 3 rounds**: Set task status to `failed`, return error summary
- **Git commit fails**: Return error immediately, do not update progress.json
- **progress.json write fails**: Return error immediately

## Notes

- The orchestrator's context grows by only 4 tokens per task ("task N: done")
- All detailed results are in files (git commits, test output, code changes)
- This skill ensures consistent task completion across all subagents
