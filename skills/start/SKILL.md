---
name: start
description: Begin a new feature — brainstorm, generate scenarios, get confirmation
---

# /start <requirement>

Begin a new work item (feature, project, or refactor).

## Pre-Conditions

1. Read `.forge/progress.json`
2. If file exists AND `status` ≠ `"idle"`:
   → **ERROR**: respond with:
   > "There is an active feature: **<feature>**. Complete it with `/done` or cancel by deleting `.forge/progress.json`"
   → STOP. Do not proceed.
3. If `.forge/config.json` does NOT exist:
   → Execute **Auto-Initialization** (see below), then continue.

---

## Auto-Initialization

Only runs when `.forge/config.json` is missing (first time using Forge in this project).

### Step 1: Detect Project Type

- Check if `.git/` directory exists in project root
  - Exists → `project_type = "existing"`
  - Does not exist → `project_type = "new"`

### Step 2: Check Superpowers Available

- Attempt to verify Superpowers skills are accessible (brainstorming, writing-plans, subagent-driven-development)
- If Superpowers is NOT available:
  → **ERROR**: respond with:
  > "Forge requires Superpowers. Install it first."
  → STOP.

### Step 3: Detect Test Framework

Scan project files in this order and use the FIRST match:

| File | Look For | Result |
|------|----------|--------|
| `package.json` | `vitest` in devDependencies/dependencies | `test_framework: "vitest"`, `test_command: "npx vitest run"` |
| `package.json` | `jest` in devDependencies/dependencies | `test_framework: "jest"`, `test_command: "npx jest"` |
| `package.json` | `mocha` in devDependencies/dependencies | `test_framework: "mocha"`, `test_command: "npx mocha"` |
| `pyproject.toml` or `pytest.ini` | pytest config present | `test_framework: "pytest"`, `test_command: "pytest"` |
| `go.mod` | file exists | `test_framework: "go"`, `test_command: "go test ./..."` |
| `Cargo.toml` | file exists | `test_framework: "cargo"`, `test_command: "cargo test"` |
| None of above | — | `test_framework: "unknown"`, `test_command: ""` |

### Step 4: Create Directory Structure

Create these directories (skip any that already exist):

```
docs/forge/specs/
docs/forge/changes/
docs/forge/changes/archive/
docs/forge/decisions/
.forge/
```

### Step 5: Write `.forge/config.json`

```json
{
  "version": "1.0",
  "test_mode": "normal",
  "gstack_installed": false,
  "batch_size": 6,
  "test_command": "<detected or empty string>",
  "test_framework": "<detected or 'unknown'>",
  "test_coverage": {
    "unit": 80,
    "integration": 60,
    "e2e": "P0"
  },
  "project_type": "<'new' or 'existing'>"
}
```

### Step 6: Append Forge Section to CLAUDE.md

If `CLAUDE.md` does not exist at the project root, create it.
Append the following section (do NOT overwrite existing content):

```markdown

## Forge

**Project Info**
- Test mode: normal
- Test framework: <detected framework>
- Test command: <detected command>
- Project type: <new/existing>

**Active Feature:** none

**Decisions:** (none yet)
```

### Step 7: Confirm

Output to user:
> "✓ Forge initialized. Continuing with /start..."

Then proceed to **Main Flow**.

---

## Main Flow

### 1. Generate Feature Slug

Convert the requirement into a URL-safe slug:
- Take the first meaningful words (ignore filler like "I want to", "add a")
- Lowercase all characters
- Replace spaces and special characters with hyphens
- Remove consecutive hyphens
- Truncate to max 40 characters
- Remove trailing hyphens

**Examples:**
- "user authentication with JWT" → `user-authentication-jwt`
- "Add dark mode support to the settings page" → `dark-mode-settings`
- "I want to build a real-time chat system" → `real-time-chat-system`

### 2. Create Change Directory

Create the directory:
```
docs/forge/changes/<feature-slug>/
```

If this directory already exists (e.g., user re-running /start with same feature):
- Warn: "Directory already exists. Overwriting previous planning artifacts."
- Continue (do not delete existing files, but overwrite proposal.md and scenarios files)

### 3. Write `.forge/progress.json`

Write the following to `.forge/progress.json`:

