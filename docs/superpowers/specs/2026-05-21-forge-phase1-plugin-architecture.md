# Forge Phase 1 Design: Pure Plugin Architecture

## Overview

Forge is an AI-driven software development orchestration plugin. It installs
through each AI platform's native plugin system (like Superpowers does) and
provides structured workflows via skills. No independent CLI required.

## Core Decision

**Forge is a plugin, not a CLI tool.**

- Installed via platform-native mechanisms (`/plugin install`, opencode.json, etc.)
- Skills live inside the plugin package, discovered via SessionStart hook
- Project-level data (`.forge/`, `docs/forge/`) created automatically on first `/start`
- No `npx forge init`, no separate CLI package

## Phase 1 Scope

Deliver a working Claude Code plugin with:
- SessionStart hook + meta-skill injection
- 5 user-facing skills (/start, /next, /resume, /done, /bugfix)
- 3 internal skills (scenarios, progress-tracking, session-handoff)
- Cross-platform hook infrastructure (Windows + Unix)
- OpenCode basic support (INSTALL.md + plugin config)

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  User (AI Chat)                       │
│    /start → /next → /resume → /done → /bugfix       │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│         Forge Plugin (platform-managed install)       │
│                                                       │
│  hooks/                                               │
│    hooks.json          ← SessionStart configuration  │
│    run-hook.cmd        ← Polyglot wrapper (Win+Unix) │
│    session-start       ← Inject using-forge content  │
│                                                       │
│  skills/                                              │
│    using-forge/SKILL.md    ← Meta-skill (injected)   │
│    start/SKILL.md          ← /start command          │
│    next/SKILL.md           ← /next command           │
│    resume/SKILL.md         ← /resume command         │
│    done/SKILL.md           ← /done command           │
│    bugfix/SKILL.md         ← /bugfix command         │
│    scenarios/SKILL.md      ← Internal: scenario gen  │
│    progress-tracking/SKILL.md ← Internal: progress   │
│    session-handoff/SKILL.md   ← Internal: handoff    │
│                                                       │
└──────────┬──────────────────────┬────────────────────┘
           │                      │
    ┌──────▼──────┐        ┌──────▼───────────────┐
    │ Superpowers │        │  GitNexus (optional)  │
    │ (brainstorm │        │  (analyze / impact)   │
    │  /planning  │        └───────────────────────┘
    │  /subagent  │
    │  /review)   │
    └─────────────┘

Project files (created on first /start):
  .forge/config.json
  .forge/progress.json
  docs/forge/{specs,changes,decisions}/
  CLAUDE.md (Forge section appended)
```

## Plugin Package Structure

```
forge/
  .claude-plugin/
    plugin.json              ← Plugin metadata (name, version, author)
  .opencode/
    INSTALL.md               ← OpenCode install instructions
  hooks/
    hooks.json               ← Claude Code hook configuration
    run-hook.cmd             ← Cross-platform polyglot (batch + bash)
    session-start            ← Bash script: inject using-forge content
  skills/
    using-forge/
      SKILL.md               ← Meta-skill: what forge is, available commands
    start/
      SKILL.md               ← /start command logic
    next/
      SKILL.md               ← /next command logic
    resume/
      SKILL.md               ← /resume command logic
    done/
      SKILL.md               ← /done command logic
    bugfix/
      SKILL.md               ← /bugfix command logic
    scenarios/
      SKILL.md               ← Generate scenarios.json + scenarios.md
    progress-tracking/
      SKILL.md               ← Post-task standard operations
    session-handoff/
      SKILL.md               ← Post-batch CLAUDE.md update + recovery
  README.md                  ← User-facing documentation
  LICENSE                    ← MIT
```

## Key Technical Decisions

### 1. No Manifest Skill Listing

Like Superpowers, `plugin.json` contains only metadata:
```json
{
  "name": "forge",
  "description": "AI-driven software development orchestration",
  "version": "0.1.0",
  "author": { "name": "..." },
  "license": "MIT"
}
```

Skills are NOT listed in plugin.json. Discovery happens through:
1. SessionStart hook injects `using-forge/SKILL.md` content
2. AI learns available commands from the meta-skill
3. AI uses platform's native `Skill` tool to load specific skills by name

### 2. Cross-Platform Hooks (Superpowers Pattern)

**hooks.json:**
```json
{
  "hooks": {
    "SessionStart": [{
      "matcher": "startup|clear|compact",
      "hooks": [{
        "type": "command",
        "command": "\"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd\" session-start",
        "async": false
      }]
    }]
  }
}
```

**run-hook.cmd** is a polyglot file:
- First section is Windows batch (finds Git Bash, runs the script)
- Second section is Unix bash (runs directly)
- Follows exact pattern from Superpowers v5.1.0

**session-start** bash script:
- Reads `${PLUGIN_ROOT}/skills/using-forge/SKILL.md`
- Detects platform via environment variables:
  - `CURSOR_PLUGIN_ROOT` → Cursor format
  - `CLAUDE_PLUGIN_ROOT` (no COPILOT_CLI) → Claude Code format
  - else → SDK standard format
- Outputs JSON with context injection

### 3. Auto-Initialization (No CLI)

`/start` skill checks for `.forge/config.json`:
- Exists → proceed normally
- Missing → run initialization inline:
  1. Detect git, test framework
  2. Check Superpowers installed (required)
  3. Create `.forge/config.json`, directory structure
  4. Append Forge section to CLAUDE.md
  5. Continue with `/start` flow

### 4. Skill Invocation (How Forge Calls Superpowers)

Skills use explicit language that the AI can execute:

```markdown
## Step: Brainstorming

