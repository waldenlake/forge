# Forge Runtime Validation Design

## Background

After the architecture rework (`2026-05-21-forge-architecture-rework-design.md`),
5 of 8 issues from forge-test review were resolved at the architectural level.
Three remain because they depend on **AI behavior compliance**, not architecture:

1. `/done` may not actually update memory_file (relies on AI executing all steps)
2. Test framework detection runs once at init — if go.mod doesn't exist yet, detection fails permanently
3. Status/phase/task enums may still get bogus values because skill docs are guidance, not enforcement

This spec adds **runtime validation** — three concrete mechanisms that catch
these failures regardless of whether AI follows the steps.

## Decision

Add three independent runtime safety nets:

1. **JSON Schema files** for progress.json, config.json, scenarios.json
2. **Lazy test command detection** in progress-tracking (re-detect each time)
3. **Self-verification in /done** (read memory_file after writing, confirm change landed)

## Component 1: JSON Schemas

### Files to add

```
schemas/
  progress.schema.json
  config.schema.json
  scenarios.schema.json
```

These are JSON Schema Draft-07 documents. Skill files reference them with:

```markdown
**Before writing this file, validate against `schemas/progress.schema.json`.**
The schema defines exact allowed values. Any deviation causes the file to be
unusable by other Forge skills.
```

### What schemas enforce

- Status enum: `idle | planning | executing | verification_complete | bugfix`
- Task status enum: `pending | in_progress | done | failed | deferred`
- Guard status enum: `passed | failed | skipped`
- Required fields and types
- ID format constraints (e.g., `S\d{3}` for scenario IDs)

### Why this helps

When AI is uncertain about a field value, having a concrete schema reference
gives it an authoritative source. Even without programmatic validation, the
schema's existence signals "these are the only valid values" much stronger
than skill text saying "use one of these values".

## Component 2: Lazy Test Command Detection

### Current behavior

`start/SKILL.md` Step 5 detects test framework once during init. Result is
written to `config.json.test_command`. If detection fails (e.g., go.mod not
yet created), test_command is empty forever.

### New behavior

`progress-tracking/SKILL.md` Step 1 already has fallback detection logic. We
add explicit re-detection: if `config.test_command` is empty OR detection-time
file features no longer match (e.g., switched from npm to pnpm), re-detect
and update config.json.

### Pseudocode

```
detect_test_command():
  command = read config.test_command
  if command is non-empty:
    return command
  
  # Fallback: scan project files
  if exists("go.mod"): command = "go test ./..."
  elif exists("package.json"): command = "npm test"
  elif exists("Cargo.toml"): command = "cargo test"
  elif exists("pytest.ini") or exists("pyproject.toml"): command = "pytest"
  else: return null
  
  # Persist
  write config.test_command = command
  return command
```

This means even if init fails to detect, the first task that runs tests will
detect and persist.

## Component 3: /done Self-Verification

### Current behavior

`done/SKILL.md` Step 2 says "Update memory file with Completed Features entry".
If AI skips this step or writes to wrong location, no error is raised.

### New behavior

After Step 2 (Update Memory File), add Step 2.5: **Verify Update**.

```markdown
### Step 2.5: Verify Memory File Update

Read the memory file again (filename from config.json.memory_file).
Search for the just-added entry: "<feature-slug> (<date>)".

If the entry is NOT present:
- Output: "⚠ Memory file update did not land. Re-attempting..."
- Re-run Step 2
- Read again to verify
- If still missing → ERROR: "Cannot update <memory_file>. Check file permissions."
- STOP

If present → proceed to Step 3.
```

### Why

This is read-after-write verification. It catches:
- AI skipped the write entirely
- Wrong file was written (e.g., wrote to CLAUDE.md when memory_file is AGENTS.md)
- Append silently failed (file locked, permission issue)

Same pattern can apply to other critical writes (progress.json updates), but
keeping scope tight: only `/done` for now since that's the documented failure.

## Out of Scope

- Programmatic JSON Schema validators (skill files are markdown, not code)
- Runtime hooks to block bad writes (would require platform-level changes)
- Schema-driven test generation
- Self-verification in every skill (only /done for now — validate-after-write
  pattern can be added incrementally)

## Components Affected

| File | Change |
|------|--------|
| `schemas/progress.schema.json` | NEW |
| `schemas/config.schema.json` | NEW |
| `schemas/scenarios.schema.json` | NEW |
| `skills/start/SKILL.md` | Reference config.schema.json before writing |
| `skills/scenarios/SKILL.md` | Reference scenarios.schema.json before writing |
| `skills/progress-tracking/SKILL.md` | Lazy test_command detection + reference progress.schema.json |
| `skills/done/SKILL.md` | Add Step 2.5 self-verification + reference progress.schema.json |
| `skills/next/SKILL.md` | Reference progress.schema.json |
| `skills/resume/SKILL.md` | Reference progress.schema.json |
| `skills/bugfix/SKILL.md` | Reference progress.schema.json |
| `README.md` | Document schemas/ directory |

## Success Criteria

After this change:
1. AI has explicit schema files to reference before writing JSON
2. Test framework auto-detects lazily (no permanent init failure)
3. `/done` confirms memory_file was actually updated, not just attempted
