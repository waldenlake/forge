---
name: next
description: Advance the Forge workflow — plan, execute all tasks, verify
---

# /next

Drive the Forge workflow forward. Execute continuously until a genuine STOP
condition is met.

## Forge CLI

Before calling any Forge Runtime command, resolve the executable:

```bash
FORGE_CMD=$(command -v forge 2>/dev/null || { if [ -f "$HOME/.config/opencode/plugins/forge/cli/dist/index.js" ]; then echo "node $HOME/.config/opencode/plugins/forge/cli/dist/index.js"; else echo ".forge/bin/forge"; fi; })
```

All Runtime commands output JSON by default. Read the JSON, report blocking
errors exactly, and do not edit `.forge/*.json` directly.

## Output Format

Follow the Forge Skill UX Standard (`skills/SKILL-UX.md`).

**Header** (output at the start of every `/next` invocation):

```
⚒ Forge  ·  /next
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Per-task progress** (output before starting each task):

```
▸ [N/T] <task title>
```

**Per-task result** (output after task:done succeeds):

```
✔ Task N done
```

**STOP block** (always last, when execution pauses):

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏸  <one-line reason>
▸  Next: <exact command>
```

**Error line** (before STOP):

```
✘  <command>: <error from JSON>
```

## STOP Conditions

Execution continues until one of these is true:

| Condition | Action |
|---|---|
| Any Runtime command returns `ok: false` | Output error line, STOP |
| `guard:run` returns `ok: false` | Record failure, output error line, STOP |
| Guard type is `human-review` | Output STOP block asking human to confirm |
| Guard fails (any type) | Record failure, STOP |
| All tasks done/deferred, phase complete, verification passed | Output completion STOP block |
| Status is `idle` or `bugfix` | Output STOP block immediately |

Do NOT stop between tasks when a task completes normally.

## Step 1: Read State

Output the header, then run:

```bash
$FORGE_CMD status
```

If `migration_required: true`:

```
✘  status: migration required — run: forge migrate --from 1.0 --to 2.0
```

STOP.

## Step 2: Dispatch by Status

| Status | Condition | Action |
|---|---|---|
| `idle` | — | STOP: "No active feature. Use /start first." |
| `bugfix` | — | STOP: "Bugfix in progress. Complete it or use /bugfix." |
| `planning` | `plan_path` is null | **Action A: Write Plan** |
| `planning` | `plan_path` set, `total_tasks` is 0 | **Action B: Register Plan** |
| `planning` | `total_tasks` > 0 | **Action C: Advance to Execution** |
| `executing` | — | **Action D: Execute Tasks** (loop) |
| `verification_complete` | verification not `passed` | **Action F: Run Verification** |
| `verification_complete` | verification `passed` | STOP: "Verification passed. Run /done to complete." |

---

## Action A: Write Plan

Output `▸ Writing plan…`, then invoke the `superpowers:writing-plans` skill
with:
- The design spec path from `status.spec_path`.
- The scenarios file at `.forge/scenarios.json`.
- Constraint: tasks must be small, include TDD steps, and reference scenarios.

Do NOT write the plan yourself. The skill MUST be invoked.

After the plan file is written, output the STOP block:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏸  Plan written to <path> — review before registering
▸  Next: /next
```

STOP. Do not continue to plan registration in the same turn.

---

## Action B: Register Plan

Output `▸ Registering plan…`, then run:

```bash
$FORGE_CMD plan:register --plan <path>
```

Where `<path>` is `status.plan_path` from the current status JSON.

If `ok` is false, output `✘  plan:register: <error>` and STOP.

Output the STOP block:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏸  Plan registered  ·  <total_tasks> tasks extracted
▸  Next: /next
```

STOP. Do not advance to execution in the same turn.

---

## Action C: Advance to Execution

Output `▸ Advancing to execution…`, then run:

```bash
$FORGE_CMD phase:advance
```

If `ok` is false, output `✘  phase:advance blocked — <blocked_by>` and STOP.

Then immediately continue to **Action D: Execute Tasks** (no pause here).

---

## Action D: Execute Tasks

Loop over all pending tasks. For each task, follow steps D.1–D.5 in order.
Get the task list from the most recent `$FORGE_CMD status` response; re-read
status at the start of each loop iteration to get the current pending task.

### D.1 Start the task

Read the next task: the first task with status `in_progress`, or if none, the
first task with status `pending`.

If task status is `pending`, output `▸ [N/T] <task title>`, then run:

