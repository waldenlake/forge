---
name: forge:planning
description: Phase 2 — Brainstorm spec, generate scenarios, write plan, advance to executing
---

# /planning

Drive the Forge workflow through Phase 2 — brainstorm → spec → scenarios →
validate → plan → register → advance. Then return control to the `/next`
loop.

This skill owns the creative planning work. It does NOT judge which phase
to enter next — that is owned by `forge next-action`.

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

### Step 6: Verify-config checkpoint

After `phase:advance` succeeds, output `▸ Showing verification plan…` and run:

```bash
$FORGE_CMD verify --plan
```

Display the plan as a table:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✔ Plan registered, advanced to executing.

Verification plan (will run automatically at /verify):
  ✔ tests
  ✔ build
  ✔ security_scan       (severity ≥ HIGH)
  ✔ dependency_audit    (allowlist: MIT, Apache-2.0, ISC)
  ✘ gstack-basic        (gstack_installed = false)
  ✘ e2e                 (opt-in, disabled)
  ✘ visual_regression   (opt-in, disabled)
  ✘ performance         (opt-in, disabled)

To configure (optional):
  $FORGE_CMD config:verify --enable e2e,visual_regression
  $FORGE_CMD config:verify --coverage-unit 75
  $FORGE_CMD config:verify --security-severity MEDIUM
  $FORGE_CMD config:verify --license-allowlist MIT,Apache-2.0,ISC,BSD-3-Clause

Reply: continue (default) | configure <args>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

STOP and wait for user reply.

- **`continue`** (or empty reply): proceed to Step 7.
- **`configure <args>`**: run the indicated `config:verify` command, re-display
  the plan, then re-prompt. Loop until user says `continue`.

### Step 7: Return control

After the user confirms verify config (or accepts defaults), return control
to the `/next` loop. The next call to `run-loop` will see status=executing
and route to `/executing`.

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
