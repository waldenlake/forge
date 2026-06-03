---
name: forge:executing
description: Phase 3 — Single-task TDD via subagent + 3-layer review, or delegated guard work
---

# /executing

Execute a single task or a delegated guard review, then return control to
the `/next` loop. This skill does NOT contain a per-task loop, guard-decision
logic, or phase-complete logic — those are owned by `forge next-action`.

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

## Invocation

This skill is invoked by `forge next-action` with one of two payloads:

- **Task payload**: `{ task_id, task_title }` — implement a single task.
- **Delegated guard payload**: `{ guard, delegated_actions, task_range }` —
  perform delegated review work, then record the guard.

## Task Path

When invoked with `task_id` and `task_title`:

### D1: task:start

Output `▸ Task <id> — <title>` then run:

```bash
$FORGE_CMD task:start --id <task_id>
```

If `ok` is false: output `✘ task:start: <error>` and STOP.

### D1.5: Frontend design context (only for UI tasks)

Determine if this task involves frontend/UI work by checking the task title
and description for signals: page, component, form, layout, modal, dialog,
dashboard, UI, view, screen, style, CSS, responsive, etc.

If the task does NOT involve frontend UI, skip to D2.

If it DOES involve frontend UI, resolve the design context in this priority:

**Priority 1 — User-provided design assets:**
Check the spec file (`progress.spec_path`) and the plan file
(`progress.plan_path`) for references to:
- Screenshots, mockups, or Figma links
- Design tokens, color palettes, or typography specs
- Specific UI framework or component library requirements

If found: extract the design constraints and pass them to the subagent in D2
as part of the task context.

**Priority 2 — Existing project style:**
If the project already has frontend code (check for `src/components/`,
`src/pages/`, `src/app/`, `app/`, `pages/`, or similar), read 2–3 existing
components to extract:
- CSS framework in use (Tailwind, CSS Modules, styled-components, etc.)
- Color scheme and spacing patterns
- Component structure and naming conventions

Pass these as "style reference" to the subagent: "Match the existing project
style found in `<files>`."

**Priority 3 — No design context available:**
Invoke the `frontend-design` skill to generate a design direction BEFORE
the subagent begins implementation. Output:

```
▸ No UI design provided — generating design direction…
```

The frontend-design skill will produce a design brief (aesthetic direction,
color palette, typography, layout approach). Pass its output as design
context to the subagent in D2.

### D2: Subagent-driven implementation (3 sub-stages, ALL required)

Output `→ Subagent: task <id> — <title>` then invoke
`superpowers:subagent-driven-development`.

The skill runs **three sub-stages in order**. Do NOT proceed to D3 until
all three pass.

| Sub-stage | Role |
|-----------|------|
| ① Implementer | TDD: RED → GREEN → REFACTOR; commit with `[forge task-<id>]` tag |
| ② Spec Compliance Reviewer | `superpowers:requesting-code-review` (spec-reviewer-prompt) |
| ③ Code Quality Reviewer | `superpowers:requesting-code-review` (code-quality-reviewer-prompt) |

If the subagent reports BLOCKED:

```bash
$FORGE_CMD task:fail --id <task_id> --reason "<reason from subagent>"
```

Then STOP.

Hard prohibitions:

```
⚠ Do NOT implement, test, or commit yourself — the subagent owns it.
⚠ Do NOT skip any sub-stage, including for "simple" tasks.
⚠ Do NOT proceed to D3 after only the Implementer sub-stage.
```

If a reviewer reports failure: the implementer fixes (`receiving-code-review`)
and the review re-runs. After 2 implementer retries on the same review fails:

```
✘  subagent: <sub-stage> review still failing after 2 retries
```

Run:

```bash
$FORGE_CMD task:fail --id <task_id> --reason "<sub-stage> review failed after 2 retries"
```

STOP. Human intervention required.

### D3: task:done + automatic gitnexus update

Run:

```bash
$FORGE_CMD task:done --id <task_id>
```

If `ok` is false: output `✘ task:done: <error>` and STOP.

Output `✔ Task <id> done`.

### D4: Return control

After `task:done` succeeds, return control to the `/next` loop. Do NOT
select the next task, check guards, or run `phase:complete` — the `/next`
loop will call `forge next-action` again to determine the next step.

## Delegated Guard Path

When invoked with `guard`, `delegated_actions`, and `task_range`:

### G1: Execute delegated actions

Perform each action in `delegated_actions` (e.g., spec-compliance-review).
Use `superpowers:requesting-code-review` as appropriate.

### G2: Record the guard

The invoking context carries a `record` field. Run it:

```bash
$FORGE_CMD guard:record --type <guard> --status <passed|failed> --tasks <task_range CSV>
```

### G3: Return control

Return to the `/next` loop.

## Error Handling

| Condition | Output |
|---|---|
| Subagent unavailable | `Subagent unavailable — halting.` STOP. |
| Subagent BLOCKED | `task:fail` with reason, STOP for human. |
| Runtime `ok: false` | `✘ <command>: <error>` |
| Review fails 2 retries | `✘ subagent: <sub-stage> review still failing after 2 retries` STOP. |

## Dependencies

- **Superpowers: subagent-driven-development** — D2 main path (3 sub-stages).
- **Superpowers: requesting-code-review** — spec/quality reviews + delegated guard reviews.
- **Superpowers: receiving-code-review** — reviewer feedback loop.
- **Forge CLI Runtime** — task:start, task:done, task:fail, guard:record.
