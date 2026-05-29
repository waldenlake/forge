---
name: forge:next
description: Status-aware router — dispatches to the phase skill matching current state
---

# /next

`/next` is a thin status router. It reads `forge status` and dispatches to
the appropriate phase skill.

The Forge workflow is split into 5 ordered phases, each owned by a dedicated
skill:

| status | Phase skill |
|--------|-------------|
| `idle` | `/start` |
| `planning` | `/planning` |
| `executing` | `/executing` |
| `execution_complete` | `/verify` |
| `verified` | `/done` |

`/next` never implements phase logic itself — it only invokes the next
skill. To skip ahead or repeat a phase, invoke the phase skill directly
by name.

## Forge CLI

Before calling any Forge Runtime command, resolve the executable:

```bash
FORGE_CMD=$(command -v forge 2>/dev/null || { if [ -f "$HOME/.config/opencode/plugins/forge/cli/dist/index.js" ]; then echo "node $HOME/.config/opencode/plugins/forge/cli/dist/index.js"; else echo ".forge/bin/forge"; fi; })
```

All Runtime commands output JSON. Read the JSON, report blocking errors
exactly, and do not edit `.forge/*.json` directly.

## Output Format

Follow `skills/SKILL-UX.md`.

**Header**:

```
⚒ Forge  ·  /next
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Flow

### Step 1: Read state

Run:

```bash
$FORGE_CMD status
```

If `migration_required: true`:

```
✘  status: migration required — run: forge migrate --from 1.0 --to 2.0
```

STOP.

If status response indicates `stale_progress: true` (pre-Phase-1 progress
state):

```
✘  status: stale progress.json — run: forge reset --backup
```

STOP.

### Step 2: Dispatch by status

| status | Action |
|--------|--------|
| `idle` | Output `▸ No active feature — invoking /start...` then invoke `/start`. |
| `planning` | Output `▸ Planning phase — invoking /planning...` then invoke `/planning`. |
| `executing` | Output `▸ Executing phase — invoking /executing...` then invoke `/executing`. |
| `execution_complete` | Output `▸ Verification phase — invoking /verify...` then invoke `/verify`. |
| `verified` | Output `▸ Ready to finish — invoking /done...` then invoke `/done`. |

The dispatched skill prints its own header — do not duplicate Forge UI
output.

### Step 3: STOP only on dispatched-skill STOP

`/next` itself does not block, gate, or accumulate output. It returns
control to whatever the dispatched skill outputs (success, STOP block,
or error line).

## Error Handling

| Condition | Output |
|---|---|
| `migration_required` | `✘ status: migration required — run: forge migrate --from 1.0 --to 2.0` |
| `stale_progress` | `✘ status: stale progress.json — run: forge reset --backup` |
| Runtime `ok: false` on status | `✘ status: <error>` |
| Unknown status enum (future Forge version) | `✘ status: unrecognised state "<value>"` |

## Dependencies

- **/start, /planning, /executing, /verify, /done** — phase skills.
- **Forge CLI Runtime** — status.
