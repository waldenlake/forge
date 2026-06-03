---
name: forge:start
description: Phase 1 — env check + init + GitNexus baseline + feature:start + global checklist
---

# /start \<requirement\>

Phase 1 of the Forge workflow — environment readiness checks, project init,
feature registration, GitNexus baseline, and full lifecycle Checklist
display.

This skill does NOT brainstorm or generate scenarios — those belong to
`/planning`. /start finishes by handing off with the feature in `planning`
state.

## Forge CLI

Before calling any Forge Runtime command, resolve the executable:

```bash
FORGE_CMD=$(command -v forge 2>/dev/null || { if [ -f "$HOME/.config/opencode/plugins/forge/cli/dist/index.js" ]; then echo "node $HOME/.config/opencode/plugins/forge/cli/dist/index.js"; else echo ".forge/bin/forge"; fi; })
```

All Runtime commands output JSON. Parse the JSON silently, extract only
relevant fields, and present results using SKILL-UX.md templates. NEVER
display raw JSON to the user. Do not edit `.forge/*.json` directly.

## Step 0: Brand Welcome & Input Parsing

Always output the Forge brand block first, regardless of input:

```
    ╔═══════════════════════════════════════╗
    ║                                       ║
    ║             ⚒  F O R G E              ║
    ║                                       ║
    ║   AI-Driven Development Orchestrator  ║
    ║                                       ║
    ╚═══════════════════════════════════════╝

Welcome to Forge. Let's build something great.
```

Parse the text after `/start`:

| Format | Example |
|--------|---------|
| Text only | `/start user authentication with JWT` |
| Text + local path | `/start add dark mode ./docs/design-spec.md` |
| Text + URL | `/start payment flow https://example.com/spec.md` |
| Empty | `/start` |

If the requirement description is empty:

```
What would you like to build? Describe the feature, bug, or improvement.

Examples:
  /start user authentication with JWT
  /start add dark mode support ./docs/design-spec.md
```

STOP. Do not proceed.

## Step 1: Doctor — environment readiness

Output `▸ Checking environment…`, then run:

```bash
$FORGE_CMD doctor
```

Parse the JSON response silently. Do NOT display the raw JSON.

If `ok: false` and any **critical** check failed, output only the failures:

```
✘ doctor: gitnexus not installed — install: npm install -g gitnexus
```

STOP only on critical failures. A missing `config` is expected for first-time
use and does not block — proceed to Step 2 (init will create it).

If all critical checks pass, output a single summary line:

```
✔ Environment ready  ·  node <version>  ·  gitnexus <version>
```

## Step 2: forge status / init

Run `$FORGE_CMD status`. Parse the JSON silently.

If config is absent, run:

```bash
$FORGE_CMD init --auto-detect
```

Output a single result line:

```
✔ Project initialized  ·  <project_type>  ·  <test_framework>
```

Do NOT display raw JSON from status or init.

If status reports `migration_required: true`, output:

```
✘ status: migration required — run: forge migrate --from 1.0 --to 2.0
```

STOP.

If status reports an active feature (status not `idle`):

```
✘ feature already active: <feature> · status: <status>
   Run /resume to continue, or /done to finish.
```

STOP.

## Step 3: Generate slug

Create a URL-safe slug from the requirement:
- Lowercase meaningful words.
- Replace spaces / special chars with hyphens.
- Collapse repeats.

Example: `user authentication with JWT` → `user-authentication-jwt`.

## Step 4: feature:start

Output `▸ Starting feature…`, then run:

```bash
$FORGE_CMD feature:start --feature <slug> --spec <docs/superpowers/specs/YYYY-MM-DD-<slug>-design.md>
```

The spec path is the *intended* output of `/planning`'s brainstorm step;
it does not need to exist yet — `/planning` will create it.

If `ok` is false:

```
✘ feature:start: <error>
```

STOP.

This call also injects the WORKFLOW_RULES block into the project memory
file. Skill execution must obey those rules until the feature reaches
`idle` again.

## Step 5: Display global Checklist

Output the lifecycle overview (compact — one line per phase):

```
Feature Lifecycle:
  ☑ /start    — environment, init, feature registered
  ☐ /planning — brainstorm → spec → scenarios → plan → advance
  ☐ /executing — per-task TDD + review + guards
  ☐ /verify   — tests, build, security, dependency audit
  ☐ /done     — finish, archive, reset
```

## Step 6: Auto-advance to /planning

After the Checklist, do NOT stop. Immediately invoke the `/planning` skill
to begin Phase 2 (brainstorm → spec → scenarios → plan → advance).

The first human checkpoint is inside `/planning` (after brainstorming
produces the spec — the user must confirm the spec before scenarios are
generated). There is no pause between /start and /planning.

Output `▸ Advancing to planning…` then invoke `/planning`.

## Error Handling

| Condition | Output |
|---|---|
| Empty requirement | brand block + examples + STOP |
| `doctor` critical fail | `✘ doctor: <failed checks>` |
| `gitnexus` missing | `✘ gitnexus: not installed — install: npm install -g gitnexus` |
| Active feature | `✘ feature already active: <feature> · status: <status>` |
| `migration_required` | `✘ status: migration required — run: forge migrate --from 1.0 --to 2.0` |
| Runtime `ok: false` | `✘ <command>: <error from JSON>` |

## Dependencies

- **Forge CLI Runtime** — doctor, init, status, feature:start, migrate.
- **GitNexus** — required (baseline index runs in `init`).