```json
{
  "version": "1.0",
  "feature": "<feature-slug>",
  "status": "planning",
  "phase": "brainstorming",
  "created_at": "<ISO-8601 timestamp>",
  "updated_at": "<ISO-8601 timestamp>",
  "total_batches": 0,
  "current_batch": 0,
  "batches": [],
  "verification": {
    "status": "pending",
    "test_mode": "normal",
    "last_run": null
  }
}
```

Use the current date/time for `created_at` and `updated_at`.

### 4. Brainstorming

**Use the Superpowers `brainstorming` skill.**

Activate the skill and provide:
- The user's original requirement as the starting point
- Any file paths referenced in the requirement (read those files first for context)

During brainstorming:
- Clarify all uncertainties through Socratic dialogue (ask one question at a time)
- If the requirement involves UI, offer to create a visual HTML mockup
- If the requirement spans more than 3 independent domains, suggest splitting into multiple `/start` invocations
- Keep the conversation focused on WHAT, not HOW (implementation comes later)

**Output:** Write the brainstorming result to:
```
docs/forge/changes/<feature-slug>/proposal.md
```

The proposal.md should contain:
- Feature summary (1-2 paragraphs)
- Key decisions made during brainstorming
- Scope boundaries (what's included and explicitly excluded)
- Technical constraints identified
- If UI mockup was created: save as `docs/forge/changes/<feature-slug>/mockup.html`

### 5. Generate Scenarios

**Use the Forge `scenarios` skill.**

This skill reads proposal.md (and mockup.html if it exists) and produces:
- `docs/forge/changes/<feature-slug>/scenarios.json` — machine-readable structured scenarios
- `docs/forge/changes/<feature-slug>/scenarios.md` — human-readable rendered scenarios

Each scenario follows Given/When/Then format with:
- Unique sequential ID
- Descriptive title
- Test type classification (functional, ui, integration, performance)
- Priority assignment (P0, P1, P2)

### 6. Present to User

Display to the user:

1. **Proposal summary** — the key points from proposal.md (2-4 sentences)
2. **Scenarios** — render scenarios.md content so the user can read all scenarios
3. **Prompt:**
   > "Do these scenarios accurately describe your requirements? You can:
   > - Say `/next` to confirm and begin planning
   > - Edit the scenarios directly in `docs/forge/changes/<feature-slug>/scenarios.md`
   > - Ask me to add/remove/modify specific scenarios
   > - Re-run `/start` with a refined requirement to start over"

### 7. Update Progress

Update `.forge/progress.json`:
- Set `phase` to `"awaiting_confirmation"`
- Update `updated_at` to current ISO-8601 timestamp

### 8. Wait

**STOP here.** Do not proceed further.

The user will either:
- Run `/next` → the `next` skill takes over (planning → execution)
- Edit scenarios and run `/next` → same as above, using edited scenarios
- Re-run `/start <new requirement>` → this skill runs again from the top (progress.json has status "planning" which is ≠ "idle", but since we are in planning phase and user explicitly re-invoked /start, overwrite is allowed — treat as a restart)

---

## Special Case: Re-running /start During Planning

If `.forge/progress.json` exists with `status: "planning"` (any phase):
- This means the user wants to restart planning from scratch
- **Allow it** — overwrite progress.json and continue with Main Flow
- Do NOT error out (the error is only for status values other than "idle" or "planning")

## Error Handling

| Condition | Response |
|-----------|----------|
| Empty requirement (no text after /start) | "Please provide a requirement. Example: `/start user authentication with JWT`" |
| File referenced in requirement not found | "File not found: `<path>`. Please check the path and try again." |
| Brainstorming produces no clear output | "Brainstorming didn't converge on a clear proposal. Please provide more detail about what you want to build." |
| Scenario generation fails | "Failed to generate scenarios. Check `proposal.md` for completeness and try `/start` again." |
| Directory creation fails | "Could not create directory structure. Check file system permissions." |

---

## File Artifacts Produced

After successful completion of /start, the following files exist:

```
.forge/config.json           ← (only on first run, auto-init)
.forge/progress.json         ← status: planning, phase: awaiting_confirmation
CLAUDE.md                    ← Forge section appended (only on first run)
docs/forge/changes/<slug>/
  proposal.md                ← Brainstorming output
  scenarios.json             ← Structured scenarios (machine-readable)
  scenarios.md               ← Rendered scenarios (human-readable)
  mockup.html                ← (optional, only if UI involved)
```

---

## Dependencies

This skill uses:
- **Superpowers: brainstorming** — for requirement clarification and proposal generation
- **Forge: scenarios** — for structured scenario generation from the proposal
