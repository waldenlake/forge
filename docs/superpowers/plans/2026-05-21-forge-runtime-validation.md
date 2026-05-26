# Forge Runtime Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add three runtime safety nets — JSON Schemas, lazy test detection, /done self-verification — to make Forge resilient to AI compliance gaps.

**Architecture:** Three independent components. Each can be added/used independently. No code changes — pure markdown skill updates plus three new JSON Schema files.

**Tech Stack:** JSON Schema Draft-07, Markdown (SKILL.md)

---

## File Structure

```
schemas/                                  # NEW
  progress.schema.json
  config.schema.json
  scenarios.schema.json

skills/start/SKILL.md                     # Reference config schema
skills/scenarios/SKILL.md                 # Reference scenarios schema
skills/progress-tracking/SKILL.md         # Lazy test detection + progress schema
skills/done/SKILL.md                      # Self-verification step
skills/next/SKILL.md                      # Reference progress schema
skills/resume/SKILL.md                    # Reference progress schema
skills/bugfix/SKILL.md                    # Reference progress schema
```

---

### Task 1: Create progress.schema.json

**Files:**
- Create: `schemas/progress.schema.json`

- [ ] **Step 1: Write the schema**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Forge Progress",
  "type": "object",
  "required": ["version", "feature", "status", "tasks", "guard_history"],
  "properties": {
    "version": { "type": "string", "const": "1.0" },
    "feature": { "type": ["string", "null"] },
    "status": {
      "type": "string",
      "enum": ["idle", "planning", "executing", "verification_complete", "bugfix"]
    },
    "created_at": { "type": ["string", "null"], "format": "date-time" },
    "updated_at": { "type": "string", "format": "date-time" },
    "spec_path": { "type": ["string", "null"] },
    "plan_path": { "type": ["string", "null"] },
    "total_tasks": { "type": "integer", "minimum": 0 },
    "completed_tasks": { "type": "integer", "minimum": 0 },
    "tasks": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "title", "status"],
        "properties": {
          "id": { "type": "integer", "minimum": 1 },
          "title": { "type": "string", "minLength": 1 },
          "status": {
            "type": "string",
            "enum": ["pending", "in_progress", "done", "failed", "deferred"]
          },
          "commit": { "type": "string" },
          "started_at": { "type": "string", "format": "date-time" },
          "completed_at": { "type": "string", "format": "date-time" }
        }
      }
    },
    "guard_history": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "type", "triggered_at", "status"],
        "properties": {
          "id": { "type": "string", "pattern": "^guard-\\d+$" },
          "type": { "type": "string" },
          "triggered_at": { "type": "string", "format": "date-time" },
          "task_range": {
            "type": "array",
            "items": { "type": "integer" },
            "minItems": 2,
            "maxItems": 2
          },
          "status": {
            "type": "string",
            "enum": ["passed", "failed", "skipped"]
          },
          "notes": { "type": "string" }
        }
      }
    },
    "verification": {
      "type": "object",
      "properties": {
        "status": {
          "type": "string",
          "enum": ["pending", "in_progress", "passed", "failed"]
        },
        "test_mode": { "type": "string", "enum": ["normal", "enhanced"] },
        "last_run": { "type": ["string", "null"], "format": "date-time" },
        "report_path": { "type": ["string", "null"] }
      }
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add schemas/progress.schema.json
git commit -m "feat(schemas): add progress.json schema with strict enum validation"
```

---

### Task 2: Create config.schema.json

**Files:**
- Create: `schemas/config.schema.json`

- [ ] **Step 1: Write the schema**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Forge Config",
  "type": "object",
  "required": ["version", "memory_file", "test_mode", "project_type"],
  "properties": {
    "version": { "type": "string", "const": "1.0" },
    "memory_file": {
      "type": "string",
      "enum": ["CLAUDE.md", "AGENTS.md", "GEMINI.md"]
    },
    "test_mode": {
      "type": "string",
      "enum": ["normal", "enhanced"]
    },
    "gstack_installed": { "type": "boolean" },
    "test_command": { "type": "string" },
    "test_framework": { "type": "string" },
    "test_coverage": {
      "type": "object",
      "properties": {
        "unit": { "type": "integer", "minimum": 0, "maximum": 100 },
        "integration": { "type": "integer", "minimum": 0, "maximum": 100 },
        "e2e": { "type": "string", "enum": ["P0", "P0+P1", "all"] }
      }
    },
    "project_type": {
      "type": "string",
      "enum": ["new", "existing"]
    },
    "guards": {
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "required": ["enabled", "actions"],
        "properties": {
          "enabled": { "type": "boolean" },
          "every_n_tasks": { "type": "integer", "minimum": 1 },
          "actions": {
            "type": "array",
            "items": { "type": "string" }
          }
        }
      }
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add schemas/config.schema.json
git commit -m "feat(schemas): add config.json schema"
```

---

### Task 3: Create scenarios.schema.json

**Files:**
- Create: `schemas/scenarios.schema.json`

- [ ] **Step 1: Write the schema**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Forge Scenarios",
  "type": "object",
  "required": ["version", "feature", "source", "generated_at", "scenarios"],
  "properties": {
    "version": { "type": "string", "const": "1.0" },
    "feature": { "type": "string" },
    "source": { "type": "string" },
    "generated_at": { "type": "string", "format": "date-time" },
    "scenarios": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["id", "title", "given", "when", "then", "testTypes", "priority"],
        "properties": {
          "id": { "type": "string", "pattern": "^S\\d{3}$" },
          "title": { "type": "string", "minLength": 1, "maxLength": 80 },
          "given": { "type": "string", "minLength": 1 },
          "when": { "type": "string", "minLength": 1 },
          "then": {
            "type": "array",
            "minItems": 1,
            "items": {
              "type": "object",
              "required": ["assertion", "type"],
              "properties": {
                "assertion": { "type": "string", "minLength": 1 },
                "type": {
                  "type": "string",
                  "enum": ["result", "side-effect", "state-change", "error"]
                }
              }
            }
          },
          "testTypes": {
            "type": "array",
            "minItems": 1,
            "items": {
              "type": "string",
              "enum": ["functional", "ui", "integration", "performance"]
            }
          },
          "priority": {
            "type": "string",
            "enum": ["P0", "P1", "P2"]
          }
        }
      }
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add schemas/scenarios.schema.json
git commit -m "feat(schemas): add scenarios.json schema with strict enum validation"
```

---

### Task 4: Add schema reference to start/SKILL.md

**Files:**
- Modify: `skills/start/SKILL.md`

- [ ] **Step 1: Add validation note before Step 7 (Write .forge/config.json)**

Insert this paragraph just before the "### Step 7: Write .forge/config.json" heading:

```markdown
**SCHEMA VALIDATION:** Before writing any JSON file in this skill, reference
`schemas/config.schema.json` (in the Forge plugin directory) for the exact
allowed structure. Required fields, enum values, and types are strictly defined
there. Writing a value not allowed by the schema produces a file other Forge
skills cannot read.
```

- [ ] **Step 2: Add validation note before Step 3 (Write .forge/progress.json) of Main Flow**

Insert just before "### 3. Write .forge/progress.json":

```markdown
**SCHEMA VALIDATION:** Reference `schemas/progress.schema.json` for the exact
allowed structure. Status enum, task status enum, and required fields are
strictly defined.
```

- [ ] **Step 3: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "feat(start): reference config and progress schemas before writes"
```

---

### Task 5: Add schema reference to scenarios/SKILL.md

**Files:**
- Modify: `skills/scenarios/SKILL.md`

- [ ] **Step 1: Add validation note before "### Step 7: Write scenarios.json"**

Insert:

```markdown
**SCHEMA VALIDATION:** Before writing, reference `schemas/scenarios.schema.json`.
The schema enforces:
- ID pattern: `S\d{3}` (e.g., S001, S002)
- `then[].type` enum: `result | side-effect | state-change | error`
- `testTypes` enum: `functional | ui | integration | performance`
- `priority` enum: `P0 | P1 | P2`
- Title max length: 80 characters
- At least one scenario required
```

- [ ] **Step 2: Commit**

```bash
git add skills/scenarios/SKILL.md
git commit -m "feat(scenarios): reference scenarios.schema.json before write"
```

---

### Task 6: Update progress-tracking/SKILL.md — Lazy detection + schema reference

**Files:**
- Modify: `skills/progress-tracking/SKILL.md`

- [ ] **Step 1: Replace Step 1 (Determine Test Command) with lazy detection**

Find the existing "### Step 1: Determine Test Command" section and replace with:

```markdown
### Step 1: Determine Test Command (Lazy Detection)

**Always re-detect if the cached command is empty.** This handles cases where
init ran before project files (e.g., go.mod) existed.

1. Read `.forge/config.json` → `test_command` field.
2. If non-empty AND the file features that produced it still exist:
   - Use that command.
3. Otherwise (empty OR mismatch), re-detect from project files:

| File | Condition | Command |
|------|-----------|---------|
| `package.json` | has `scripts.test` | `npm test` |
| `pyproject.toml` or `pytest.ini` | exists | `pytest` |
| `go.mod` | exists | `go test ./...` |
| `Cargo.toml` | exists | `cargo test` |

4. If detection succeeds:
   - Update `.forge/config.json.test_command` with the new value
   - Update `.forge/config.json.test_framework` accordingly
   - Use the new command

5. If nothing detected → WARN: "No test command found. Skipping test verification."
   Proceed to Step 3 (commit without test verification).
```

- [ ] **Step 2: Add schema validation note before Step 4 (Update progress.json)**

Insert before "### Step 4: Update progress.json":

```markdown
**SCHEMA VALIDATION:** Before updating `.forge/progress.json`, reference
`schemas/progress.schema.json`. The task status enum is strict:
`pending | in_progress | done | failed | deferred`. Writing any other value
breaks downstream skills.
```

- [ ] **Step 3: Add schema validation note for guard_history (Step 5)**

Find the JSON example for guard_history entry in Step 5. Insert above it:

```markdown
**SCHEMA VALIDATION:** Reference `schemas/progress.schema.json` for guard_history
entry format. Guard status enum: `passed | failed | skipped`. ID pattern: `guard-N`.
```

- [ ] **Step 4: Commit**

```bash
git add skills/progress-tracking/SKILL.md
git commit -m "feat(progress-tracking): lazy test command detection, schema references"
```

---

### Task 7: Add self-verification to done/SKILL.md

**Files:**
- Modify: `skills/done/SKILL.md`

- [ ] **Step 1: Add new Step 2.5 between current Step 2 and Step 3**

Find "### Step 3: Clean progress.json" and insert before it:

```markdown
### Step 2.5: Verify Memory File Update

Read the memory file again (filename from `.forge/config.json.memory_file`).
Search the file for the entry just added: "<feature-slug> (<YYYY-MM-DD>)" under
the "Completed Features" section.

**If the entry is NOT present:**
- Output: `    ⚠ Memory file update did not land. Re-attempting...`
- Re-execute Step 2 (write Completed Features entry)
- Read the file again to verify
- If still missing → ERROR:
  ```
  Cannot update <memory_file>: write attempted twice but entry not found.
  Possible causes:
  - File permissions issue
  - Wrong file path (memory_file mismatch with actual platform file)
  - File locked by another process
  Check the file manually and re-run /done.
  ```
- STOP. Do NOT proceed to Step 3.

**If the entry IS present:**
- Output: `    ✓ Memory file verified`
- Proceed to Step 3.

This read-after-write check catches silent failures: skipped writes, wrong
filenames, permission errors, etc. Without it, /done can claim success while
leaving stale state.
```

- [ ] **Step 2: Add schema validation reference**

Insert at the top of "## Main Flow" section:

```markdown
**SCHEMA VALIDATION:** All progress.json updates in this skill must conform to
`schemas/progress.schema.json`. Status enum: `idle | planning | executing |
verification_complete | bugfix`.
```

- [ ] **Step 3: Commit**

```bash
git add skills/done/SKILL.md
git commit -m "feat(done): add memory file self-verification, schema reference"
```

---

### Task 8: Add schema references to next, resume, bugfix

**Files:**
- Modify: `skills/next/SKILL.md`
- Modify: `skills/resume/SKILL.md`
- Modify: `skills/bugfix/SKILL.md`

- [ ] **Step 1: Add to next/SKILL.md**

Insert at the top of "## Read State" section:

```markdown
**SCHEMA VALIDATION:** All progress.json reads/writes in this skill must conform
to `schemas/progress.schema.json`. Strict enums for status, task status, guard
status. Reference the schema before writing.
```

- [ ] **Step 2: Add to resume/SKILL.md**

Insert at the top of "## Pre-Conditions" section:

```markdown
**SCHEMA VALIDATION:** Reference `schemas/progress.schema.json` when reading
or writing progress.json. If the file fails schema validation, treat it as
corrupted and follow the recovery flow.
```

- [ ] **Step 3: Add to bugfix/SKILL.md**

Insert at the top of "## Main Flow" section:

```markdown
**SCHEMA VALIDATION:** progress.json writes must conform to
`schemas/progress.schema.json`. Use status `bugfix` for bug fix sessions.
Task status enum: `pending | in_progress | done | failed | deferred`.
```

- [ ] **Step 4: Commit**

```bash
git add skills/next/SKILL.md skills/resume/SKILL.md skills/bugfix/SKILL.md
git commit -m "feat: add schema validation references to next, resume, bugfix"
```

---

### Task 9: Document schemas in README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add schemas section after "## Requirements"**

Insert:

```markdown
## State File Schemas

Forge's state files conform to JSON Schemas in the `schemas/` directory:

- `schemas/progress.schema.json` — `.forge/progress.json` structure
- `schemas/config.schema.json` — `.forge/config.json` structure
- `schemas/scenarios.schema.json` — `.forge/scenarios.json` structure

These define exact required fields, enum values, and types. Forge skills
reference these schemas before writing JSON files. If you edit state files
manually, validate against the schemas to ensure Forge can read them.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document JSON schemas in README"
```

---

### Task 10: Push and verify

- [ ] **Step 1: Verify all schema references**

```bash
grep -rn "SCHEMA VALIDATION" skills/
```

Expected: matches in start, scenarios, progress-tracking, done, next, resume, bugfix.

- [ ] **Step 2: Verify schemas exist**

```bash
ls schemas/
```

Expected: `progress.schema.json`, `config.schema.json`, `scenarios.schema.json`.

- [ ] **Step 3: Push**

```bash
git push
```

---

## Self-Review

**Spec coverage:**
- Component 1 (JSON Schemas) → Tasks 1, 2, 3 + Tasks 4-8 (references) ✓
- Component 2 (Lazy test detection) → Task 6 ✓
- Component 3 (/done self-verification) → Task 7 ✓
- Documentation → Task 9 ✓

**Placeholder check:** No "TBD" — every step has concrete instructions ✓

**Type consistency:** Schema enums match across schemas and references ✓
