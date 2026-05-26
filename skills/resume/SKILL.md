---
name: resume
description: Resume work after session interruption
---

# /resume

Resume interrupted work from Runtime state and git evidence.

## Forge CLI

Before calling any Forge Runtime command, resolve the executable:

```bash
FORGE_CMD=$(command -v forge 2>/dev/null || { if [ -f "$HOME/.config/opencode/plugins/forge/cli/dist/index.js" ]; then echo "node $HOME/.config/opencode/plugins/forge/cli/dist/index.js"; else echo ".forge/bin/forge"; fi; })
```

All Runtime commands output JSON by default. Read the JSON, report blocking
errors exactly, and do not edit `.forge/*.json` directly.

## Command Identifier

```text
⚒ forge · /resume
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Flow

1. Read Runtime state:

   ```bash
   $FORGE_CMD status
   ```

   If no active feature exists, output `"No active feature. Use /start."` and
   stop. If migration is required, tell the user to run
   `forge migrate --from 1.0 --to 2.0` and stop.

2. Audit git consistency:

   ```bash
   $FORGE_CMD audit
   ```

   If audit reports `ok: false`, report the JSON error exactly and stop.

3. If there are done tasks, check their task commits:

   ```bash
   $FORGE_CMD commit:check --task-ids <ids>
   ```

   If commits are missing, show the missing task ids and ask the user whether to
   continue anyway or stop. Do not edit Runtime JSON to requeue tasks.

4. Print a concise location summary:
   - Feature slug.
   - Status.
   - Completed/total tasks.
   - In-progress or next pending task.
   - Guard failures/skips from audit, if any.

5. Ask:

   ```text
   Resume from Task <id>? (yes / no / show-task)
   ```

   On `yes`, continue as `/next`. On `show-task`, read the plan file and display
   only that task definition, then ask again.

## Special Cases

- `planning` with scenarios ready: tell the user `/next` will register the plan.
- `executing` with failed guard: show audit guard details and stop until the
  user confirms the issue is resolved.
- `verification_complete`: tell the user to run `/done`.
- `bugfix`: continue using `/bugfix` rules.

## Error Handling

| Condition | Response |
|---|---|
| Runtime command returns `ok: false` | Report JSON error exactly and stop. |
| Plan file missing | `Plan file not found at <path>. Cannot show task details.` |
| Missing task commits | Ask user whether to continue; do not mutate state directly. |
| Migration required | Tell the user to run `forge migrate --from 1.0 --to 2.0`. |
