# Forge Skill: scenarios (Internal)

## Trigger

Called internally by the `/start` skill after brainstorming completes.

## Input

- `docs/forge/changes/<feature>/proposal.md` - The brainstorming output
- `docs/forge/changes/<feature>/mockup.html` - UI mockup (if exists)

## Behavior

### 1. Parse Proposal

1. Read `proposal.md`
2. Identify all feature points, user flows, and requirements
3. For each feature point, determine:
   - Is it a functional requirement? -> functional scenario
   - Does it involve UI? -> UI scenario
   - Does it mention performance? -> performance scenario
   - Does it involve multiple components? -> integration scenario

### 2. Generate Scenarios

For each identified feature point, generate a scenario in this format:

```json
{
  "id": 1,
  "title": "Short descriptive title",
  "given": "Precondition state",
  "when": "User action or system trigger",
  "then": [
    { "assertion": "Expected outcome 1", "type": "functional" },
    { "assertion": "Expected UI change", "type": "ui" },
    { "assertion": "Expected side effect", "type": "side-effect" }
  ],
  "testTypes": ["functional", "ui"],
  "priority": "P0"
}
```

**Priority rules:**
- P0 (blocking): Core functionality, must work for the feature to be usable
- P1 (warning): Important but not critical, feature works without it but degraded
- P2 (record): Nice to have, edge cases, optional features

**Assertion type rules:**
- `functional`: Business logic, API responses, data transformations
- `ui`: Visual changes, navigation, user feedback
- `side-effect`: Database changes, file writes, external API calls, localStorage
- `performance`: Response time, throughput, resource usage

### 3. Write Output

1. Write `docs/forge/changes/<feature>/scenarios.json` with all scenarios in this structure:
   ```json
   {
     "version": "1.0",
     "feature": "<feature-slug>",
     "source": "proposal.md",
     "generated_at": "<ISO-8601>",
     "scenarios": [...]
   }
   ```
2. Render as `docs/forge/changes/<feature>/scenarios.md` for human reading:
   ```markdown
   # Scenarios: <Feature Name>

   ## Scenario 1: <title>
   **Given**: <given>
   **When**: <when>
   **Then**:
   - <then[0].assertion>
   - <then[1].assertion>

   **Test Type**: <testTypes joined>
   **Priority**: <priority>
   ```

### 4. Quality Checks

Before outputting, verify:
- Every scenario is testable (no vague assertions like "system works well")
- Every scenario has at least one `then` assertion
- P0 scenarios cover all core user flows
- No duplicate scenarios
- Scenario IDs are sequential starting from 1

## Output

- `docs/forge/changes/<feature>/scenarios.json` - Machine-readable
- `docs/forge/changes/<feature>/scenarios.md` - Human-readable

## Notes

- Scenarios must be derived from the proposal, not invented
- If the proposal is unclear about a requirement, include a scenario with a `[CLARIFY]` tag and ask the user
- Performance scenarios must have measurable thresholds (not "fast", but "response time <500ms")
