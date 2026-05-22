---
name: scenarios
description: Generate structured test scenarios from a design spec
---

# Scenarios Skill

Generate structured Given/When/Then test scenarios from a feature design spec.
Called by `start/SKILL.md` after Superpowers brainstorming completes.

---

## Input

| File | Required | Description |
|------|----------|-------------|
| `<spec_path>` (from `.forge/progress.json` field `spec_path`) | **Yes** | Superpowers brainstorming output, typically at `docs/superpowers/specs/YYYY-MM-DD-<feature>-design.md` |
| Mockup HTML | No | Visual mockup if the feature involves UI (path may be referenced inside the spec) |

Read `spec_path` from `.forge/progress.json` to determine where the design lives.
Read the spec file in full before generating scenarios.

---

## Output

| File | Format | Purpose |
|------|--------|---------|
| `.forge/scenarios.json` | JSON | Machine-readable scenarios for downstream automation |

Note: A separate human-readable rendering is NOT generated. The Superpowers spec
is already human-readable; `.forge/scenarios.json` is the structured machine artifact.

For human review during `/start`, the calling skill renders scenarios.json on the fly
in Given/When/Then format — no separate file needed.

---

## Process

### Step 1: Read and Analyze the Spec

1. Read the file at `progress.json.spec_path` in full.
2. Extract:
   - **Feature summary** — what the feature does at a high level
   - **Key decisions** — choices made during brainstorming
   - **Scope boundaries** — what's included and explicitly excluded
   - **Technical constraints** — limitations or requirements that affect behavior
3. If the spec references a mockup HTML path, read that file too. Extract:
   - All interactive elements (buttons, inputs, links, toggles, dropdowns)
   - Visual states (loading, empty, error, success)
   - Navigation flows
   - Responsive breakpoints (if specified)
   - Accessibility attributes (aria labels, roles)

### Step 2: Identify Testable Behaviors

From the spec (and mockup if present), identify every distinct testable behavior:
- A specific user action that produces an observable result
- A system response to a specific input or condition
- A state transition triggered by an event
- An error condition and its expected handling
- A boundary or edge case explicitly mentioned in the scope

**Rules:**
- Each behavior must be independently verifiable
- Do NOT invent behaviors not described or implied by the spec
- DO include error cases and edge cases mentioned in scope boundaries
- DO include implicit behaviors (e.g., if spec says "user can log in" → also include "user cannot log in with wrong password")
- If mockup exists, each interactive element generates at least one behavior
- Group related behaviors logically

### Step 3: Generate Given/When/Then Scenarios

For each behavior, write one scenario:
- **Given**: precondition or initial state
- **When**: action or event
- **Then**: one or more assertions

**Rules:**
- Plain English, not code
- Be specific: "Given a user with email 'test@example.com'" not "Given a user"
- Each `then` assertion tests ONE thing
- No implementation details (no "the database is updated", say "the user appears in the list")
- Independent — no scenario depends on another scenario running first

### Step 4: Assign Test Types

| Type | Use When |
|------|----------|
| `functional` | Core logic, data transformations, business rules, CRUD operations |
| `ui` | Visual rendering, user interactions, layout, responsive behavior, accessibility |
| `integration` | Communication between modules, API calls, database operations, external services |
| `performance` | Response time requirements, load handling, resource limits, pagination |

Every scenario gets at least one test type. A scenario can have multiple types.

### Step 5: Assign Priorities

| Priority | Meaning |
|----------|---------|
| `P0` | Must work — core functionality, happy path. Feature is broken without this. |
| `P1` | Should work — error handling, validation, important alternate flows. |
| `P2` | Nice to have — polish, edge cases, optimizations. |

At least ONE P0 scenario must exist (else error out — spec too vague).

### Step 6: Handle Mockup-Specific Scenarios (if mockup exists)

Generate additional UI-specific scenarios:
1. **Rendering** — each major section/component renders correctly
2. **Interaction** — each button/link/input does what it should
3. **State** — loading, empty, error states display correctly
4. **Responsive** — layout adapts to mobile/tablet/desktop (if breakpoints defined)
5. **Accessibility** — keyboard navigation works, screen reader labels exist

### Step 7: Write scenarios.json

**SCHEMA VALIDATION:** Before writing, reference `schemas/scenarios.schema.json`.
The schema enforces:
- ID pattern: `S\d{3}` (e.g., S001, S002)
- `then[].type` enum: `result | side-effect | state-change | error`
- `testTypes` enum: `functional | ui | integration | performance`
- `priority` enum: `P0 | P1 | P2`
- Title max length: 80 characters
- At least one scenario required

