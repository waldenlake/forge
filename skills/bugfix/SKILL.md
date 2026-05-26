---
name: bugfix
description: Lightweight bug fix flow with regression test
---

# /bugfix <description>

Run a focused bug fix with TDD. This skips full brainstorming/planning, but it
still uses Runtime commands for state, tests, commits, memory, and reset.

## Forge CLI

Before calling any Forge Runtime command, resolve the executable:

```bash
FORGE_CMD=$(command -v forge 2>/dev/null || echo ".forge/bin/forge")
```

All Runtime commands output JSON by default. Read the JSON, report blocking
errors exactly, and do not edit `.forge/*.json` directly.

## Command Identifier

```text
⚒ forge · /bugfix
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Preconditions

1. If `<description>` is empty, output
   `"Please describe the bug. Include error messages, reproduction steps, or affected behavior."`
   and stop.
2. Run `$FORGE_CMD status`.
3. If migration is required, tell the user to run
   `forge migrate --from 1.0 --to 2.0` and stop.
4. If a normal feature is active, ask before starting bugfix work.

## Flow

### 1. Confirm Reproduction

Ask for missing details until the reproduction is concrete:
- Starting state.
- Action.
- Actual broken behavior.
- Expected behavior.

Use the Superpowers `test-driven-development` skill. The regression test must
fail on current code before implementation changes.

### 2. Start Runtime Task

Use `forge task:*` commands only when Runtime is already in an executing task
flow. For a standalone bugfix, create the smallest tracked work item supported
by current Runtime state; if Runtime cannot represent it yet, report that limit
instead of editing `.forge/*.json`.

When a task id is available:

```bash
$FORGE_CMD task:start --id <id>
```

### 3. Red

Write the regression test and run:

```bash
$FORGE_CMD test
```

The test must fail for the expected reason. If it passes, stop and report that
the bug may already be fixed or the reproduction is wrong.

Commit the regression test when appropriate:

```bash
$FORGE_CMD commit --message "test: regression test for <bug>" --tag "forge task-<id>"
```

For user-facing summaries, say `forge commit`.

### 4. Green

Implement the minimal fix. Run:

```bash
$FORGE_CMD test
```

If failures remain, use up to 3 fix loops. Do not change the regression test
unless it is demonstrably wrong and you explain why.

Commit the fix:

```bash
$FORGE_CMD commit --message "fix: <bug>" --tag "forge task-<id>"
```

Then mark the task done:

```bash
$FORGE_CMD task:done --id <id>
```

If the task cannot be represented in Runtime yet, report the limitation and do
not pretend state was updated.

### 5. Complete

Run final verification:

```bash
$FORGE_CMD verify --coverage
```

If it passes, update memory and reset only through Runtime:

```bash
$FORGE_CMD memory:complete-feature --feature <bugfix-id> --date <YYYY-MM-DD> --tasks "<done>/<total>" --deferred "0" --spec "-" --plan "-" --scenarios "-"
$FORGE_CMD reset --backup
```

For user-facing summaries, say `forge memory:complete-feature` and
`forge reset`.

## Error Handling

| Condition | Response |
|---|---|
| Regression test passes unexpectedly | Stop and report that reproduction is not proving the bug. |
| Tests fail after 3 loops | Report failing JSON exactly and stop. |
| Runtime cannot represent standalone bugfix tasks | State the limitation explicitly; do not edit state files. |
| Runtime command returns `ok: false` | Report JSON error exactly and stop. |

## Dependencies

- **Superpowers: test-driven-development** — regression-first discipline.
- **Forge CLI Runtime** — task, test, commit, memory, and reset operations.