```bash
$FORGE_CMD task:start --id <id>
```

If `ok` is false, output `✘  task:start: <error>` and STOP.

If task status is already `in_progress`, output `▸ [N/T] <task title> (resuming)`
and skip to D.2.

### D.2 Implement via subagent

REQUIRED: invoke the `superpowers:subagent-driven-development` skill with:
- The task definition from the registered plan.
- Matching scenarios from `.forge/scenarios.json`.
- GitNexus impact context if available.

```
⚠ PROHIBITED: Do NOT implement the task code yourself.
⚠ PROHIBITED: Do NOT write any implementation code before invoking the skill.
⚠ PROHIBITED: Do NOT skip this skill invocation for any reason.
```

The subagent is fully responsible for TDD, implementation, testing, and
committing. Do NOT re-run tests or re-commit after the subagent completes.

### D.3 Mark done

Run:

```bash
$FORGE_CMD task:done --id <id>
```

If `ok` is false, output `✘  task:done: <error>` and STOP.

Output `✔ Task N done`.

### D.4 Handle guards

`task:done` returns a `guards` array. If `guard_triggered: true`:

**For each guard in the `guards` array** (process sequentially):

1. Run:

   ```bash
   $FORGE_CMD guard:run --type <guard.type> --task-id <id>
   ```

2. The response contains:
   - `executed`: deterministic inline actions (e.g. security-scan results).
   - `delegated_actions`: AI-driven actions to perform yourself (e.g.
     `spec-compliance-review` via Superpowers, `gstack-e2e` via gstack skill).

3. Perform all `delegated_actions` now. For each:
   - `spec-compliance-review` → invoke `superpowers:requesting-code-review`.
   - `gstack-e2e` / `gstack-visual` / `gstack-performance` → invoke the gstack
     skill with the appropriate type.
   - Any other action → invoke the matching Superpowers skill by name.

4. If `guard:run` returns `ok: false` **or** any `executed` action has
   `ok: false`:

   ```bash
   $FORGE_CMD guard:record \
     --type <guard.type> \
     --status failed \
     --tasks <min-id>,<max-id from guard.task_range or current task id> \
     --notes "<brief summary of failure>"
   ```

   Output:

   ```
   ✘  guard <guard.type>: failed
   ```

   STOP. Do not process remaining guards.

5. If guard type is `human-review`: output the STOP block and wait:

   ```
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ⏸  Guard: human-review — confirm or reject before continuing
   ▸  Next: confirm (then /next) or reject (then /bugfix)
   ```

   STOP. Record only after the human responds in the next turn.

6. If all actions pass, record success:

   ```bash
   $FORGE_CMD guard:record \
     --type <guard.type> \
     --status passed \
     --tasks <min-id>,<max-id from guard.task_range or current task id> \
     --notes "<brief summary>"
   ```

   Output `✔ Guard passed  ·  <guard.type>`.

   Continue to the next guard in the array.

After all guards pass, continue to D.5.

### D.5 Continue loop

Re-run `$FORGE_CMD status` to get the current task list.

- If any task has status `pending` → go back to D.1. Do not pause.
- If no `pending` tasks remain → go to **Action E: Complete Phase**.

---

## Action E: Complete Phase

Output `▸ Completing phase…`, then run:

```bash
$FORGE_CMD phase:complete
```

If `ok` is false, output `✘  phase:complete blocked — <blocked_by>` and STOP.

Then immediately continue to **Action F: Run Verification**.

---

## Action F: Run Verification

Output `▸ Verifying…`, then run:

```bash
$FORGE_CMD verify --coverage
```

If verification fails, output:

```
✘  verify: <failed test/build profile details from JSON>
```

STOP.

If verification passes, output:

```
✔ Verification passed
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏸  All tasks done and verified
▸  Next: /done
```

STOP.

---

## Error Handling

| Condition | Output |
|---|---|
| Runtime `ok: false` | `✘  <command>: <error or blocked_by from JSON>` then STOP |
| Guard fails | Record with `--status failed`, output `✘  guard <type>: failed`, STOP |
| Guard type is `human-review` | STOP block asking human to confirm |
| Plan generation fails | `✘  writing-plans: no plan produced — check spec and scenarios.json` |

## Dependencies

- **Superpowers: writing-plans** — plan generation.
- **Superpowers: subagent-driven-development** — per-task execution.
- **Superpowers: requesting-code-review** — spec-compliance-review guard action.
- **Forge CLI Runtime** — phase, task, guard, verification state.
