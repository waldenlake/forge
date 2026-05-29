---
name: forge:executing
description: Phase 3 — Per-task TDD via subagent + 3-layer review + phase:complete gate
---

# /executing

Drive the Forge workflow through Phase 3 — implement every pending task via
the subagent-driven-development skill, then close out the phase through the
phase:complete gate (final review + finishing-a-development-branch + holistic
spec-compliance review).

This skill owns the executing phase end-to-end. It must finish with the
feature in `execution_complete` state (or stop with an explicit blocker).

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
⚒ Forge  ·  /executing
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Per-task progress**:

```
▸ [N/T] <task title>
→ Subagent: task <id> — <title>
```

**Per-task result**:

```
✔ Task N done
```

## Preconditions

1. Run `$FORGE_CMD status`.
2. If status is not `executing`, output:
   `✘ status: <status> — /executing requires executing state. Use /next or /planning.`
   Then STOP.

## D1–D3: Per-task loop

For each pending task (re-read `forge status` at the start of each iteration):

### D1: task:start

Output `▸ [N/T] <task title>` then run:

```bash
$FORGE_CMD task:start --id <id>
```

If `ok` is false:

```
✘  task:start: <error>
```

STOP.

### D2: Subagent-driven implementation (3 sub-stages, ALL required)

Output `→ Subagent: task <id> — <title>` then invoke
`superpowers:subagent-driven-development`.

The skill runs **three sub-stages in order**. Do NOT proceed to D3 until
all three pass.

| Sub-stage | Skill |
|-----------|-------|
| ① Implementer | TDD: RED → GREEN → REFACTOR; commit with `[forge task-<id>]` tag |
| ② Spec Compliance Reviewer | `superpowers:requesting-code-review` (spec-reviewer-prompt) |
| ③ Code Quality Reviewer | `superpowers:requesting-code-review` (code-quality-reviewer-prompt) |

If the subagent reports BLOCKED:

```bash
$FORGE_CMD task:fail --id <id> --reason "<reason from subagent>"
```

Then STOP.

Hard prohibitions:

```
⚠ Do NOT implement, test, or commit yourself — the subagent owns it.
⚠ Do NOT skip any sub-stage, including for "simple" tasks.
⚠ Do NOT proceed to D3 after only the Implementer sub-stage.
```

If the subagent reports BLOCKED (missing dependency, ambiguous requirement,
environment problem):

```bash
$FORGE_CMD task:fail --id <id> --reason "<reason from subagent>"
```

Then STOP and surface the blocker for human intervention.

If a reviewer reports failure: the implementer fixes (`receiving-code-review`)
and the review re-runs. After 2 implementer retries on the same review fails:

```
✘  subagent: <sub-stage> review still failing after 2 retries
```

STOP.

### D3: task:done + automatic gitnexus update

Run:

```bash
$FORGE_CMD task:done --id <id>
```

If `ok` is false:

```
✘  task:done: <error>
```

STOP.

`task:done` automatically calls `gitnexus index --update`; failure is recorded
to guard_history and does not block the task.

Output `✔ Task N done`. Handle any guards reported in the response (see /next
Action D.4 for guard handling).

### Loop

Re-read `forge status`. If any task has status `pending`, return to D1.
Otherwise proceed to phase:complete gate.

## Phase complete gate (when all tasks finished)

Output `▸ Closing phase…`.

### Step 1: forge phase:complete (CLI gate)

```bash
$FORGE_CMD phase:complete
```

The CLI gate enforces:
1. All tasks done/deferred.
2. Working tree clean (no uncommitted changes).
3. Build command succeeds.
4. `phase_complete_attempts < 3`.

On block, surface the JSON exactly:
- `blocked_by: tasks_not_finished` → unfinished task ids in JSON.
- `blocked_by: git_dirty` → list `dirty_paths` and STOP for human.
- `blocked_by: build_failed` → show `build.stderr_excerpt`. Re-enter the
  failing task via subagent (D1–D3) to fix. `phase_complete_attempts`
  has already been incremented — verify it is < 3 before retrying.
- `blocked_by: retry_exhausted` → STOP for human intervention.

If `phase:complete` returns `ok: true`, continue to Step 2.

### Step 2: Final Code Reviewer (cross-task consistency)

Invoke `superpowers:requesting-code-review` for a final pass:
- Focus: cross-task naming, architecture boundaries, module split.
- Do NOT repeat per-task spec/quality reviews.

If issues are reported: re-enter the affected tasks via D1–D3 (the cycle
will reset `phase_complete_attempts` only on a fresh successful
phase:complete). After ≤ 2 retries → STOP.

### Step 3: finishing-a-development-branch

Invoke `superpowers:finishing-a-development-branch` — full test run + git
clean + build. If it fails: re-enter D1–D3 (≤ 2 retries).

### Step 4: Holistic spec-compliance review

Invoke `superpowers:requesting-code-review` against the full
`.forge/scenarios.json` set:
- Focus: every P0/P1/P2 scenario must be covered by the implementation.
- This is a Forge-only layer beyond per-task reviews.

If gaps reported and `phase_complete_attempts < 3`:
- Re-enter the missing-coverage tasks via D1–D3.
- After implementation → re-run Step 1 (`phase:complete` will increment
  attempts again).

If `phase_complete_attempts >= 3`:
- STOP for human review. The CLI gate will refuse re-entry.

When all 4 steps pass, `phase:complete` has already promoted state to
`execution_complete`. Do NOT stop — immediately invoke the `/verify` skill.

Output `▸ Advancing to verify…` then invoke `/verify`.

## Error Handling

| Condition | Output |
|---|---|
| Status not `executing` | `✘ status: <status> — /executing requires executing state.` |
| Subagent unavailable | `Subagent unavailable — halting.` |
| Subagent BLOCKED | `task:fail` with reason, STOP for human |
| `phase:complete` blocked | `✘ phase:complete blocked — <blocked_by>` (with details) |
| Holistic review fails 3 times | `✘ holistic-review: retries exhausted (3) — human review required` |

## Dependencies

- **Superpowers: subagent-driven-development** — D2 main path (3 sub-stages).
- **Superpowers: requesting-code-review** — final + holistic reviews.
- **Superpowers: finishing-a-development-branch** — phase:complete Step 3.
- **Forge CLI Runtime** — task:start/done/fail, phase:complete.
