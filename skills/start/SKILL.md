---
name: start
description: Begin a new feature — brainstorm, generate scenarios, get confirmation
---

# /start <requirement>

Begin a new work item and leave it ready for review. Keep the skill thin:
Forge Runtime owns state mutation; this skill calls the CLI, reads JSON, calls
Superpowers, and explains results.

## Forge CLI

Before calling any Forge Runtime command, resolve the executable:

```bash
FORGE_CMD=$(command -v forge 2>/dev/null || { if [ -f "$HOME/.config/opencode/plugins/forge/cli/dist/index.js" ]; then echo "node $HOME/.config/opencode/plugins/forge/cli/dist/index.js"; else echo ".forge/bin/forge"; fi; })
```

All Runtime commands output JSON by default. Read the JSON, report blocking
errors exactly, and do not edit `.forge/*.json` directly.

## Header

Before any logic, output:

```text
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  ⚒  F O R G E  v0.2.0               ┃
┃  CLI Runtime Orchestration            ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

## Preconditions

1. If `<requirement>` is empty, output
   `"Please provide a requirement. Example: /start user authentication with JWT"`
   and stop.
2. Run `forge status` through `$FORGE_CMD status`.
3. If the JSON has `migration_required: true`, output the exact migration need
   and tell the user to run `forge migrate --from 1.0 --to 2.0`. Stop.
4. If config is absent, detect whether Superpowers is available, then run
   `forge init --auto-detect --superpowers-available true` or
   `forge init --auto-detect --superpowers-available false`.
5. If the status JSON reports an active feature that is not `idle`, report the
   blocking status exactly. Do not delete or overwrite state.

## Flow

### 1. Generate Slug

Create a URL-safe feature slug from the requirement:
- Lowercase meaningful words.
- Replace spaces and special characters with hyphens.
- Collapse repeated hyphens and keep it short enough for filenames.

Examples:
- `user authentication with JWT` -> `user-authentication-jwt`
- `Add dark mode support` -> `dark-mode-support`

### 2. Brainstorm

Use the Superpowers `brainstorming` skill.

Input:
- The user's requirement.
- Any referenced files.
- The generated slug as filename context.

The output spec path must be a real file, usually:

```text
docs/superpowers/specs/YYYY-MM-DD-<feature-slug>-design.md
```

If brainstorming produces no spec path, report
`"Brainstorming didn't converge. Provide more detail."` and stop.

### 3. Generate Scenarios

Use the Forge scenarios skill to produce `.forge/scenarios.json` from the spec.
Invoke it with:
- explicit `<spec_path>`: the captured Superpowers design spec path.
- explicit `<feature_slug>`: the slug generated in Step 1.

After the scenarios file is produced, validate it:

```bash
$FORGE_CMD schema:validate --file .forge/scenarios.json
```

If validation fails, report the schema errors exactly and stop. Scenario
revisions must go through the scenarios skill and be validated again.

### 4. Start Runtime Feature

After the spec path is known and scenarios validate, run:

```bash
$FORGE_CMD feature:start --feature <slug> --spec <path>
```

Read the JSON. If `ok` is false, report the blocking error exactly and stop.

### 5. Present Review

Show:
- A 2-4 sentence spec summary.
- The scenarios as readable Given/When/Then items.
- The next options:

```text
Review complete. You can:
- /next to confirm and begin planning
- ask Forge to adjust scenarios and revalidate
- ask to revise the spec, then regenerate scenarios
```

Stop after review. Do not run `/next` in the same turn.

## Error Handling

| Condition | Response |
|---|---|
| Empty requirement | Ask for a requirement and stop. |
| `forge status` returns migration required | Tell the user to run `forge migrate --from 1.0 --to 2.0` and stop. |
| Runtime command returns `ok: false` | Report the JSON error or `blocked_by` exactly and stop. |
| Referenced file missing | `File not found: <path>. Check path and try again.` |
| Scenario validation fails | Report the `schema:validate` errors exactly and stop. |

## Dependencies

- **Superpowers: brainstorming** — requirement clarification and design spec.
- **Forge scenarios skill** — scenario generation.
- **Forge CLI Runtime** — init, status, feature state, and schema validation.
