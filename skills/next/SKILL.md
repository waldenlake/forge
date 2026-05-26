---
name: next
description: Advance the Forge workflow by exactly one step
---

# /next

Advance the Forge workflow by exactly ONE step, then STOP.

## MANDATORY RULES — no exceptions

```
- Execute exactly ONE action per /next invocation, then STOP.
- REQUIRED: Invoke superpowers:subagent-driven-development for EVERY task.
- Do NOT implement task code directly. ALL implementation goes through the subagent skill.
- Do NOT skip forge test, forge commit, or forge task:done.
- Do NOT batch multiple tasks in one /next invocation.
- When any forge command returns ok: false, STOP and report the error exactly.
```

## Forge CLI

Before calling any Forge Runtime command, resolve the executable:

```bash
FORGE_CMD=$(command -v forge 2>/dev/null || { if [ -f "$HOME/.config/opencode/plugins/forge/cli/dist/index.js" ]; then echo "node $HOME/.config/opencode/plugins/forge/cli/dist/index.js"; else echo ".forge/bin/forge"; fi; })
```

All Runtime commands output JSON by default. Read the JSON, report blocking
errors exactly, and do not edit `.forge/*.json` directly.

## Command Identifier

```text
⚒ forge · /next
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Step 1: Read State

Run:

```bash
$FORGE_CMD status
```

If `migration_required` is true, stop and tell the user to run
`forge migrate --from 1.0 --to 2.0`.

## Step 2: Dispatch ONE Action

Read the `status` field from the JSON. Execute exactly ONE action from the
table below, then STOP. Do not continue to another action.

| Status | Condition | Action | After action |
|---|---|---|---|
| `idle` | — | Output: "No active feature. Use /start first." | STOP |
| `bugfix` | — | Output: "Bugfix in progress. Complete it or cancel." | STOP |
| `planning` | `plan_path` is null | Go to **Action A: Write Plan** | STOP |
| `planning` | `plan_path` set, `total_tasks` is 0 | Go to **Action B: Register Plan** | STOP |
| `planning` | `total_tasks` > 0 | Go to **Action C: Advance to Execution** | STOP |
| `executing` | a task has status `in_progress` | Go to **Action D: Execute ONE Task** (resume it) | STOP |
| `executing` | next `pending` task exists | Go to **Action D: Execute ONE Task** (start it) | STOP |
| `executing` | all tasks `done` or `deferred` | Go to **Action E: Complete Phase** | STOP |
| `verification_complete` | verification not `passed` | Go to **Action F: Run Verification** | STOP |
| `verification_complete` | verification `passed` | Output: "Verification passed. Run /done to complete." | STOP |

---

## Action A: Write Plan

REQUIRED: Invoke the `superpowers:writing-plans` skill with:
- The design spec path from `status.spec_path`.
- The scenarios file at `.forge/scenarios.json`.
- Constraint: tasks must be small, include TDD steps, and reference scenarios.

Do NOT write the plan yourself. The skill MUST be invoked.

After the plan file is written, output:

```text
Plan written to <path>. Run /next to register it.
```

STOP. Do not continue to plan registration.

---

## Action B: Register Plan

Run:

```bash
$FORGE_CMD plan:register --plan <path>
```

If `ok` is false, report the JSON error exactly and STOP.

Output:

```text
Plan registered. <total_tasks> tasks extracted. Run /next to start execution.
```

STOP. Do not advance to execution.

---

## Action C: Advance to Execution

Run:

```bash
$FORGE_CMD phase:advance
```

If `ok` is false, report `blocked_by` exactly and STOP.

Output:

```text
Phase advanced to executing. Run /next to start the first task.
```

STOP. Do not start any task.

---

## Action D: Execute ONE Task

This action handles exactly ONE task, then STOPS.

### D.1 Start the task

If the task status is `pending`, run:

```bash
$FORGE_CMD task:start --id <id>
```

If `ok` is false, report the error and STOP.

If the task status is already `in_progress`, skip this step (resuming).

### D.2 Implement via subagent

REQUIRED: Invoke the `superpowers:subagent-driven-development` skill with:
- The task definition from the registered plan.
- Matching scenarios from `.forge/scenarios.json`.
- GitNexus impact context if available.

```
⚠ PROHIBITED: Do NOT implement the task code yourself.
⚠ PROHIBITED: Do NOT write any implementation code before invoking the skill.
⚠ PROHIBITED: Do NOT skip this skill invocation for any reason.
```

### D.3 Run tests

```bash
$FORGE_CMD test --coverage
```

If tests fail, run up to 3 fix loops. Each loop: report the failing profiles
from JSON, fix, re-run `$FORGE_CMD test --coverage`.

If still failing after 3 loops:

```bash
$FORGE_CMD task:fail --id <id> --reason "<brief reason>"
```

STOP.

### D.4 Commit

```bash
$FORGE_CMD commit --message "feat: <task-title>" --tag "forge task-<id>"
```

If `ok` is false, report the error and STOP.

### D.5 Mark done

```bash
$FORGE_CMD task:done --id <id>
```

### D.6 Handle guards

If `task:done` reports `guard_triggered: true`, run the guard action. Record:

```bash
$FORGE_CMD guard:record --type <type> --status passed --tasks <ids> --notes "<summary>"
```

If a guard fails, record `--status failed`, report blocking details, and STOP.

### D.7 Output

```text
Task <id> done. Run /next for the next task.
```

STOP. Do not start the next task.

---

## Action E: Complete Phase

Run:

```bash
$FORGE_CMD phase:complete
```

If `ok` is false, report `blocked_by` exactly and STOP.

Output:

```text
All tasks complete. Run /next to run verification.
```

STOP. Do not run verification.

---

## Action F: Run Verification

Run:

```bash
$FORGE_CMD verify --coverage
```

If verification fails, report the failed test/build JSON details exactly and
STOP.

If verification passes, output:

```text
Verification passed. Run /done to complete the feature.
```

STOP.

---

## Error Handling

| Condition | Response |
|---|---|
| Runtime command returns `ok: false` | Report the JSON error or `blocked_by` exactly and STOP. |
| Plan file cannot be created | `Plan generation failed. Check spec and scenarios.json for completeness.` |
| Tests still fail after 3 loops | Mark task failed with `task:fail`, report failing profiles, STOP. |
| Guard fails | Record with `guard:record`, report details, STOP. |

## Dependencies

- **Superpowers: writing-plans** — implementation plan generation.
- **Superpowers: subagent-driven-development** — per-task execution.
- **Superpowers: requesting-code-review** — guard action when configured.
- **Forge CLI Runtime** — phase, task, test, commit, guard, verification state.
