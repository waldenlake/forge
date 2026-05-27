---
name: start
description: Begin a new feature — brainstorm, generate scenarios, get confirmation
---

# /start \<requirement\>

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

## Step 0: Requirement Gate — do this BEFORE anything else

If the text after `/start` is absent or blank:

- Output exactly:
  `Please provide a requirement. Example: /start user authentication with JWT`
- **STOP. Do not output the header. Do not run any CLI commands.**

Only continue past this point when a non-empty requirement is present.

## Output Format

Follow the Forge Skill UX Standard (`skills/SKILL-UX.md`).

**Header** (output immediately after Step 0 passes):

```
⚒ Forge  ·  /start
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Progress lines** before each major operation:

```
▸ Checking status…
▸ Brainstorming…
▸ Generating scenarios…
▸ Validating scenarios…
▸ Starting feature…
```

**Step results** after each succeeds:

```
✔ Scenarios validated  ·  <N> scenarios, <N> P0
✔ Feature started  ·  <slug>
```

**STOP block** at the end:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏸  Scenarios ready — review above before continuing
▸  Next: /next to confirm  ·  or ask to revise
```

## Preconditions

1. Run `$FORGE_CMD status`.
2. If the JSON has `migration_required: true`, output:

   ```
   ✘  status: migration required — run: forge migrate --from 1.0 --to 2.0
   ```

   Then STOP.

3. If config is absent, detect whether Superpowers is available, then run:

   ```bash
   $FORGE_CMD init --auto-detect --superpowers-available true
   ```

   or `--superpowers-available false`. Report the JSON result.

4. If the status JSON reports an active feature that is not `idle`, output:

   ```
   ✘  feature already active: <feature>  ·  status: <status>
   ```

   Then STOP. Do not delete or overwrite state.

## Flow

### 1. Generate Slug

Create a URL-safe feature slug from the requirement:
- Lowercase meaningful words.
- Replace spaces and special characters with hyphens.
- Collapse repeated hyphens; keep it short enough for filenames.

Examples:
- `user authentication with JWT` → `user-authentication-jwt`
- `Add dark mode support` → `dark-mode-support`

### 2. Brainstorm

Output `▸ Brainstorming…`, then invoke the Superpowers `brainstorming` skill
with:
- The user's requirement.
- Any referenced files.
- The generated slug as filename context.

The output spec path must be a real file, usually:

```
docs/superpowers/specs/YYYY-MM-DD-<feature-slug>-design.md
```

If brainstorming produces no spec path, output:

```
✘  brainstorming: no spec path produced — provide more detail and try again
```

Then STOP.

### 3. Generate Scenarios

Output `▸ Generating scenarios…`, then invoke the `scenarios` skill with:
- explicit `<spec_path>`: the captured Superpowers design spec path.
- explicit `<feature_slug>`: the slug generated in Step 1.

After the scenarios file is produced, output `▸ Validating scenarios…` and run:

```bash
$FORGE_CMD schema:validate --file .forge/scenarios.json
```

If validation fails, output:

```
✘  schema:validate: <errors from JSON>
```

Then STOP. Scenario revisions must go through the scenarios skill and be
validated again.

### 4. Start Runtime Feature

Output `▸ Starting feature…`, then run:

```bash
$FORGE_CMD feature:start --feature <slug> --spec <path>
```

If `ok` is false, output:

```
✘  feature:start: <error field from JSON>
```

Then STOP.

### 5. Present Review

Output the step result:

```
✔ Scenarios validated  ·  <N> scenarios, <P0-count> P0
✔ Feature started  ·  <slug>
```

Then render the scenarios from `.forge/scenarios.json` in this exact format
(one block per scenario, no extra prose between them):

```
S001 [P0]  <title>
  Given  <given>
  When   <when>
  Then   <then assertions, one per line>

S002 [P1]  <title>
  ...
```

Then output the STOP block:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏸  Scenarios ready — review above before continuing
▸  Next: /next to confirm  ·  or ask to revise scenarios  ·  or ask to revise the spec
```

Stop after the STOP block. Do not run `/next` in the same turn.

## Error Handling

| Condition | Output |
|---|---|
| Empty requirement | `Please provide a requirement. Example: /start user authentication with JWT` |
| `migration_required: true` | `✘  status: migration required — run: forge migrate --from 1.0 --to 2.0` |
| Active feature blocks start | `✘  feature already active: <feature>  ·  status: <status>` |
| Runtime `ok: false` | `✘  <command>: <error field>` |
| Referenced file missing | `✘  file not found: <path>` |
| Brainstorming produces no spec | `✘  brainstorming: no spec path produced — provide more detail and try again` |
| Scenario validation fails | `✘  schema:validate: <errors from JSON>` |

## Dependencies

- **Superpowers: brainstorming** — requirement clarification and design spec.
- **Forge scenarios skill** — scenario generation.
- **Forge CLI Runtime** — init, status, feature state, and schema validation.
