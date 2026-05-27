---
name: bugfix
description: Lightweight bug fix flow with regression test
---

# /bugfix \<description\>

Run a focused bug fix with TDD. Skips full brainstorming and planning, but
still uses Runtime commands for state, tests, commits, memory, and reset.

## Forge CLI

Before calling any Forge Runtime command, resolve the executable:

```bash
FORGE_CMD=$(command -v forge 2>/dev/null || { if [ -f "$HOME/.config/opencode/plugins/forge/cli/dist/index.js" ]; then echo "node $HOME/.config/opencode/plugins/forge/cli/dist/index.js"; else echo ".forge/bin/forge"; fi; })
```

All Runtime commands output JSON by default. Read the JSON, report blocking
errors exactly, and do not edit `.forge/*.json` directly.

## Step 0: Description Gate — do this BEFORE anything else

If the text after `/bugfix` is absent or blank:

- Output exactly:
  `Please describe the bug. Include error messages, reproduction steps, or affected behavior.`
- **STOP. Do not output the header. Do not run any CLI commands.**

Only continue past this point when a non-empty description is present.

## Output Format

Follow the Forge Skill UX Standard (`skills/SKILL-UX.md`).

**Header** (output immediately after Step 0 passes):

```
⚒ Forge  ·  /bugfix
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Progress lines**:

```
▸ Checking status…
▸ Writing regression test…
▸ Running tests…
▸ Fixing…
▸ Verifying…
```

**Error line**:

```
✘  <command>: <error from JSON>
```

**STOP block**:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏸  <reason>
▸  Next: <action>
```

## Preconditions

1. Output `▸ Checking status…`, then run `$FORGE_CMD status`.
2. If `migration_required: true`, output:

   ```
   ✘  status: migration required — run: forge migrate --from 1.0 --to 2.0
   ```

   Then STOP.

3. If a normal feature is `executing` or `planning`, output:

   ```
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ⏸  Feature "<feature>" is active (status: <status>)
   ▸  Next: confirm you want to interrupt it, or finish it first with /done
   ```

   Then STOP. Do not proceed until the user confirms.

## Flow

### 1. Confirm Reproduction

Before writing any code, confirm the reproduction is concrete. Ask for missing
details until all four are clear:

- **Starting state** — what the system looks like before the bug triggers.
- **Action** — the exact step that causes the bug.
- **Actual behavior** — what broken output or error is observed.
- **Expected behavior** — what correct output looks like.

Do not proceed to code until reproduction is confirmed.

### 2. Regression Test First

Output `▸ Writing regression test…`, then invoke the
`superpowers:test-driven-development` skill.

The regression test must **fail on current code** before any implementation
changes. Output `▸ Running tests…` and run:

```bash
$FORGE_CMD test
```

If the test passes unexpectedly (bug not reproduced by test), output:

```
✘  test: regression test passes — bug may already be fixed, or the test does not reproduce it
```

Then STOP. Do not proceed with a fix.

### 3. Track in Runtime

**If status is `executing`** (a feature is in progress and the user confirmed
continuing): run

```bash
$FORGE_CMD task:start --id <id>
```

using the task ID from the active plan.

**If status is `idle`** (standalone bugfix): do not attempt `task:start`.
The Runtime cannot track individual bugfix tasks without a registered plan.
Skip all `task:*` commands and note in the commit message that this is a
standalone bugfix.

### 4. Fix

Output `▸ Fixing…`, then implement the minimal change that makes the regression
test pass. Run:

```bash
$FORGE_CMD test
```

If tests fail, run up to 3 fix loops. Do not modify the regression test unless
it is provably testing the wrong thing — explain why if so.

After tests pass, commit:

- **Executing flow** (has task id):

  ```bash
  $FORGE_CMD commit --message "fix: <bug-description>" --tag "forge task-<id>"
  ```

  Then:

  ```bash
  $FORGE_CMD task:done --id <id>
  ```

- **Standalone flow** (idle, no task id):

  ```bash
  $FORGE_CMD commit --message "fix: <bug-description>"
  ```

### 5. Verify and Complete

Output `▸ Verifying…`, then run:

```bash
$FORGE_CMD verify --coverage
```

If verification fails, output:

```
✘  verify: <failed profile details from JSON>
```

Then STOP.

If verification passes, update memory:

```bash
$FORGE_CMD memory:complete-feature \
  --feature <bugfix-slug> \
  --date <YYYY-MM-DD> \
  --tasks "1/1" \
  --deferred "0" \
  --spec "-" \
  --plan "-" \
  --scenarios "-"
```

Then reset:

```bash
$FORGE_CMD reset --backup
```

Output the completion block:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✔  Bugfix complete: <bug-description>
   Backup: <backup_path from reset JSON>
```

## Error Handling

| Condition | Output |
|---|---|
| Empty description | `Please describe the bug. Include error messages, reproduction steps, or affected behavior.` |
| `migration_required: true` | `✘  status: migration required — run: forge migrate --from 1.0 --to 2.0` |
| Regression test passes before fix | `✘  test: regression test passes — bug may already be fixed, or the test does not reproduce it` |
| Tests still fail after 3 loops | `✘  test: still failing after 3 attempts — <failing profiles from JSON>` |
| Runtime `ok: false` | `✘  <command>: <error field from JSON>` |

## Dependencies

- **Superpowers: test-driven-development** — regression-first discipline.
- **Forge CLI Runtime** — task, test, commit, memory, and reset operations.
