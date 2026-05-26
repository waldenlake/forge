---
name: next
description: Confirm design and execute, or continue execution
---

# /next

Advance the Forge workflow. Behavior depends on Runtime state, not conversation
memory.

## Forge CLI

Before calling any Forge Runtime command, resolve the executable:

```bash
FORGE_CMD=$(command -v forge 2>/dev/null || echo ".forge/bin/forge")
```

All Runtime commands output JSON by default. Read the JSON, report blocking
errors exactly, and do not edit `.forge/*.json` directly.

## Command Identifier

```text
⚒ forge · /next
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Read State

Run:

```bash
$FORGE_CMD status
```

Use the returned JSON:
- `planning` -> plan registration, then execution.
- `executing` with open tasks -> execute the next task.
- `executing` with all tasks done/deferred -> verification.
- `verification_complete` -> tell the user to run `/done`.
- `idle` -> `"No active feature. Use /start first."`
- `bugfix` -> `"Bugfix in progress. Complete it or cancel."`

If `migration_required` is true, stop and tell the user to run
`forge migrate --from 1.0 --to 2.0`.

## Scenario A: Planning

Triggered when Runtime status is `planning`.

1. Use the Superpowers `writing-plans` skill with the design spec path and
   `.forge/scenarios.json`. The plan must keep tasks small, include TDD steps,
   and reference confirmed scenarios.

2. After the plan file exists, register it while Runtime is still `planning`:

   ```bash
   $FORGE_CMD plan:register --plan <path>
   ```

   Read the JSON. If task extraction fails, report the Runtime error exactly
   and stop.

3. Advance to execution:

   ```bash
   $FORGE_CMD phase:advance
   ```

   If it returns `ok: false`, report `blocked_by` exactly and stop.

4. Continue to Scenario B.

## Scenario B: Execute Tasks

For the next `pending` or `in_progress` task from Runtime state:

1. Start or resume the task:

   ```bash
   $FORGE_CMD task:start --id <id>
   ```

2. Use the Superpowers `subagent-driven-development` skill with:
   - The task definition from the registered plan.
   - Matching scenarios from `.forge/scenarios.json`.
   - GitNexus impact context if available.

3. Run tests with coverage:

   ```bash
   $FORGE_CMD test --coverage
   ```

   For user-facing summaries, say `forge test --coverage`.

4. If tests fail, run up to 3 fix loops. Each loop must report the failing
   profiles from JSON and re-run `forge test --coverage`. If still failing,
   run:

   ```bash
   $FORGE_CMD task:fail --id <id> --reason "<brief reason>"
   ```

   Then stop.

5. Commit successful task work:

   ```bash
   $FORGE_CMD commit --message "feat: <task-title>" --tag "forge task-<id>"
   ```

   For user-facing summaries, say `forge commit`.

6. Mark the task done:

   ```bash
   $FORGE_CMD task:done --id <id>
   ```

7. If the JSON reports a guard trigger, run the configured guard action. Record
   the result:

   ```bash
   $FORGE_CMD guard:record --type <type> --status passed --tasks <ids> --notes "<summary>"
   ```

   For user-facing summaries, say `guard:record`. If a guard fails, record
   `--status failed`, report the blocking details, and stop.

Record only `Task <id>: done` in long-running context.

## Scenario C: Verification

When all tasks are `done` or `deferred`:

1. Run:

   ```bash
   $FORGE_CMD phase:complete
   ```

2. Run:

   ```bash
   $FORGE_CMD verify --coverage
   ```

   For user-facing summaries, say `forge verify --coverage`.

If verification fails, report the failed test/build JSON details exactly and
stop. If it passes, tell the user to run `/done`.

## Error Handling

| Condition | Response |
|---|---|
| Runtime command returns `ok: false` | Report the JSON error or `blocked_by` exactly and stop. |
| Plan file cannot be created | `Plan generation failed. Check spec and scenarios.json for completeness.` |
| Tests still fail after 3 loops | Mark task failed with `task:fail`, report failing profiles, stop. |
| Guard fails | Record with `guard:record`, report details, stop. |

## Dependencies

- **Superpowers: writing-plans** — implementation plan generation.
- **Superpowers: subagent-driven-development** — per-task execution.
- **Superpowers: requesting-code-review** — guard action when configured.
- **Forge CLI Runtime** — phase, task, test, commit, guard, verification state.
