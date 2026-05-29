---
name: forge:done
description: Phase 5 — phase:finish + scenarios archive + memory write + reset
---

# /done

Phase 5 — finalize the feature: `phase:finish` (requires `verified` state),
scenarios archive, memory write, GitNexus final index, environment reset.

This skill assumes the feature is in `verified` state. If not, it surfaces
the blocker and stops.

## Forge CLI

Before calling any Forge Runtime command, resolve the executable:

```bash
FORGE_CMD=$(command -v forge 2>/dev/null || { if [ -f "$HOME/.config/opencode/plugins/forge/cli/dist/index.js" ]; then echo "node $HOME/.config/opencode/plugins/forge/cli/dist/index.js"; else echo ".forge/bin/forge"; fi; })
```

All Runtime commands output JSON. Read the JSON, report blocking errors
exactly, and never edit `.forge/*.json` directly.

## Output Format

Follow `skills/SKILL-UX.md`.

**Header**:

```
⚒ Forge  ·  /done
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Progress lines**:

```
▸ Checking status…
▸ Finishing phase…
▸ Archiving scenarios…
▸ Updating memory…
▸ Resetting…
```

## Preconditions

1. Run `$FORGE_CMD status`.
2. If no active feature: `✘ status: no active feature` and STOP.
3. If status is not `verified`:
   ```
   ✘ status: <status> — /done requires verified state. Use /verify first.
   ```
   STOP.

Before changing state, capture from the status JSON (these become unavailable
after `phase:finish`):
- `feature`, `progress.completed_tasks`, `progress.total_tasks`,
  `progress.deferred_tasks`, `progress.spec_path`, `progress.plan_path`.

## Flow

### Step 1: phase:finish

Output `▸ Finishing phase…`, then run:

```bash
$FORGE_CMD phase:finish
```

`phase:finish` enforces `status === verified`. It also runs the GitNexus
final index update before resetting state to idle. Failure to run
gitnexus is non-blocking.

If `ok` is false:

```
✘ phase:finish blocked — <blocked_by>
```

STOP.

### Step 2: scenarios:archive

Output `▸ Archiving scenarios…`, then run:

```bash
$FORGE_CMD scenarios:archive
```

This copies `.forge/scenarios.json` to `.forge/specs/<feature>-scenarios.json`.
Capture `archived_to` from the response. Failure → `✘ scenarios:archive: <error>` and STOP.

### Step 3: memory:complete-feature

Output `▸ Updating memory…`, then run:

```bash
$FORGE_CMD memory:complete-feature \
  --feature <feature> \
  --date <YYYY-MM-DD> \
  --tasks "<done>/<total>" \
  --deferred "<deferred_tasks>" \
  --spec <spec_path> \
  --plan <plan_path> \
  --scenarios <archived_to>
```

Use the values captured in Preconditions. If `ok: false` or `verified: false`,
output `✘ memory:complete-feature: <error>` and STOP.

### Step 4: reset --backup

Output `▸ Resetting…`, then run:

```bash
$FORGE_CMD reset --backup
```

This is always the final step. Capture `backup_path` for the completion
block. Failure → `✘ reset: <error>` and STOP.

### Step 5: Completion block

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✔  Feature complete: <feature>
   Tasks:     <done>/<total>  (deferred: <N>)
   Scenarios: <archived_to>
   Spec:      <spec_path>
   Plan:      <plan_path>
   Backup:    <backup_path>
```

Omit any line where the value is unavailable.

## Error Handling

| Condition | Output |
|---|---|
| No active feature | `✘ status: no active feature` |
| Status not `verified` | `✘ status: <status> — /done requires verified state. Use /verify first.` |
| Runtime `ok: false` | `✘ <command>: <error or blocked_by from JSON>` |

## Dependencies

- **Forge CLI Runtime** — status, phase:finish (auto-runs gitnexus update),
  scenarios:archive, memory:complete-feature, reset.
