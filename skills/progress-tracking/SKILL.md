---
name: progress-tracking
description: Standard operations after each task completes, with Guard triggering
---

# Progress Tracking

Compatibility helper for older Forge skill flows. New orchestrators should call
the CLI commands directly, but this skill can still perform the post-task loop
without mutating state by hand.

## Forge CLI

Before calling any Forge Runtime command, resolve the executable:

```bash
FORGE_CMD=$(command -v forge 2>/dev/null || { if [ -f "$HOME/.config/opencode/plugins/forge/cli/dist/index.js" ]; then echo "node $HOME/.config/opencode/plugins/forge/cli/dist/index.js"; else echo ".forge/bin/forge"; fi; })
```

All Runtime commands output JSON by default. Read the JSON, report blocking
errors exactly, and do not edit `.forge/*.json` directly.

## Inputs

The caller must provide:
- Task id.
- Task title.
- Whether implementation is ready for verification.
- Any guard type/tasks returned by `task:done`, if already known.

If task id or title is missing, stop and ask the caller for it.

## Process

1. Confirm Runtime state:

   ```bash
   $FORGE_CMD status
   ```

   If not `executing`, report the status JSON and stop.

2. Ensure the task is in progress:

   ```bash
   $FORGE_CMD task:start --id <id>
   ```

3. Run tests:

   ```bash
   $FORGE_CMD test --coverage
   ```

4. If tests fail, run up to 3 fix loops. Re-run `forge test --coverage` after
   each fix. If still failing, run:

   ```bash
   $FORGE_CMD task:fail --id <id> --reason "<brief reason>"
   ```

   Report the failing JSON exactly and stop.

5. Commit:

   ```bash
   $FORGE_CMD commit --message "feat: <task-title>" --tag "forge task-<id>"
   ```

   If Runtime reports no changes, report that error exactly; do not mark the
   task done unless the caller explicitly confirms the no-op is expected.

6. Mark done:

   ```bash
   $FORGE_CMD task:done --id <id>
   ```

7. If `task:done` reports a guard trigger, run the guard action and record it:

   ```bash
   $FORGE_CMD guard:record --type <type> --status passed --tasks <ids> --notes "<summary>"
   ```

   Use `--status failed` for blocking guard findings and stop.

## Context Discipline

After success, return only:

```text
Task <id>: done
```

Detailed state belongs in Runtime JSON and git history, not the conversation.

## Error Handling

| Condition | Action |
|---|---|
| Runtime command returns `ok: false` | Report the JSON error exactly and stop. |
| Tests fail after 3 loops | Record `task:fail`, report failing profiles, stop. |
| Guard action unavailable | Record `guard:record --status skipped` with notes, then continue only if non-blocking. |
| Commit fails | Report Runtime JSON exactly; do not silently continue. |
