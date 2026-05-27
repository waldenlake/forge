---
name: next
description: Advance the Forge workflow by exactly one step
---

# /next

Drive the Forge workflow forward. Execute continuously until a genuine STOP condition is met.

## STOP Conditions — only these pause execution

```
- Any forge command returns ok: false → STOP and report error exactly.
- guard:run returns ok: false (guard failed) → record failure, STOP.
- guard type is human-review → STOP and ask the human to confirm.
- All tasks are done/deferred and phase:complete + verify finish → STOP (run /done).
- Status is idle or bugfix → STOP (nothing to execute).
```

Do NOT stop between tasks. After one task completes normally, immediately start the next.

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

## Step 2: Dispatch by Status

Read the `status` field from the JSON. Execute the matching action.

| Status | Condition | Action |
|---|---|---|
| `idle` | — | Output: "No active feature. Use /start first." STOP |
| `bugfix` | — | Output: "Bugfix in progress. Complete it or cancel." STOP |
| `planning` | `plan_path` is null | Go to **Action A: Write Plan** |
| `planning` | `plan_path` set, `total_tasks` is 0 | Go to **Action B: Register Plan** |
| `planning` | `total_tasks` > 0 | Go to **Action C: Advance to Execution** |
| `executing` | — | Go to **Action D: Execute Tasks** (loop) |
| `verification_complete` | verification not `passed` | Go to **Action F: Run Verification** |
| `verification_complete` | verification `passed` | Output: "Verification passed. Run /done to complete." STOP |

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
Phase advanced to executing. Starting first task now.
```

Then immediately continue to **Action D: Execute Tasks**.

---

## Action D: Execute Tasks

This action loops over all pending tasks. For each task:

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

The subagent is fully responsible for TDD, implementation, testing, and committing.
Do NOT re-run tests or re-commit after the subagent completes.

### D.3 Mark done

```bash
$FORGE_CMD task:done --id <id>
```

If `ok` is false, report the error and STOP.

### D.4 Handle guards

If `task:done` reports `guard_triggered: true`, run the guard:

```bash
$FORGE_CMD guard:run --type <type> --task-id <id>
```

The Runtime returns two categories of actions:
- `executed`: deterministic actions run inline (e.g. scanners)
- `delegated_actions`: AI-driven actions you must perform yourself
  (e.g. `spec-compliance-review` via the relevant Superpowers skill,
  `gstack-e2e`/`gstack-visual`/`gstack-performance` via the gstack skill)

If `guard:run` returns `ok: false`, record the failure and STOP:

```bash
$FORGE_CMD guard:record --type <type> --status failed --tasks <ids> --notes "<summary>"
```

If guard type is `human-review`: record the result after the human confirms, then STOP.

After all `delegated_actions` complete and inline `executed` actions are
`ok: true`, record success:

```bash
$FORGE_CMD guard:record --type <type> --status passed --tasks <ids> --notes "<summary>"
```

If guard passes, continue to D.5.

### D.5 Continue loop

Check if another `pending` task exists:

- **Yes** → go back to D.1 with the next pending task. Do not pause.
- **No** → go to **Action E: Complete Phase**.

---

## Action E: Complete Phase

Run:

```bash
$FORGE_CMD phase:complete
```

If `ok` is false, report `blocked_by` exactly and STOP.

Then immediately run **Action F: Run Verification**.

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
| Guard fails | Record with `guard:record --status failed`, report details, STOP. |
| Guard type is human-review | STOP, ask the human to confirm before recording. |

## Dependencies

- **Superpowers: writing-plans** — implementation plan generation.
- **Superpowers: subagent-driven-development** — per-task execution (TDD, implement, test, commit).
- **Superpowers: requesting-code-review** — guard action when configured.
- **Forge CLI Runtime** — phase, task, guard, verification state.
