---
name: scenarios
description: Generate structured test scenarios from a proposal
---

# Scenarios Skill

Generate structured Given/When/Then test scenarios from a feature proposal. This skill is called by `start/SKILL.md` after brainstorming completes.

---

## Input

| File | Required | Description |
|------|----------|-------------|
| `docs/forge/changes/<feature>/proposal.md` | **Yes** | Feature proposal with summary, decisions, scope, and constraints |
| `docs/forge/changes/<feature>/mockup.html` | No | HTML mockup of the UI (if the feature involves user interface) |

Read both files (if they exist) before generating scenarios.

---

## Output

| File | Format | Purpose |
|------|--------|---------|
| `docs/forge/changes/<feature>/scenarios.json` | JSON | Machine-readable scenarios for downstream automation |
| `docs/forge/changes/<feature>/scenarios.md` | Markdown | Human-readable scenarios for review and editing |

---

## Process

### Step 1: Read and Analyze the Proposal

1. Read `docs/forge/changes/<feature>/proposal.md` in full.
2. Extract:
   - **Feature summary** — what the feature does at a high level
   - **Key decisions** — choices made during brainstorming
   - **Scope boundaries** — what's included and what's explicitly excluded
   - **Technical constraints** — limitations or requirements that affect behavior
3. If `mockup.html` exists, read it and extract:
   - All interactive elements (buttons, inputs, links, toggles, dropdowns)
   - Visual states (loading, empty, error, success)
   - Navigation flows
   - Responsive breakpoints (if specified)
   - Accessibility attributes (aria labels, roles)

### Step 2: Identify Testable Behaviors

From the proposal (and mockup if present), identify every distinct testable behavior. A testable behavior is:
- A specific user action that produces an observable result
- A system response to a specific input or condition
- A state transition triggered by an event
- An error condition and its expected handling
- A boundary or edge case explicitly mentioned in the scope

**Rules for identifying behaviors:**
- Each behavior must be independently verifiable
- Do NOT invent behaviors not described or implied by the proposal
- DO include error cases and edge cases mentioned in scope boundaries
- DO include implicit behaviors (e.g., if proposal says "user can log in" → also include "user cannot log in with wrong password")
- If mockup exists, each interactive element generates at least one behavior
- Group related behaviors logically (e.g., all validation behaviors together)

### Step 3: Generate Given/When/Then Scenarios

For each testable behavior, write one scenario using this structure:

- **Given**: The precondition or initial state. What must be true before the action.
- **When**: The action or event. What the user does or what triggers the behavior.
- **Then**: One or more assertions. What should be true after the action.

**Rules for writing scenarios:**
- Use plain English, not code
- Be specific: "Given a user with email 'test@example.com'" not "Given a user"
- Each `then` assertion tests ONE thing
- Avoid implementation details (no "the database is updated", say "the user appears in the list")
- Use present tense for Given, present tense for When, present tense for Then
- Keep scenarios independent — no scenario should depend on another scenario running first

### Step 4: Assign Test Types

Assign one or more test types to each scenario:

| Type | Use When |
|------|----------|
| `functional` | Core logic, data transformations, business rules, CRUD operations |
| `ui` | Visual rendering, user interactions, layout, responsive behavior, accessibility |
| `integration` | Communication between modules, API calls, database operations, external services |
| `performance` | Response time requirements, load handling, resource limits, pagination |

**Rules:**
- Every scenario gets at least one test type
- A scenario can have multiple types (e.g., a form submission is both `ui` and `functional`)
- If mockup.html exists, scenarios derived from it should include `ui`
- If the proposal mentions speed, latency, or scale → include `performance`

### Step 5: Assign Priorities

Assign exactly one priority to each scenario:

| Priority | Meaning | Criteria |
|----------|---------|----------|
| `P0` | Must work | Core functionality. Feature is broken without this. Happy path. |
| `P1` | Should work | Important but not blocking. Error handling, validation, secondary flows. |
| `P2` | Nice to have | Polish, edge cases, performance optimizations, accessibility enhancements. |

**Rules:**
- At least ONE scenario must be P0 (if no scenario qualifies as P0, the proposal is too vague — error out)
- P0 scenarios are the happy path and critical guard rails
- P1 scenarios are error handling, validation, and important alternate flows
- P2 scenarios are edge cases, polish, and non-critical enhancements
- When in doubt between P0 and P1, choose P1
- When in doubt between P1 and P2, choose P1

### Step 6: Handle Mockup-Specific Scenarios (if mockup.html exists)

When a mockup is present, generate additional UI-specific scenarios:

1. **Rendering scenarios** — each major section/component renders correctly
2. **Interaction scenarios** — each button/link/input does what it should
3. **State scenarios** — loading states, empty states, error states display correctly
4. **Responsive scenarios** — layout adapts to mobile/tablet/desktop (if breakpoints defined)
5. **Accessibility scenarios** — keyboard navigation works, screen reader labels exist

These scenarios should:
- Reference specific elements from the mockup by their visible label or role
- Include the `ui` test type
- Be prioritized based on user impact (primary actions = P0, secondary = P1, polish = P2)

