# Forge Skill: /start

## Trigger

User runs: `/start <requirement>`

Where `<requirement>` is:
- Text description of a feature or project
- Path to a PRD file
- Path to a UI mockup/screenshot
- Mixed (text + file paths)

## Pre-flight Checks

1. Read `.forge/progress.json`
2. If file does not exist:
   - Run `forge init` to initialize the project
   - If `forge init` fails, stop and guide user to run it manually
3. If `status` is NOT `idle`:
   - Output: "There is already an active feature: `{feature}` (status: {status}). Complete it with `/done` or cancel before starting a new feature."
   - Stop.

## Phase 1: Feature Initialization

### 1.1 Generate Feature Slug

1. Extract a short slug from the requirement description:
   - Use lowercase alphanumeric + hyphens
   - Max 50 characters
   - Handle CJK characters by hashing to alphanumeric
2. Check for slug collision in `docs/forge/changes/`:
   - If exists, append `-2`, `-3`, etc.
3. Set `feature-slug` for this session

### 1.2 Create Feature Directory

```
docs/forge/changes/<feature-slug>/
docs/forge/changes/<feature-slug>/plans/
```

### 1.3 Initialize Progress

Run `forge execute progress init "<feature-slug>"` or write directly:

```json
{
  "version": "1.0",
  "feature": "<feature-slug>",
  "status": "planning",
  "phase": "brainstorming",
  "created_at": "<ISO-8601>",
  "updated_at": "<ISO-8601>",
  "total_batches": 0,
  "current_batch": 0,
  "batches": [],
  "verification": {
    "status": "pending",
    "test_mode": "normal",
    "last_run": null,
    "report_path": null
  }
}
```

## Phase 2: Brainstorming (Proposal Generation)

### 2.1 Parse Requirement Input

1. If input contains file paths:
   - Read each file and extract content
   - Identify file type (PRD, mockup, spec, etc.)
2. If input is pure text:
   - Use as-is
3. Combine all inputs into a single requirement description

### 2.2 Call Brainstorming Skill

1. Load the Superpowers `brainstorming` skill
2. Provide the requirement description as input
3. The skill will:
   - Ask forcing questions if the requirement is unclear
   - Explore alternatives and edge cases
   - Propose a solution architecture

### 2.3 Write Proposal

Save the brainstorming output to `docs/forge/changes/<feature-slug>/proposal.md`:

```markdown
# Proposal: <Feature Name>

## Problem
<What problem does this solve?>

## Solution
<Proposed solution>

## Architecture
<Technical approach>

## Scope
<What's in, what's out>

## Risks
<Known risks and mitigations>

## Alternatives Considered
<Rejected approaches and why>
```

## Phase 3: Scenario Generation

### 3.1 Call Scenarios Skill

1. Load the internal `scenarios.md` skill
2. Input: `docs/forge/changes/<feature-slug>/proposal.md`
3. The skill will:
   - Parse the proposal for feature points
   - Generate scenarios in Given/When/Then format
   - Assign priorities (P0/P1/P2)
   - Assign test types (functional/ui/integration/performance)

### 3.2 Write Scenarios

The scenarios skill writes:
- `docs/forge/changes/<feature-slug>/scenarios.json` (machine-readable)
- `docs/forge/changes/<feature-slug>/scenarios.md` (human-readable)

### 3.3 Quality Check

Before presenting to user, verify:
- [ ] Every scenario is testable (no vague assertions)
- [ ] Every scenario has at least one `then` assertion
- [ ] P0 scenarios cover all core user flows
- [ ] No duplicate scenarios
- [ ] Scenario IDs are sequential starting from 1

If any check fails, regenerate the problematic scenarios.

## Phase 4: User Confirmation

### 4.1 Present Summary

Output to user:

```
## Feature: <feature-slug>

### Proposal Summary
<Brief summary from proposal.md>

### Scenarios (<N> total, <P0-count> P0, <P1-count> P1, <P2-count> P2)

| # | Title | Priority | Test Types |
|---|-------|----------|------------|
| 1 | <title> | P0 | <types> |
| 2 | <title> | P0 | <types> |
...

### Next Steps
1. Run `/next` to confirm and start planning
2. Edit the requirement and re-run `/start` to revise
3. Run `/done` to cancel (if you changed your mind)

Run `/next` when you're ready to proceed.
```

### 4.2 Update Progress

Update `progress.json`:

```json
{
  "phase": "awaiting_confirmation",
  "updated_at": "<ISO-8601>"
}
```

### 4.3 Wait for User

- User runs `/next` → proceed to planning (handled by `next.md`)
- User re-runs `/start` with edits → restart from Phase 1 with new requirement
- User does nothing → wait, no automatic progression

## Error Handling

- **Empty requirement**: "Please provide a requirement. Usage: `/start <description>` or `/start path/to/prd.md`"
- **Active feature exists**: "There is already an active feature: `{feature}`. Complete it with `/done` first."
- **Brainstorming fails**: "Could not generate proposal. Please provide more detail or try again."
- **Scenario generation fails**: "Could not generate scenarios. The proposal may be unclear. Review `proposal.md` and re-run `/start`."
- **File write fails**: "Could not write to `docs/forge/changes/<feature-slug>/`. Check permissions."

## Notes

- `/start` is the ONLY way to begin a new feature
- The proposal and scenarios are the single source of truth for what will be built
- Scenarios are derived from the proposal, not invented by AI
- If the requirement is unclear, ask questions BEFORE generating the proposal
- Never assume requirements — always clarify or mark as `[CLARIFY]` in scenarios