Use the Superpowers `brainstorming` skill:
- Input: the user's requirement description
- Through Socratic dialogue, clarify all uncertainties
- Output: proposal.md written to docs/forge/changes/<feature>/

Do NOT proceed until proposal.md exists and user has seen it.
```

This is the standard Superpowers pattern — one skill can reference another
skill by name, and the AI uses the platform's Skill tool to load it.

### 5. State Management

All state lives in project files, never in conversation:

| File | Purpose | Written by |
|------|---------|-----------|
| `.forge/config.json` | Project config (test mode, framework, etc.) | Auto-init |
| `.forge/progress.json` | Current feature progress | progress-tracking skill |
| `CLAUDE.md` | Cross-session memory | session-handoff skill |
| `docs/forge/changes/<feature>/` | Feature artifacts | Various skills |

## Skills Detail

### using-forge (Meta-Skill)

Injected at session start. Tells the AI:
- What forge is (orchestration system)
- Available commands: /start, /next, /resume, /done, /bugfix
- When to activate (user mentions new feature, bug fix, etc.)
- Where state lives (.forge/progress.json)
- How to check current status (read progress.json)

### start/SKILL.md

Triggered by: `/start <requirement>`

Flow:
1. Check progress.json status ≠ active → error if busy
2. Check .forge/config.json exists → auto-init if missing
3. Generate feature-slug, create docs/forge/changes/<slug>/
4. Write progress.json: { status: "planning", phase: "brainstorming" }
5. Use Superpowers brainstorming skill → proposal.md
6. Use forge scenarios skill → scenarios.json + scenarios.md
7. Show user: proposal + scenarios
8. Update progress.json: { phase: "awaiting_confirmation" }
9. Wait for /next

### next/SKILL.md

Triggered by: `/next`

Scenario A (status=planning, phase=awaiting_confirmation):
1. GitNexus analyze (if existing project)
2. Use Superpowers writing-plans → full-plan.md
3. Batch cut: topological sort, chunk by ≤6 → batch-N.md
4. Update progress.json: { status: "executing", current_batch: 1 }
5. Begin batch execution (Phase 3 loop)

Scenario B (current batch done, more batches remain):
1. Increment current_batch
2. Begin next batch execution

Scenario C (all batches done):
1. Trigger full verification (Phase 4)

### resume/SKILL.md

Triggered by: `/resume`

Flow:
1. Read progress.json + CLAUDE.md
2. Output location summary (feature, completed batches, interrupt point)
3. Detect inconsistencies (done status but no commit)
4. Ask user to confirm → continue as /next from current point

### done/SKILL.md

Triggered by: `/done`

Flow:
1. Validate all batches done/deferred
2. Merge scenarios to docs/forge/specs/
3. Update CLAUDE.md (completed features section)
4. Archive: mv changes/<feature> → changes/archive/YYYY-MM-DD-<feature>/
5. Clean progress.json: { status: "idle" }
6. Output completion summary

### bugfix/SKILL.md

Triggered by: `/bugfix <description>`

Flow:
1. Create docs/forge/changes/bugfix-<id>/
2. Clarify reproduction steps
3. GitNexus impact analysis (if available)
4. Generate 1-3 task fix plan
5. Execute: regression test first (red) → fix (green) → verify
6. Archive

### scenarios/SKILL.md

Internal. Called by start/SKILL.md.

Input: proposal.md + mockup.html (if exists)
Output: scenarios.json (structured) + scenarios.md (rendered)

Each scenario has: id, title, given, when, then[], testTypes[], priority (P0/P1/P2)

### progress-tracking/SKILL.md

Internal. Called after each task completes.

Standard operations:
1. Run test command (from config, fallback auto-detect)
2. Git commit: `feat: <task-title> [forge task-N]`
3. Update .forge/progress.json task status
4. If test fails → auto-fix (max 3 rounds) → if still fails → mark "failed"

### session-handoff/SKILL.md

Internal. Called after each batch completes.

Operations:
1. Update CLAUDE.md current feature section
2. Generate recovery instructions for user
3. Prompt user to open new session

## Data Structures

### config.json

```json
{
  "version": "1.0",
  "test_mode": "normal",
  "gstack_installed": false,
  "batch_size": 6,
  "test_command": "npm test",
  "test_framework": "vitest",
  "test_coverage": { "unit": 80, "integration": 60, "e2e": "P0" },
  "project_type": "new"
}
```

### progress.json

```json
{
  "version": "1.0",
  "feature": "user-authentication",
  "status": "executing",
  "phase": "batch_execution",
  "created_at": "2026-05-21T08:00:00Z",
  "updated_at": "2026-05-21T10:30:00Z",
  "total_batches": 3,
  "current_batch": 2,
  "batches": [
    {
      "batch": 1,
      "status": "done",
      "tasks": [
        { "id": 1, "title": "Create User model", "status": "done", "commit": "abc1234" }
      ]
    }
  ],
  "verification": {
    "status": "pending",
    "test_mode": "normal",
    "last_run": null
  }
}
```

Status enums:
- status: idle | planning | executing | verification_complete | bugfix
- phase: brainstorming | awaiting_confirmation | batch_execution | verification
- batch.status: pending | in_progress | done | blocked | failed
- task.status: pending | in_progress | done | failed | deferred

### scenarios.json

```json
{
  "version": "1.0",
  "feature": "user-authentication",
  "source": "proposal.md",
  "generated_at": "2026-05-21T08:15:00Z",
  "scenarios": [
    {
      "id": 1,
      "title": "用户成功登录",
      "given": "用户在登录页",
      "when": "输入正确的用户名和密码",
      "then": [
        { "assertion": "跳转到首页", "type": "ui" },
        { "assertion": "localStorage 存储 JWT token", "type": "side-effect" }
      ],
      "testTypes": ["functional", "ui"],
      "priority": "P0"
    }
  ]
}
```

## Error Handling

### Command-Level
- /start: empty input → error; active feature → error
- /next: no feature → error; wrong status → error
- /resume: no feature → error; corrupted progress → rebuild from git log
- /done: incomplete tasks → error; verification not passed → error
- /bugfix: empty description → error

### Execution-Level
- Task fail (3 rounds) → mark "failed", interrupt batch, prompt human
- GitNexus fail → warn, continue degraded
- Code review blocking → interrupt batch, wait human
- Test fail → auto-fix (3 rounds) → if still fails → mark failed

### Recovery
- progress.json corrupted → rebuild from git log `[forge task-N]` commits
- State inconsistency → warn user, ask whether to re-execute

## Testing Strategy

Tests come from scenarios.json (human-confirmed), not invented by AI:
```
scenarios.json → writing-plans assigns scenarios to tasks →
subagent writes test first (red) → implements (green) → refactors
```

Test command detection (hybrid):
1. Read config.json test_command
2. If missing → auto-detect (package.json / pytest.ini / go.mod / Cargo.toml)
3. Write detected command to config

Coverage targets: unit ≥80%, integration ≥60%, E2E all P0 scenarios.

## Implementation Phases

Phase 1 is split into sub-phases for incremental delivery:

| Sub-phase | Content | Depends on |
|-----------|---------|------------|
| **1a: Plugin Skeleton** | plugin.json + hooks + run-hook.cmd + session-start + using-forge meta-skill | None |
| **1b: Core Skills** | start/SKILL.md + scenarios/SKILL.md + next/SKILL.md (planning only) | 1a |
| **1c: Execution Loop** | next/SKILL.md (execution) + progress-tracking + session-handoff + resume | 1b |
| **1d: Acceptance & Archive** | done/SKILL.md + bugfix/SKILL.md + full verification (normal mode) | 1c |
| **1e: OpenCode Support** | .opencode/INSTALL.md + opencode.json plugin config + tool mapping | Any |

## What's NOT in Phase 1

- gstack integration (Phase 2)
- Visual/performance testing (Phase 2)
- Codex / Cursor / Gemini CLI support (Phase 2)
- marketplace.json publishing (Phase 2)
- Plugin auto-update mechanism (Phase 2)

## Differences from Previous Design

| Aspect | Previous (CLI-based) | Current (Plugin-based) |
|--------|---------------------|----------------------|
| Installation | `npx forge init` + manual skill copy | `/plugin install forge` |
| CLI commands | forge init/status/config/validate + wrongly: resume/done/bugfix/execute | None. All via skills |
| Skill location | `~/.agents/skills/forge/` (hardcoded) | Plugin-managed, `${CLAUDE_PLUGIN_ROOT}/skills/` |
| Project init | Separate CLI step | Auto on first /start |
| Manifest | Listed skills with absolute paths | No skill listing, discovery via hook injection |
| Windows support | Not handled | Polyglot run-hook.cmd |
| Skill→CLI dependency | Skills called `forge execute ...` (circular) | Skills operate files directly |
| Superpowers invocation | "Load the Superpowers X skill" (vague) | Explicit: "Use the Superpowers X skill: [instructions]" |
