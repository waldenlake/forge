---
name: forge:bugfix
description: Systematic bug fix with 4-phase Rigid debugging + Forge state management
---

# /bugfix \<description\>

Run a systematic bug fix integrating `systematic-debugging` methodology with
Forge state management. This skill owns the state lifecycle (interrupt/resume);
the debugging methodology is delegated to the Superpowers `systematic-debugging`
skill which executes 4 Rigid phases.

## Forge CLI

Before calling any Forge Runtime command, resolve the executable:

```bash
FORGE_CMD=$(command -v forge 2>/dev/null || { if [ -f "$HOME/.config/opencode/plugins/forge/cli/dist/index.js" ]; then echo "node $HOME/.config/opencode/plugins/forge/cli/dist/index.js"; else echo ".forge/bin/forge"; fi; })
```

All Runtime commands output JSON. Parse the JSON silently, extract only
relevant fields, and present results using SKILL-UX.md templates. NEVER
display raw JSON to the user. Do not edit `.forge/*.json` directly.

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
▸ Phase 1: Reproducing bug…
▸ Phase 2: Root-cause tracing…
▸ Phase 3: Fixing + defense-in-depth…
▸ Phase 4: Verification…
▸ Committing…
▸ Updating index…
```

## Preconditions

1. Output `▸ Checking status…`, then run `$FORGE_CMD status`.
2. If `migration_required: true`, output:

   ```
   ✘  status: migration required — run: forge migrate --from 1.0 --to 2.0
   ```

   Then STOP.

3. **If status is `executing`** (a feature is in progress):

   ```
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ⏸  Feature "<feature>" is active (status: executing)
   ▸  Next: confirm you want to interrupt it, or finish it first
   ```

   **STOP and wait for user confirmation.**

   **If the user confirms**: Find the task with status `in_progress` and run:

   ```bash
   $FORGE_CMD task:reset --id <id> --reason "interrupted by /bugfix"
   ```

   This resets the task to `pending` so `/resume` will re-execute it fully.
   Record the interrupted feature name and task id for Step 6 (restore).

4. **If status is `idle`**: proceed directly to debugging.
5. **If status is `execution_complete` or `verified`**: proceed directly — no
   tasks are in-flight that need resetting.

## Flow: systematic-debugging 4 Phases (RIGID — NO SKIPPING)

> **MANDATORY**: All 4 phases must be executed in order. Do NOT skip any phase
> regardless of perceived bug simplicity. This is the single most important
> invariant of /bugfix.

### Phase 1: Reproduce the bug

Output `▸ Phase 1: Reproducing bug…`

Invoke `superpowers:systematic-debugging` Phase 1:
- Establish a **failing test** that reliably reproduces the bug.
- The test MUST fail on current code before any fix is applied.
- If the test passes unexpectedly:
  ```
  ✘  Phase 1: reproduction test passes — bug may already be fixed or test does not reproduce it
  ```
  STOP. Do not proceed.

### Phase 2: Root-cause tracing

Output `▸ Phase 2: Root-cause tracing…`

Invoke `superpowers:systematic-debugging` Phase 2:
- Trace from symptom backwards through the call stack to the root cause.
- Must produce an explicit **root cause statement** (not just "the test fails here").
- Do NOT propose a fix yet — only identify the cause.

### Phase 3: Fix + defense-in-depth

Output `▸ Phase 3: Fixing + defense-in-depth…`

Invoke `superpowers:systematic-debugging` Phase 3:
- Fix the root cause (not the symptom).
- Add defensive measures at multiple layers to prevent recurrence of the same
  class of bug.
- Run the reproduction test — it MUST now pass.
- Run full test suite to confirm no regressions:

  ```bash
  $FORGE_CMD test --all-profiles
  ```

  If tests fail, iterate fix (up to 3 attempts). After 3 failures:
  ```
  ✘  Phase 3: tests still failing after 3 attempts
  ```
  STOP.

### Phase 4: Verification

Output `▸ Phase 4: Verification…`

Invoke `superpowers:verification-before-completion`:
- Independently verify the bug is fixed.
- Verify edge cases related to the root cause.
- Confirm the fix is minimal and does not introduce new behavior.

## Step 5: Commit

Output `▸ Committing…`, then run:

```bash
$FORGE_CMD test --all-profiles --coverage
```

Then:

```bash
$FORGE_CMD commit --message "fix: <bug-description>" --tag "<tag>"
```

**Tag selection**:
- If a feature was interrupted (Step 3 recorded a task id): `--tag "forge task-<id>"`
- Standalone bugfix (status was idle): `--tag "bugfix-<timestamp>"`

## Step 6: GitNexus index update

Output `▸ Updating index…`, then run:

```bash
gitnexus index --update
```

If `gitnexus` is not available, output `⚠ gitnexus: not available — skipping index update` and continue.

## Step 7: Restore (if feature was interrupted)

If a feature was interrupted in Step 3:

- If the bugfix was on the interrupted task itself: run `$FORGE_CMD task:start --id <id>` then `$FORGE_CMD task:done --id <id>` to mark it complete.
- Otherwise: output:

  ```
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✔  Bugfix complete: <bug-description>
  ▸  Feature "<feature>" was interrupted at task <id>
  ▸  Next: /resume to continue the feature
  ```

  STOP.

If no feature was interrupted (standalone bugfix):

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✔  Bugfix complete: <bug-description>
```

## Error Handling

| Condition | Output |
|---|---|
| Empty description | `Please describe the bug. Include error messages, reproduction steps, or affected behavior.` |
| `migration_required: true` | `✘  status: migration required — run: forge migrate --from 1.0 --to 2.0` |
| Reproduction test passes | `✘  Phase 1: reproduction test passes — bug may already be fixed or test does not reproduce it` |
| Tests still fail after 3 fix attempts | `✘  Phase 3: tests still failing after 3 attempts` |
| Runtime `ok: false` | `✘  <command>: <error field from JSON>` |

## Dependencies

- **Superpowers: systematic-debugging** — 4-phase Rigid debugging methodology.
- **Superpowers: verification-before-completion** — Phase 4 independent verification.
- **Forge CLI Runtime** — status, task:reset, test, commit, task:done.
- **GitNexus** — index update after fix (non-blocking if unavailable).
