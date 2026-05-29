---
name: forge:session-handoff
description: Prepare cross-session recovery (used by Guard `session-handoff-suggestion` action)
---

# Session Handoff

Prepare a new session to resume work without relying on conversation history.

## Forge CLI

Before calling any Forge Runtime command, resolve the executable:

```bash
FORGE_CMD=$(command -v forge 2>/dev/null || { if [ -f "$HOME/.config/opencode/plugins/forge/cli/dist/index.js" ]; then echo "node $HOME/.config/opencode/plugins/forge/cli/dist/index.js"; else echo ".forge/bin/forge"; fi; })
```

All Runtime commands output JSON by default. Read the JSON, report blocking
errors exactly, and do not edit `.forge/*.json` directly.

## Process

1. Read current state:

   ```bash
   $FORGE_CMD status
   ```

   If there is no active feature, report that there is nothing to hand off.

2. Identify the next task from Runtime JSON:
   - First `in_progress` task, if present.
   - Otherwise first `pending` task.
   - If all tasks are complete, use `next-task-id` as `0` and title
     `verification`.

3. Write the memory handoff through Runtime:

   ```bash
   $FORGE_CMD memory:set-feature --feature <feature> --progress "<completed>/<total> tasks done" --next-task-id <id> --next-task-title "<title>"
   ```

   If JSON returns `verified: false`, report it exactly and stop.

4. Output:

   ```text
   Progress: <completed>/<total> tasks done

   Recommended next command in a fresh session:
     /resume

   Continue here:
     /next
   ```

5. Stop. Wait for the user to resume or continue.

## Error Handling

| Condition | Response |
|---|---|
| Runtime command returns `ok: false` | Report JSON error exactly and stop. |
| Memory verification fails | Report `verified: false` and the memory file path exactly. |
| Migration required | Tell the user to run `forge migrate --from 1.0 --to 2.0`. |

## Why New Sessions

Long execution runs accumulate context. A fresh session can recover from the
memory file plus Runtime state, while the Runtime remains the source of truth.
