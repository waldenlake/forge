---
name: start
description: Begin a new feature — brainstorm, generate scenarios, get confirmation
---

# /start <requirement>

Begin a new work item (feature, project, or refactor).

## First: Output Brand Header

Before any logic, output:

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  ⚒  F O R G E  v0.1.0               ┃
┃  AI-Driven Development Orchestration  ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

## Pre-Conditions

1. If `<requirement>` is empty (no text after /start):
   → Output: "Please provide a requirement. Example: `/start user authentication with JWT`"
   → STOP.

2. Read `.forge/progress.json`
   - If file exists AND `status` is NOT `"idle"` and NOT `"planning"`:
     → Output: "There is an active feature: **<feature>**. Complete it with `/done` or cancel by deleting `.forge/progress.json`"
     → STOP.
   - If `status` = `"planning"` → allow restart (user wants to redo planning)

3. If `.forge/config.json` does NOT exist:
   → Execute **Auto-Initialization** (below)

---

## Auto-Initialization

Only runs when `.forge/config.json` is missing (first time using Forge).

Output:
```
▸ Phase 1 · Environment Check
```

### Step 1: Detect Project Type

- Check if `.git/` directory exists in project root
  - Exists → `project_type = "existing"`
  - Does not exist → `project_type = "new"`

### Step 2: Check Superpowers

Attempt to verify Superpowers skills are accessible (try loading brainstorming skill).

**If available:**
```
    ✓ Superpowers
```

**If NOT available:**
```
    ✗ Superpowers (required)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠ Superpowers is required but not found.

  Claude Code:
    /plugin install superpowers@claude-plugins-official

  OpenCode:
    "superpowers@git+https://github.com/obra/superpowers.git"

  Install and run /start again.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```
→ STOP. Do not proceed.

### Step 3: Check GitNexus

**If existing project:**
- Check if GitNexus is available
- Available → output: `    ✓ GitNexus`
- Not available → output: `    ⚠ GitNexus (recommended for existing projects)`
  - Continue anyway (non-blocking)

**If new project:**
- Output: `    · GitNexus (not needed for new projects)`

### Step 4: Check gstack

- Check if gstack is available
- Available → output: `    ✓ gstack`
- Not available → output: `    · gstack (optional)`
- Always continue (never blocking)

### Step 5: Detect Test Framework

Scan project files in this order, use FIRST match:

| File | Look For | Result |
|------|----------|--------|
| `package.json` | `vitest` in devDependencies | `"vitest"`, `"npx vitest run"` |
| `package.json` | `jest` in devDependencies | `"jest"`, `"npx jest"` |
| `package.json` | `mocha` in devDependencies | `"mocha"`, `"npx mocha"` |
| `pyproject.toml` or `pytest.ini` | exists | `"pytest"`, `"pytest"` |
| `go.mod` | exists | `"go"`, `"go test ./..."` |
| `Cargo.toml` | exists | `"cargo"`, `"cargo test"` |
| None | — | `"unknown"`, `""` |

Output: `    ✓ Test framework: <name>` (or `    · Test framework: not detected`)

### Step 6: Create Directory Structure

Create (skip existing):
```
docs/forge/specs/
docs/forge/changes/
docs/forge/changes/archive/
docs/forge/decisions/
.forge/
```

### Step 7: Write .forge/config.json

```json
{
  "version": "1.0",
  "test_mode": "normal",
  "gstack_installed": false,
  "batch_size": 6,
  "test_command": "<detected or empty>",
  "test_framework": "<detected or unknown>",
  "test_coverage": { "unit": 80, "integration": 60, "e2e": "P0" },
  "project_type": "<new or existing>"
}
```

### Step 8: Append Forge Section to CLAUDE.md

If `CLAUDE.md` does not exist, create it. Append:

```markdown

## Forge

**Project Info**
- Test mode: normal
- Test framework: <detected>
- Test command: <detected>
- Project type: <new/existing>

**Active Feature:** none
```

### Step 9: Output completion

```
    ✓ Project initialized
```

Then proceed to **Main Flow**.

---

## Main Flow

### 1. Generate Feature Slug

Convert requirement to URL-safe slug:
- Take first meaningful words (ignore "I want to", "add a", etc.)
- Lowercase, replace spaces/special chars with hyphens
- Remove consecutive hyphens, truncate to 40 chars

Examples:
- "user authentication with JWT" → `user-authentication-jwt`
- "Add dark mode support" → `dark-mode-support`

### 2. Create Change Directory

Create: `docs/forge/changes/<feature-slug>/`

If exists (re-run): warn "Directory exists. Overwriting planning artifacts." and continue.

### 3. Write .forge/progress.json

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
  "verification": { "status": "pending", "test_mode": "normal", "last_run": null }
}
```

### 4. Brainstorming

Output:
```
▸ Phase 2 · Brainstorming
    → Clarifying requirements...
```

**Use the Superpowers `brainstorming` skill.**

- Input: user's requirement + any referenced files
- Clarify uncertainties through Socratic dialogue (one question at a time)
- If UI involved, offer HTML mockup
- If spans >3 independent domains, suggest splitting
- Focus on WHAT, not HOW

Write result to: `docs/forge/changes/<feature-slug>/proposal.md`

After brainstorming completes, output:
```
    ✓ Requirements clarified
    ✓ proposal.md written
```

### 5. Generate Scenarios

Output:
```
▸ Phase 3 · Scenarios
    → Generating test scenarios...
```

**Use the Forge `scenarios` skill.**

Reads proposal.md (+ mockup.html if exists), produces:
- `scenarios.json` — machine-readable
- `scenarios.md` — human-readable

After completion, output:
```
    ✓ <N> scenarios generated (<P0> P0, <P1> P1, <P2> P2)
    ✓ scenarios.json written
    ✓ scenarios.md written
```

### 6. Present to User

Output:
```
▸ Ready for Review
```

Then display:
1. Proposal summary (2-4 sentences from proposal.md)
2. Full scenarios.md content
3. Prompt:

```
    Review complete. You can:
    • /next — confirm and begin planning
    • Edit scenarios in docs/forge/changes/<slug>/scenarios.md
    • Ask me to modify specific scenarios
    • /start <new requirement> — start over
```

### 7. Update Progress

Set `phase` to `"awaiting_confirmation"` in progress.json.
Update `updated_at`.

### 8. Wait

**STOP.** Do not proceed until user acts.

---

## Special Case: Re-running /start During Planning

If progress.json has `status: "planning"` (any phase):
- Allow it — user wants to restart
- Overwrite progress.json, continue with Main Flow
- Do NOT error out

## Error Handling

| Condition | Response |
|-----------|----------|
| Empty requirement | "Please provide a requirement. Example: `/start user authentication with JWT`" |
| Referenced file not found | "File not found: `<path>`. Check path and try again." |
| Brainstorming produces no output | "Brainstorming didn't converge. Provide more detail." |
| Scenario generation fails | "Failed to generate scenarios. Check proposal.md completeness." |
| Directory creation fails | "Could not create directory. Check permissions." |

---

## File Artifacts Produced

```
.forge/config.json           ← (first run only)
.forge/progress.json         ← status: planning, phase: awaiting_confirmation
CLAUDE.md                    ← Forge section (first run only)
docs/forge/changes/<slug>/
  proposal.md                ← Brainstorming output
  scenarios.json             ← Structured scenarios
  scenarios.md               ← Rendered scenarios
  mockup.html                ← (optional, if UI)
```

## Dependencies

- **Superpowers: brainstorming** — requirement clarification
- **Forge: scenarios** — scenario generation
