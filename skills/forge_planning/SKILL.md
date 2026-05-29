---
name: forge:planning
description: Phase 2 — Brainstorm spec, generate scenarios, write plan, advance to executing
---

# /planning

Drive the Forge workflow through Phase 2 — needs to plans:
brainstorm → spec → scenarios → plan → register → advance.

This skill owns the planning phase end-to-end. It must finish with the
feature in `executing` state (or stop with an explicit blocker).

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
⚒ Forge  ·  /planning
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Progress lines**:

```
▸ Brainstorming…
▸ Generating scenarios…
▸ Validating scenarios…
▸ Writing plan…
▸ Registering plan…
▸ Advancing to execution…
```

## Preconditions

1. Run `$FORGE_CMD status`.
2. If status is not `planning`, output:
   `✘ status: <status> — /planning requires planning state. Use /start first.`
   Then STOP.
3. If `progress.spec_path` is null, output:
   `✘ planning: no spec_path — /start did not register one`
   Then STOP.

## Flow

### Step 1: Brainstorm — produce design spec (if not already present)

If the file at `progress.spec_path` does not exist or is empty, output
`▸ Brainstorming…` and invoke `superpowers:brainstorming` with:
- The user's requirement (passed via `/start`).
- Output target `<progress.spec_path>`.

After brainstorming completes, **STOP for human spec confirmation**:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏸  Spec drafted at <spec_path> — review before continuing
▸  Next: /planning to confirm  ·  or revise the spec manually
```

This is the single mandatory human checkpoint in Phase 2. Do not proceed
without explicit re-invocation.

If the spec already exists at the path (next /planning invocation after
review), continue to Step 2.

### Step 2: Generate scenarios

Output `▸ Generating scenarios…` and invoke the `forge:scenarios` skill with:
- explicit `<spec_path>` from `progress.spec_path`.
- explicit `<feature_slug>` from `progress.feature`.

After the file is written, output `▸ Validating scenarios…` and run:

```bash
$FORGE_CMD schema:validate --file .forge/scenarios.json
```

If validation fails:

```
✘  schema:validate: <errors from JSON>
```

STOP. Do not proceed to plan generation with an invalid scenarios artifact —
re-run the `forge:scenarios` skill instead.

### Step 3: Write plan

Output `▸ Writing plan…` and invoke `superpowers:writing-plans` with:
- `<spec_path>` from `progress.spec_path`.
- `.forge/scenarios.json`.
- Constraint: each task must be 2–5 minutes of work, contain TDD steps,
  and reference the related scenario IDs in its description.

The plan output goes to `docs/plans/<feature_slug>.md` (or whatever path
the writing-plans skill produces). The plan path will be picked up by
`plan:register`.

### Step 4: Register plan

Output `▸ Registering plan…`, then run:

```bash
$FORGE_CMD plan:register --plan <plan_path>
```

If `ok` is false:

```
✘  plan:register: <error>
```

STOP.

### Step 5: Advance to executing

Output `▸ Advancing to execution…`, then run:

```bash
$FORGE_CMD phase:advance
```

If `ok` is false:

```
✘  phase:advance blocked — <blocked_by>
```

STOP.

### Step 6: Auto-advance to /executing

After plan registration and `phase:advance` succeed, do NOT stop.
Immediately invoke the `/executing` skill to begin Phase 3.

Output `▸ Advancing to executing…` then invoke `/executing`.

## Error Handling

| Condition | Output |
|---|---|
| Status not `planning` | `✘ status: <status> — /planning requires planning state. Use /start first.` |
| Brainstorming produces no spec | `✘ brainstorming: no spec produced — provide more detail and try again` |
| Scenarios validation fails | `✘ schema:validate: <errors from JSON>` |
| writing-plans produces no plan | `✘ writing-plans: no plan produced — check spec and scenarios.json` |
| Runtime `ok: false` | `✘ <command>: <error or blocked_by from JSON>` |

## Dependencies

- **Superpowers: brainstorming** — produces the design spec.
- **Forge scenarios skill** — generates `.forge/scenarios.json`.
- **Superpowers: writing-plans** — task breakdown with scenario IDs.
- **Forge CLI Runtime** — schema:validate, plan:register, phase:advance.