Write to `.forge/scenarios.json`:

```json
{
  "version": "1.0",
  "feature": "<feature-slug>",
  "source": "<spec_path from progress.json>",
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
| `feature` | string | The feature slug |
| `source` | string | Path to the design spec (from `progress.json.spec_path`) |
| `generated_at` | string | ISO-8601 timestamp |
| `scenarios[].id` | string | `S` + zero-padded 3-digit. Sequential from `S001`. |
| `scenarios[].title` | string | Max 80 chars. Starts with verb (e.g., "Creates a new user"). |
| `scenarios[].given` | string | Single precondition statement. |
| `scenarios[].when` | string | Single action statement. |
| `scenarios[].then[].assertion` | string | What should be true after the action. |
| `scenarios[].then[].type` | string | One of: `result` (return value/output), `side-effect` (something else changes), `state-change` (system state transitions), `error` (error is produced). Used downstream by writing-plans to determine test assertion style: `result` → assert return value, `side-effect` → verify external state change, `state-change` → check before/after state, `error` → expect exception or error response. |
| `scenarios[].testTypes` | array | One or more of: `functional`, `ui`, `integration`, `performance`. |
| `scenarios[].priority` | string | One of: `P0`, `P1`, `P2`. |

---

## Validation Rules

Before writing the output file, validate:

1. **Sequential IDs**: `S001`, `S002`, `S003`, ... no gaps, no duplicates.
2. **No duplicate titles**: Every scenario title unique.
3. **At least one P0**: Else error: "no core functionality identified".
4. **Non-empty fields**: `title`, `given`, `when`, `then` non-empty. `then` has at least one assertion.
5. **Valid test types**: Each entry in `testTypes` is one of the four allowed values.
6. **Valid priorities**: One of `P0`, `P1`, `P2`.
7. **Valid assertion types**: One of `result`, `side-effect`, `state-change`, `error`.
8. **Title length**: Max 80 characters.
9. **Reasonable count**: 5–25 scenarios. <5 → spec too narrow. >25 → consider splitting feature.

If validation fails, fix and re-validate before writing.

---

## Important Notes

1. **Scenarios are for TDD, not implementation.** Describe WHAT, not HOW. No database queries, algorithms, class names, or file paths.

2. **Scenarios are the contract.** Once user-confirmed, they're the source of truth for tests. Downstream skills (`next`) use scenarios.json to generate test code.

3. **Scenarios must be falsifiable.** "The system works correctly" is invalid. "The response contains the user's email address" is valid.

4. **Don't over-test.** One scenario per behavior. Merge if Given/When are identical.

5. **Respect scope.** If the spec excludes something, do NOT generate scenarios for it.

6. **Not exhaustive.** Cover defined behaviors, not every theoretical permutation.

---

## Error Conditions

| Condition | Action |
|-----------|--------|
| `progress.json.spec_path` is null or missing | Return error: "spec_path not set in progress.json. Run /start brainstorming first." |
| Spec file at `spec_path` does not exist | Return error: "Spec file not found at `<spec_path>`. Check progress.json." |
| Spec file is empty or has no clear behaviors | Return error: "Spec contains no identifiable testable behaviors." |
| No P0 scenarios identified | Return error: "No core functionality (P0) identified. Spec may be too vague." |
| More than 40 scenarios generated | Warn, trim to top 25 by removing lowest-priority. Log: "Trimmed from <n> to 25." |

---

## Example

Given a spec describing "Add a bookmark feature to the reading app", the skill produces `.forge/scenarios.json`:

```json
{
  "version": "1.0",
  "feature": "bookmark-feature",
  "source": "docs/superpowers/specs/2026-05-21-bookmark-feature-design.md",
  "generated_at": "2026-05-21T10:30:00Z",
  "scenarios": [
    {
      "id": "S001",
      "title": "Creates a bookmark on the current page",
      "given": "a user is reading a document on page 5",
      "when": "the user clicks the bookmark button",
      "then": [
        { "assertion": "a bookmark is saved for page 5 of the document", "type": "state-change" },
        { "assertion": "the bookmark icon changes to a filled state", "type": "result" }
      ],
      "testTypes": ["functional", "ui"],
      "priority": "P0"
    },
    {
      "id": "S002",
      "title": "Rejects bookmark when user is not authenticated",
      "given": "a guest user is reading a document",
      "when": "the guest clicks the bookmark button",
      "then": [
        { "assertion": "an error message prompts the user to log in", "type": "error" },
        { "assertion": "no bookmark is saved", "type": "state-change" }
      ],
      "testTypes": ["functional", "ui"],
      "priority": "P1"
    }
  ]
}
```
