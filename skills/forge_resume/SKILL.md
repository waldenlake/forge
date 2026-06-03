---
name: forge:resume
description: Resume work after session interruption
---

# /resume

Resume interrupted work from Runtime state and git evidence, then converge
on `forge next-action` for the next step.

## Forge CLI

Before calling any Forge Runtime command, resolve the executable:

```bash
FORGE_CMD=$(command -v forge 2>/dev/null || { if [ -f "$HOME/.config/opencode/plugins/forge/cli/dist/index.js" ]; then echo "node $HOME/.config/opencode/plugins/forge/cli/dist/index.js"; else echo ".forge/bin/forge"; fi; })
```

All Runtime commands output JSON by default. Read the JSON, report blocking
errors exactly, and do not edit `.forge/*.json` directly.

## Output Format

Follow the Forge Skill UX Standard (`skills/SKILL-UX.md`).

**Header**:

```
⚒ Forge  ·  /resume
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Status summary** (always output after reading state):

```
Feature:  <feature>
Status:   <status>
Progress: <completed>/<total> tasks done
```

**STOP block**:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏸  <reason>
▸  Next: <command>
```

**Error line**:

```
✘  <command>: <error from JSON>
```

## Flow

### 1. Read Runtime state

Output the header, then run:

```bash
$FORGE_CMD status
```

If no active feature (`status: idle`):

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏸  No active feature
▸  Next: /start <requirement>
```

STOP.

If `migration_required: true`:

```
✘  status: migration required — run: forge migrate --from 1.0 --to 2.0
```

STOP.

### 2. Audit git consistency

Run:

```bash
$FORGE_CMD audit
```

If `ok: false`, output `✘  audit: <error>` and STOP.

### 3. Check task commits

If any tasks have status `done`, run:

```bash
$FORGE_CMD commit:check --task-ids <comma-separated done task ids>
```

If commits are missing, show the missing task ids and output the STOP block:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏸  Missing commits for tasks: <ids>
▸  Next: confirm to continue anyway, or investigate with git log
```

STOP. Do not edit Runtime JSON to requeue tasks.

### 4. Output status summary

Print the status summary block:

```
Feature:  <feature>
Status:   <status>
Progress: <completed>/<total> tasks done
```

If any task has `reset_reason`, show:
`Task <id> was interrupted by /bugfix — will be fully re-executed`

Then output the confirmation prompt:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏸  Ready to resume
▸  Reply: yes to continue  ·  show-task to see task details  ·  no to stop
```

STOP. Wait for user reply.

### 5. Handle user reply

- **`yes`**: Call `forge run-loop` and dispatch its output (same logic as
  `/next` Step 2). The `/next` loop takes over from here.
- **`show-task`**: read the plan file at `status.plan_path` and display only
  the current task definition (id, title, description, TDD steps). Then repeat
  the confirmation prompt from Step 4.
- **`no`**: output `Stopped. Run /resume when ready.` and stop.

## Special Cases

| Status | Handling |
|---|---|
| `planning`, no plan yet | Summary shows "Next: write plan". After yes → call next-action |
| `planning`, plan registered | Summary shows "Next: advance to execution". After yes → call next-action |
| `executing`, guard failed | Show guard failure from audit. Output STOP block until user resolves |
| `executing`, task has `reset_reason` | Show "Task N was interrupted by /bugfix — will be fully re-executed" before the status summary |
| `verified` | Summary shows "Next: /done". Prompt accordingly |
| `execution_complete` | Summary shows "Next: /verify". Prompt accordingly |

## Error Handling

| Condition | Output |
|---|---|
| No active feature | STOP block: "No active feature — use /start" |
| `migration_required: true` | `✘  status: migration required — run: forge migrate --from 1.0 --to 2.0` |
| Runtime `ok: false` | `✘  <command>: <error>` |
| Plan file missing for show-task | `✘  plan file not found at <path>` |
| Missing task commits | STOP block listing missing task ids |
