---
name: done
description: Complete a feature — verify, archive, and clean up
---

# /done

Complete the current feature after Runtime verification has passed. The CLI
owns state changes; this skill only coordinates commands and user messaging.

## Forge CLI

Before calling any Forge Runtime command, resolve the executable:

```bash
FORGE_CMD=$(command -v forge 2>/dev/null || echo ".forge/bin/forge")
```

All Runtime commands output JSON by default. Read the JSON, report blocking
errors exactly, and do not edit `.forge/*.json` directly.

## Command Identifier

```text
⚒ forge · /done
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Preconditions

1. Run `$FORGE_CMD status`.
2. If there is no active feature, report `"No active feature."` and stop.
3. If status is not `verification_complete`, tell the user to run `/next` for
   remaining execution or verification.
4. If verification is not passed, run `forge verify --coverage` through:

   ```bash
   $FORGE_CMD verify --coverage
   ```

   If it fails, report the JSON details exactly and stop.

## Flow

Before changing state, capture the feature slug, task counts, deferred count,
spec path, plan path, and scenario archive path from the `status` JSON. Current
Runtime `phase:finish` resets active progress to idle, so later commands must
use these captured values when their interfaces support explicit metadata.

1. Finish the Runtime phase:

   ```bash
   $FORGE_CMD phase:finish
   ```

   For user-facing summaries, say `phase:finish`. If blocked, report
   `blocked_by` exactly and stop.

2. Archive scenarios:

   ```bash
   $FORGE_CMD scenarios:archive
   ```

   Use captured feature metadata if Runtime supports it. If the command is
   blocked because `phase:finish` reset state to idle, report the Runtime JSON
   exactly. Do not copy files manually.

3. Update memory with captured metadata:

   ```bash
   $FORGE_CMD memory:complete-feature --feature <feature> --date <YYYY-MM-DD> --tasks "<done>/<total>" --deferred "<count>" --spec <path> --plan <path> --scenarios <path>
   ```

   If `verified` is false, report the memory file error exactly and stop.

4. Run the backup reset fallback only when Runtime reports a later cleanup or
   archive step was blocked by the state reset:

   ```bash
   $FORGE_CMD reset --backup
   ```

   For user-facing summaries, say `reset --backup`. Report `backup_path` if the
   JSON includes it. Do not run this fallback silently; explain the blocking
   Runtime JSON that made it necessary.

5. Optionally commit completion artifacts only if the user asks. This skill does
   not auto-commit.

## Output

```text
▸ Complete
Feature: <feature>
Tasks: <done>/<total>
Deferred: <count>
Scenarios: <archive path>
Spec: <spec path>
Plan: <plan path>
Backup: <backup path>
```

## Error Handling

| Condition | Response |
|---|---|
| Runtime command returns `ok: false` | Report JSON `error` or `blocked_by` exactly and stop. |
| Verification failed | Report failed test/build profiles and stop. |
| Memory verification failed | Report the Runtime JSON exactly and stop. |
| Reset backup fails | Report the Runtime JSON exactly; do not claim completion. |