### Step 7: Write scenarios.json

Write the output to `docs/forge/changes/<feature>/scenarios.json` using this exact schema:

```json
{
  "version": "1.0",
  "feature": "<feature-slug>",
  "source": "proposal.md",
  "generated_at": "<ISO-8601 timestamp>",
  "scenarios": [
    {
      "id": "S001",
      "title": "<short descriptive title>",
      "given": "<precondition statement>",
      "when": "<action or trigger>",
      "then": [
        {
          "assertion": "<what should be true>",
          "type": "result|side-effect|state-change|error"
        }
      ],
      "testTypes": ["functional", "ui", "integration", "performance"],
      "priority": "P0"
    }
  ]
}
```

**Field specifications:**

| Field | Type | Description |
|-------|------|-------------|
| `version` | string | Always `"1.0"` |
| `feature` | string | The feature slug (directory name) |
| `source` | string | Always `"proposal.md"` |
| `generated_at` | string | ISO-8601 timestamp of generation time |
| `scenarios` | array | Array of scenario objects |
| `scenarios[].id` | string | Format: `S` + zero-padded 3-digit number. Sequential starting at `S001`. |
| `scenarios[].title` | string | Short, descriptive. Max 80 characters. Starts with a verb (e.g., "Creates a new user", "Rejects invalid email"). |
| `scenarios[].given` | string | Single precondition statement. If multiple preconditions needed, combine with "and". |
| `scenarios[].when` | string | Single action statement. One trigger per scenario. |
| `scenarios[].then` | array | One or more assertion objects. |
| `scenarios[].then[].assertion` | string | What should be true after the action. |
| `scenarios[].then[].type` | string | One of: `result` (return value/output), `side-effect` (something else changes), `state-change` (system state transitions), `error` (error is produced). |
| `scenarios[].testTypes` | array | One or more of: `functional`, `ui`, `integration`, `performance`. |
| `scenarios[].priority` | string | One of: `P0`, `P1`, `P2`. |

### Step 8: Write scenarios.md

Write the output to `docs/forge/changes/<feature>/scenarios.md` using this exact format:

```markdown
# Scenarios: <Feature Title>

> Generated from `proposal.md` on <YYYY-MM-DD>

## Summary

- **Total scenarios:** <count>
- **P0 (must work):** <count>
- **P1 (should work):** <count>
- **P2 (nice to have):** <count>

---

## P0 — Must Work

### S001: <Title>

| | |
|---|---|
| **Given** | <precondition> |
| **When** | <action> |
| **Then** | <assertion 1> |
| | <assertion 2> |
| **Type** | <testTypes joined with ", "> |

---

### S002: <Title>

...

---

## P1 — Should Work

### S003: <Title>

...

---

## P2 — Nice to Have

### S004: <Title>

...

---

## Test Type Coverage

| Type | Count | Scenarios |
|------|-------|-----------|
| functional | <n> | S001, S002, ... |
| ui | <n> | S003, S005, ... |
| integration | <n> | S004, ... |
| performance | <n> | S006, ... |
```

**Formatting rules for scenarios.md:**
- Group scenarios by priority (P0 first, then P1, then P2)
- Within each priority group, order by ID
- The "Then" column lists each assertion on its own row (use empty first column for continuation rows)
- The "Test Type Coverage" table at the bottom shows which scenarios map to each type
- Use horizontal rules (`---`) between scenarios for readability
- If a priority group has zero scenarios, omit that section entirely

---

## Validation Rules

Before writing the output files, validate:

1. **Sequential IDs**: IDs must be `S001`, `S002`, `S003`, ... with no gaps and no duplicates.
2. **No duplicate titles**: Every scenario title must be unique.
3. **At least one P0**: There must be at least one P0 scenario. If not, the proposal lacks clear core functionality — return an error to the calling skill.
4. **Non-empty fields**: `title`, `given`, `when`, and `then` must all be non-empty. `then` must have at least one assertion.
5. **Valid test types**: Each entry in `testTypes` must be one of: `functional`, `ui`, `integration`, `performance`.
6. **Valid priorities**: Must be one of: `P0`, `P1`, `P2`.
7. **Valid assertion types**: Each `then[].type` must be one of: `result`, `side-effect`, `state-change`, `error`.
8. **Title length**: Max 80 characters per title.
9. **Reasonable count**: Aim for 5–25 scenarios. If fewer than 5, the proposal may be too narrow. If more than 25, consider whether the feature should be split.

If validation fails, fix the issue and re-validate before writing files.

---

## Important Notes

1. **Scenarios are for TDD, not implementation.** They describe WHAT the system does, not HOW it does it. Never include implementation details like database queries, specific algorithms, class names, or file paths.

2. **Scenarios are the contract.** Once confirmed by the user, scenarios become the source of truth for what tests to write. Downstream skills (`next`, `execute`) use `scenarios.json` to generate test code.

3. **Scenarios must be falsifiable.** Each assertion must be something that can clearly pass or fail. "The system works correctly" is not a valid assertion. "The response contains the user's email address" is.

