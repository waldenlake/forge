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

Superpowers can reach you through two channels in different IDEs:

1. **Skill discovery** — `skill` tool lists `brainstorming`, `writing-plans`, etc.
2. **Plugin bootstrap** — Superpowers plugin injects an `<EXTREMELY_IMPORTANT>`
   bootstrap block into the conversation (OpenCode runs Superpowers this way).

Treat Superpowers as available if **any** of the following holds:

- The current system/user context already contains the marker
  `<EXTREMELY_IMPORTANT>` and the word "superpowers" (the plugin injected
  bootstrap, AI can use the skills directly).
- The `skill` tool can load the `brainstorming` skill (Claude Code path).
- A SKILL.md exists at any of these locations:
  - `~/.config/opencode/plugins/superpowers/skills/brainstorming/SKILL.md`
  - `~/.config/opencode/skills/brainstorming/SKILL.md`
  - `~/.claude/skills/brainstorming/SKILL.md`
  - `~/.claude/plugins/superpowers/skills/brainstorming/SKILL.md`

Run the file-system checks with the `bash` tool (works on Linux/macOS and on
Windows with Git Bash) or with `Test-Path` in PowerShell.

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
    git clone https://github.com/obra/superpowers.git \
      ~/.config/opencode/plugins/superpowers

  Install and run /start again.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```
→ STOP. Do not proceed.

### Step 3: Check GitNexus

**If existing project:**

1. Check if GitNexus CLI is available: run `gitnexus --version` or check if `gitnexus` command exists
2. Alternatively, check if a gitnexus MCP server is configured in the project
3. If available:
   - Output: `    ✓ GitNexus`
4. If NOT available:
   - Output: `    ⚠ GitNexus (recommended for existing projects)`
   - Note: "Install GitNexus for codebase analysis: npm install -g @gitnexus/cli"
   - Continue (non-blocking)

**If new project:**
- Output: `    · GitNexus (not needed for new projects)`

### Step 4: Check gstack

gstack is optional. Treat it as available if **any** of:

- The `skill` tool can list a `gstack` or `gstack-qa` skill.
- A SKILL.md exists at any of:
  - `~/.config/opencode/plugins/gstack/skills/qa/SKILL.md`
  - `~/.config/opencode/skills/gstack/SKILL.md`
  - `~/.claude/skills/gstack/SKILL.md` (any sub-skill is fine)

1. If available:
   - Output: `    ✓ gstack`
   - Set `gstack_installed: true` in config
2. If NOT available:
   - Output: `    · gstack (optional)`
   - Set `gstack_installed: false` in config
   - Always continue (never blocking)

### Step 5: Detect Test Framework

Scan project files in this order, use FIRST match:

| File | Look For | Result |
|------|----------|--------|
| `package.json` | `vitest` in devDependencies | `"vitest"`, `"npx vitest run"` |
| `package.json` | `jest` in devDependencies | `"jest"`, `"npx jest"` |
| `package.json` | `mocha` in devDependencies | `"mocha"`, `"npx mocha"` |
| `package.json` | `ava` in devDependencies | `"ava"`, `"npx ava"` |
| `package.json` | `scripts.test` exists (any value) | extract framework name from command, use `"npm test"` as command |
| `pyproject.toml` or `pytest.ini` | exists | `"pytest"`, `"pytest"` |
| `setup.py` or `setup.cfg` | exists (no pytest) | `"unittest"`, `"python -m unittest discover"` |
| `go.mod` | exists | `"go"`, `"go test ./..."` |
| `Cargo.toml` | exists | `"cargo"`, `"cargo test"` |
| `Gemfile` | `rspec` present | `"rspec"`, `"bundle exec rspec"` |
| `Rakefile` or `test/` dir | exists | `"minitest"`, `"bundle exec rake test"` |
| `phpunit.xml` or `phpunit.xml.dist` | exists | `"phpunit"`, `"./vendor/bin/phpunit"` |
| `pom.xml` or `build.gradle` | exists | `"junit"`, `"mvn test"` or `"gradle test"` |
| None | — | `"unknown"`, `""` |

Output: `    ✓ Test framework: <name>` (or `    · Test framework: not detected`)

### Step 6: Create Directory Structure

Create (skip existing):
```
.forge/
.forge/specs/
```

Note: `docs/superpowers/specs/` and `docs/superpowers/plans/` are created by
Superpowers when needed. Forge does not pre-create them.

### Step 7: Write .forge/config.json

**SCHEMA VALIDATION:** Before writing, reference `schemas/config.schema.json`
(in the Forge plugin directory). Required fields, enum values, and types are
strictly defined there. Writing a value not allowed by the schema produces a
file other Forge skills cannot read.

```json
{
  "version": "1.0",
  "memory_file": "<detected filename from Step 8>",
  "test_mode": "normal",
  "gstack_installed": false,
  "test_command": "<detected or empty>",
  "test_framework": "<detected or unknown>",
  "test_coverage": { "unit": 80, "integration": 60, "e2e": "P0" },
  "project_type": "<new or existing>",
  "guards": {
    "batch-review": {
      "enabled": true,
      "every_n_tasks": 6,
      "actions": ["spec-compliance-review"]
    }
  }
}
```

### Step 8: Detect and Initialize Memory File

Detect which memory file the current platform uses:

1. **Check existing files (priority order):**
   - `CLAUDE.md` exists → use `CLAUDE.md`
   - `AGENTS.md` exists → use `AGENTS.md`
   - `GEMINI.md` exists → use `GEMINI.md`

2. **If none exist, detect platform:**
   - `CLAUDE_PLUGIN_ROOT` env var set → `CLAUDE.md`
   - OpenCode detected → `AGENTS.md`
   - Codex detected → `AGENTS.md`
   - Gemini CLI detected → `GEMINI.md`
   - Fallback → `AGENTS.md` (most universal)

3. **Record the chosen filename** to `.forge/config.json` field `memory_file`.

4. **If the memory file does not exist, create it.**

5. **Append the Forge section** (do NOT overwrite existing content):

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

### 2. Initialize Feature State

Forge does NOT create a `docs/forge/changes/<slug>/` directory.

Documents will be written by Superpowers to:
- `docs/superpowers/specs/YYYY-MM-DD-<feature-slug>-design.md` (brainstorming output)
- `docs/superpowers/plans/YYYY-MM-DD-<feature-slug>.md` (writing-plans output)

Forge stores its state in `.forge/` (config.json, progress.json, scenarios.json).

### 3. Write .forge/progress.json

**SCHEMA VALIDATION:** Reference `schemas/progress.schema.json` for the exact
allowed structure. Status enum: `idle | planning | executing | verification_complete | bugfix`.
Task status enum: `pending | in_progress | done | failed | deferred`.

```json
{
  "version": "1.0",
  "feature": "<feature-slug>",
  "status": "planning",
  "created_at": "<ISO-8601>",
  "updated_at": "<ISO-8601>",
  "spec_path": null,
  "plan_path": null,
  "total_tasks": 0,
  "completed_tasks": 0,
  "tasks": [],
  "guard_history": [],
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

**Output:** Superpowers writes the design to:
```
docs/superpowers/specs/YYYY-MM-DD-<feature-slug>-design.md
```

**Capture this path** and update `.forge/progress.json` field `spec_path` with it.

After brainstorming completes, output:
```
    ✓ Design spec written: <path>
```

### 5. Generate Scenarios

Output:
```
▸ Phase 3 · Scenarios
    → Generating test scenarios...
```

**Use the Forge `scenarios` skill.**

Input: the spec path captured from Step 4 (read from `progress.json.spec_path`).
Output: `.forge/scenarios.json` (machine-readable structured scenarios).

After completion, output:
```
    ✓ <N> scenarios generated (<P0> P0, <P1> P1, <P2> P2)
    ✓ scenarios.json written
```

### 6. Present to User

Output:
```
▸ Ready for Review
```

Then display:
1. Spec summary (2-4 sentences from the design spec at `progress.json.spec_path`)
2. Render `.forge/scenarios.json` as readable Given/When/Then format for review
3. Prompt:

```
    Review complete. You can:
    • /next — confirm and begin planning
    • Edit scenarios in .forge/scenarios.json
    • Edit spec at <progress.json.spec_path>
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
| Scenario generation fails | "Failed to generate scenarios. Check the design spec for completeness." |
| Directory creation fails | "Could not create directory. Check permissions." |

---

## File Artifacts Produced

```
.forge/config.json                                        ← (first run only)
.forge/progress.json                                      ← status: planning
.forge/scenarios.json                                     ← Structured scenarios
<memory_file>                                             ← Forge section (first run only)
docs/superpowers/specs/YYYY-MM-DD-<slug>-design.md        ← Brainstorming output (Superpowers)
```

## Dependencies

- **Superpowers: brainstorming** — requirement clarification, writes to `docs/superpowers/specs/`
- **Forge: scenarios** — scenario generation, writes to `.forge/scenarios.json`
