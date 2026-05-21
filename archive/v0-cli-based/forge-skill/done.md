# Forge Skill: /done

## Trigger

User runs: `/done`

## Pre-flight Checks

1. Read `.forge/progress.json`
2. If file does not exist:
   - Output: "Forge is not initialized. Run: `forge init`"
   - Stop.
3. If `status` is `idle`:
   - Output: "No active feature. Run `/start` to begin."
   - Stop.

## Phase 1: Validation

### 1.1 Run Done Validation

1. Run `forge done validate` CLI command
2. Check result:
   - `success: true` → proceed to Phase 2
   - `success: false` → output errors, stop

### 1.2 Output Validated Errors

If validation fails:
```
Cannot complete feature yet:

<list each error>

- Task 7 (Implement JWT) is not done (status: in_progress)
- Verification has not passed

Fix the above, then run `/done` again.
```

If validation passes with deferred tasks:
```
Validation passed with deferred tasks:
- Task 12 (Optional: Dark mode) - deferred

Proceed with archival? (yes/no)
```

## Phase 2: Archival

### 2.1 Merge Scenarios to Project Spec

1. Run `forge done archive` CLI command
2. Copies `docs/forge/changes/<feature>/scenarios.md` → `docs/forge/specs/<feature>-scenarios.md`
3. Moves `docs/forge/changes/<feature>/` → `docs/forge/changes/archive/<date>-<feature>/`

### 2.2 Update CLAUDE.md

Append to `CLAUDE.md`:
```markdown
## Completed Features
- <feature-slug> (<date>)
  - Tasks: <total> completed, <deferred> deferred
  - Test coverage: <from verification report>
  - Key decisions: <extract from proposal.md and review files>
  - Deferred tasks: <list if any>
```

Extract key decisions from:
- `proposal.md` — architectural choices
- `review-batch-*.md` — significant trade-offs
- `scenarios.json` — scope decisions

### 2.3 Reset Progress

1. Run `forge done reset` CLI command
2. Clears feature state in `progress.json`

### 2.4 Git Commit

```bash
git add docs/forge/specs/ docs/forge/changes/archive/ CLAUDE.md .forge/progress.json
git commit -m "chore: archive feature <feature-slug> [forge done]"
```

## Phase 3: Output Summary

```
## Feature Complete: <feature-slug>

Summary:
- Total tasks: <N>
- Completed: <N>
- Deferred: <N> (<list if any>)
- Test coverage: <X>%

Archived to: docs/forge/changes/archive/<date>-<feature>/
Spec updated: docs/forge/specs/<feature>-scenarios.md

Run `/start` to begin a new feature.
```

## Error Handling

- **Incomplete tasks**: List each incomplete task with its status. Do NOT proceed.
- **Verification not passed**: "Verification must pass before marking done. Run `/next` to trigger verification."
- **Archive directory already exists**: Append timestamp to avoid collision.
- **CLAUDE.md write fails**: Warn user but continue archival.
- **Scenarios file missing**: Warn but continue.

## Notes

- `/done` is irreversible — always validate first
- Deferred tasks are recorded but NOT re-tracked automatically
- Archived features are read-only history
- CLAUDE.md update is critical for future context