4. **Don't over-test.** One scenario per behavior. If two scenarios would have identical Given/When but different Then assertions, merge them into one scenario with multiple Then entries.

5. **Respect scope boundaries.** If the proposal explicitly excludes something, do NOT generate scenarios for it. If the proposal says "authentication is out of scope", do not generate login scenarios.

6. **Scenarios are not exhaustive.** Cover the defined behaviors, not every possible permutation. The goal is confidence that the feature works as specified, not 100% theoretical coverage.

---

## Error Conditions

| Condition | Action |
|-----------|--------|
| `proposal.md` does not exist | Return error: "Cannot generate scenarios: proposal.md not found at `docs/forge/changes/<feature>/proposal.md`" |
| `proposal.md` is empty or has no clear behaviors | Return error: "Cannot generate scenarios: proposal.md contains no identifiable testable behaviors. Ensure it has a feature summary and scope." |
| No P0 scenarios identified | Return error: "Cannot generate scenarios: no core functionality (P0) identified. The proposal may be too vague." |
| More than 40 scenarios generated | Return warning, then trim to top 25 by removing lowest-priority scenarios. Log: "Trimmed from <n> to 25 scenarios. Consider splitting this feature." |

---

## Example

Given a `proposal.md` that describes "Add a bookmark feature to the reading app", the skill might produce:

**scenarios.json (excerpt):**
```json
{
  "version": "1.0",
  "feature": "bookmark-feature",
  "source": "proposal.md",
  "generated_at": "2025-01-15T10:30:00Z",
  "scenarios": [
    {
      "id": "S001",
      "title": "Creates a bookmark on the current page",
      "given": "a user is reading a document on page 5",
      "when": "the user clicks the bookmark button",
      "then": [
        {
          "assertion": "a bookmark is saved for page 5 of the document",
          "type": "state-change"
        },
        {
          "assertion": "the bookmark icon changes to a filled state",
          "type": "result"
        }
      ],
      "testTypes": ["functional", "ui"],
      "priority": "P0"
    },
    {
      "id": "S002",
      "title": "Navigates to a bookmarked page",
      "given": "a user has a bookmark on page 5 of a document",
      "when": "the user selects that bookmark from the bookmarks list",
      "then": [
        {
          "assertion": "the document scrolls to page 5",
          "type": "result"
        }
      ],
      "testTypes": ["functional"],
      "priority": "P0"
    },
    {
      "id": "S003",
      "title": "Removes an existing bookmark",
      "given": "a user has a bookmark on page 5",
      "when": "the user clicks the filled bookmark icon on page 5",
      "then": [
        {
          "assertion": "the bookmark for page 5 is removed",
          "type": "state-change"
        },
        {
          "assertion": "the bookmark icon changes to an unfilled state",
          "type": "result"
        }
      ],
      "testTypes": ["functional", "ui"],
      "priority": "P0"
    },
    {
      "id": "S004",
      "title": "Rejects bookmark when user is not authenticated",
      "given": "a guest user is reading a document",
      "when": "the guest clicks the bookmark button",
      "then": [
        {
          "assertion": "an error message prompts the user to log in",
          "type": "error"
        },
        {
          "assertion": "no bookmark is saved",
          "type": "state-change"
        }
      ],
      "testTypes": ["functional", "ui"],
      "priority": "P1"
    }
  ]
}
```

**scenarios.md (excerpt):**
```markdown
# Scenarios: Bookmark Feature

> Generated from `proposal.md` on 2025-01-15

## Summary

- **Total scenarios:** 4
- **P0 (must work):** 3
- **P1 (should work):** 1
- **P2 (nice to have):** 0

---

## P0 — Must Work

### S001: Creates a bookmark on the current page

| | |
|---|---|
| **Given** | a user is reading a document on page 5 |
| **When** | the user clicks the bookmark button |
| **Then** | a bookmark is saved for page 5 of the document |
| | the bookmark icon changes to a filled state |
| **Type** | functional, ui |

---

### S002: Navigates to a bookmarked page

| | |
|---|---|
| **Given** | a user has a bookmark on page 5 of a document |
| **When** | the user selects that bookmark from the bookmarks list |
| **Then** | the document scrolls to page 5 |
| **Type** | functional |

---

### S003: Removes an existing bookmark

| | |
|---|---|
| **Given** | a user has a bookmark on page 5 |
| **When** | the user clicks the filled bookmark icon on page 5 |
| **Then** | the bookmark for page 5 is removed |
| | the bookmark icon changes to an unfilled state |
| **Type** | functional, ui |

---

## P1 — Should Work

### S004: Rejects bookmark when user is not authenticated

| | |
|---|---|
| **Given** | a guest user is reading a document |
| **When** | the guest clicks the bookmark button |
| **Then** | an error message prompts the user to log in |
| | no bookmark is saved |
| **Type** | functional, ui |

---

## Test Type Coverage

| Type | Count | Scenarios |
|------|-------|-----------|
| functional | 4 | S001, S002, S003, S004 |
| ui | 3 | S001, S003, S004 |
| integration | 0 | — |
| performance | 0 | — |
```
