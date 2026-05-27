---
name: done
description: Complete a feature — verify, archive, and clean up
---

# /done

Complete the current feature after Runtime verification has passed.

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

**Error line**:

```
✘  <command>: <error or blocked_by from JSON>
```

**Completion block**:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✔  Feature complete: <feature>
   Tasks:     <done>/<total>  (deferred: <N>)
   Scenarios: <archive-path>
   Spec:      <spec-path>
   Plan:      <plan-path>
   Backup:    <backup-path>
```

Omit any line where the value is unavailable (e.g. no backup path → omit
`Backup:`).

## Preconditions

1. Output the header, then `▸ Checking status…`, then run `$FORGE_CMD status`.
2. If no active feature: output `✘  status: no active feature` and STOP.
3. If status is not `verification_complete`, output:

   ```
   ✘  status: <current-status> — run /next to complete remaining execution or verification
   ```

   STOP.

4. If `verification.status` is not `passed`, output `▸ Verifying…` and run:

   ```bash
   $FORGE_CMD verify --coverage
   ```

   If it fails, output `✘  verify: <failed profile details>` and STOP.

Before changing state, capture from the status JSON:
`feature`, `completed_tasks`, `total_tasks`, `deferred_tasks`, `spec_path`,
`plan_path`. These are needed for memory and output because `phase:finish`
resets progress to idle.

## Flow

### 1. Finish the Runtime phase

Output `▸ Finishing phase…`, then run:

```bash
$FORGE_CMD phase:finish
```

If `ok` is false, output `✘  phase:finish blocked — <blocked_by>` and STOP.

### 2. Archive scenarios

Output `▸ Archiving scenarios…`, then run:

```bash
$FORGE_CMD scenarios:archive
```

If `ok` is false, output `✘  scenarios:archive: <error>` and STOP. Do not
copy files manually.

Capture `archived_to` from the JSON for use in the completion block.

### 3. Update memory

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

Use the values captured before `phase:finish`. If `ok` is false or
`verified: false`, output `✘  memory:complete-feature: <error>` and STOP.

### 4. Reset

Output `▸ Resetting…`, then always run:

```bash
$FORGE_CMD reset --backup
```

This is always the final step — not conditional. Capture `backup_path` from the
JSON for the completion block. If `ok` is false, output
`✘  reset: <error>` and STOP.

### 5. Output completion block

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✔  Feature complete: <feature>
   Tasks:     <done>/<total>  (deferred: <N>)
   Scenarios: <archived_to>
   Spec:      <spec_path>
   Plan:      <plan_path>
   Backup:    <backup_path>
```

## Error Handling

| Condition | Output |
|---|---|
| No active feature | `✘  status: no active feature` |
| Status not `verification_complete` | `✘  status: <status> — run /next first` |
| Verification fails | `✘  verify: <failed profile details>` |
| Runtime `ok: false` | `✘  <command>: <error or blocked_by>` |

## Dependencies

- **Forge CLI Runtime** — phase:finish, scenarios:archive, memory, reset.
