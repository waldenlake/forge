# Forge Phase 1 Design

## Overview

Forge is an AI-driven software development orchestration system. It takes requirements (PRD / UI design / verbal description) as input and produces correct, trustworthy software. The entire process is automated, with human intervention at only two points: **requirement confirmation** and **final acceptance**.

## Core Goal

**Single goal**: Ensure AI-produced software is correct and trustworthy.

"Trustworthy" means:
- Requirements are accurately understood (verified via scenarios)
- Tests cover requirements (TDD, tests derived from requirement scenarios)
- All tests pass (unit + integration + E2E)
- Code quality passes (code review approved)
- Change impact is controlled (GitNexus blast radius analysis)

## Design Principles

1. **No guessing**: Ask humans for anything uncertain, no assumptions
2. **Files are state**: All state stored in files, not conversation history
3. **Results externalized**: Subagent results written to files, orchestrator holds no detailed content
4. **Batch isolation**: ≤6 tasks per batch, new session between batches, context never overflows
5. **Test-driven**: Tests derived from requirement scenarios, not invented by AI
6. **Reuse, don't rebuild**: Core capabilities reuse existing tools, only do orchestration

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   User (AI Chat)                  │
│   /start → /next → /resume → /done → /bugfix    │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│           Forge Skills (User-level install)       │
│  ~/.agents/skills/forge/                        │
│  ├── start.md          ← Requirement + scenarios │
│  ├── next.md           ← Planning + batch + exec │
│  ├── resume.md         ← State recovery          │
│  ├── done.md           ← Acceptance + archive    │
│  ├── bugfix.md         ← Lightweight bug fix     │
│  ├── scenarios.md      ← Scenario generation     │
│  ├── progress-tracking ← Progress externalization│
│  └── session-handoff   ← Cross-session handoff   │
└──────────┬──────────────────────┬────────────────┘
           │                      │
    ┌──────▼──────┐        ┌──────▼───────────────┐
    │ Superpowers │        │  GitNexus (existing) │
    │ (brainstorm │        │  (analyze / impact)  │
    │  /planning  │        └──────────────────────┘
    │  /subagent  │
    │  /review)   │        ┌──────────────────────┐
    └─────────────┘        │ gstack (optional, P2)│
                           │ (/qa /benchmark ...) │
                           └──────────────────────┘

┌─────────────────────────────────────────────────┐
│              CLI (TypeScript + tsx)               │
│  forge init   → Env check + dir gen + skill inst │
│  forge status → Read progress.json, show status  │
│  forge config → Manage config.json               │
│  forge validate → Validate progress.json format  │
└─────────────────────────────────────────────────┘
```

## Tool Dependencies

| Tool | Role | Required |
|------|------|----------|
| Superpowers | Execution discipline (TDD, subagent, code review) | Required |
| GitNexus | Codebase understanding, change impact analysis | Required (existing), optional (new) |
| gstack | Enhanced testing (browser, visual QA, perf) | Optional, Phase 2 |
| forge | Orchestration layer (connects above tools) | Self |

## Phase 1 Scope

Phase 1 is split into sub-phases:

| Sub-phase | Content | Depends on |
|-----------|---------|------------|
| **1a: Skeleton** | CLI + directory structure + config files | None |
| **1b: Core Loop** | `/start` → `/next` → execute first task, state machine | 1a |
| **1c: Full Execution** | Subagent execution, batch loop, `/resume`, session-handoff | 1b |
| **1d: Acceptance & Archive** | Full verification (normal mode), `/done`, `/bugfix` | 1c |
| **1e: Multi-platform** | Claude Code manifest + OpenCode manifest | Any of 1a-1d |

Phase 2: gstack integration, enhanced testing, visual QA, performance testing.

## User Commands

### `/start <requirement>`

**Purpose**: Start a new work item (new project, new feature, refactor)

**Input**: Text description, PRD file path, UI screenshot path, or mixed

**Flow**:
1. Check progress.json status ≠ "idle" → error if busy
2. Generate feature-slug, create `docs/forge/changes/<slug>/`
3. Init progress.json: `{ status: "planning", phase: "brainstorming" }`
4. Call Superpowers brainstorming skill → `proposal.md`
5. Call scenarios skill (internal) → `scenarios.json` + `scenarios.md` (rendered)
6. Show user: proposal summary + scenarios
7. Update progress.json: `{ phase: "awaiting_confirmation" }`
8. Wait for user: `/next` (confirm) or edit + re-`/start`

### `/next`

**Purpose**: Confirm design and execute, or continue after batch completion

**Scenarios**:

**A**: `status=planning, phase=awaiting_confirmation` → Phase 2: Planning
   - GitNexus analyze (existing project)
   - Call Superpowers writing-plans → `full-plan.md`
   - Batch cutting (topological sort + chunk by 6) → `batch-N.md`
   - Update progress.json: `{ status: "executing", current_batch: 1 }`
   - Enter Phase 3: Execute batch 1

**B**: `status=executing, current batch ≠ done` → Continue current batch

**C**: `status=executing, current batch = done, more batches` → Next batch

**D**: `status=executing, all batches = done` → Phase 4: Full verification

### `/resume`

**Purpose**: Resume after session interruption

**Flow**:
1. Read progress.json + CLAUDE.md
2. No progress.json → error
3. Output定位 summary:
   ```
   Feature: xxx
   Completed: batch 1-2 (task 1-12)
   Interrupt: batch 3, task 3 in progress
   Next: continue task 3
   ```
4. Detect inconsistency: progress.json says done but no git commit → warn
5. User confirms → continue (equivalent to `/next` from current point)

### `/done`

**Purpose**: Complete work item, trigger acceptance and archive

**Flow**:
1. Validate progress.json: all batches done or deferred
2. Validation not passed → error
3. Merge scenarios.json → `docs/forge/specs/<feature>-scenarios.json`
4. Update CLAUDE.md: append Completed Features
5. Archive: `mv changes/<feature> → changes/archive/YYYY-MM-DD-<feature>/`
6. Clean progress.json: `{ current_feature: null, status: "idle" }`
7. Output completion summary

### `/bugfix <description>`

**Purpose**: Lightweight bug fix flow, skip full planning

**Flow**:
1. Check no active feature (or allow parallel)
2. Create `docs/forge/changes/bugfix-<id>/`
3. Ask for reproduction steps if unclear
4. GitNexus impact analysis
5. Generate lightweight fix plan (1-3 tasks)
6. Execute: write regression test first → fix → verify
7. Archive

## Skills Detail

### 8 Skills

| Skill | Type | Trigger | Core Responsibility |
|-------|------|---------|---------------------|
| `start.md` | User command | `/start <req>` | Requirement understanding → proposal → scenarios → human confirm |
| `next.md` | User command | `/next` | Planning → batch cutting → execution → testing |
| `resume.md` | User command | `/resume` | State recovery → locate → continue |
| `done.md` | User command | `/done` | Acceptance → archive → cleanup |
| `bugfix.md` | User command | `/bugfix <desc>` | Lightweight bug fix |
| `scenarios.md` | Internal | Called by start.md | Generate scenarios.json + render md |
| `progress-tracking.md` | Internal | Called by next.md | Standard operations after subagent completion |
| `session-handoff.md` | Internal | Auto-triggered after batch | Update CLAUDE.md + generate recovery instructions |

### Batch Execution Loop (Phase 3)

For each task in current batch:
1. Read task definition from `batch-N.md`
2. Dispatch subagent (independent context)
   - Input: task definition + scenarios.json matching scenarios + impact analysis
   - Subagent executes: write test → write implementation → refactor → verify
3. Subagent returns structured result:
   `{ taskId: N, status: "done" | "failed", commit: "abc123" }`
4. Call progress-tracking skill → update progress.json
5. Run unit tests → fail → auto-fix (max 3 rounds)
6. After all tasks complete:
   - Batch status = "done"
   - Call Superpowers requesting-code-review
   - Call session-handoff skill → update CLAUDE.md
   - Prompt user to open new session or `/next` to continue

## Data Structures

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
      "started_at": "2026-05-21T08:30:00Z",
      "completed_at": "2026-05-21T10:15:00Z",
      "tasks": [
        {
          "id": 1,
          "title": "Create User model",
          "status": "done",
          "commit": "abc1234",
          "completed_at": "2026-05-21T09:00:00Z"
        }
      ]
    }
  ],
  "verification": {
    "status": "pending",
    "test_mode": "normal",
    "last_run": null,
    "report_path": null
  }
}
```

**Status enums:**
- `status`: `idle` | `planning` | `executing` | `verification_complete` | `bugfix`
- `phase`: `brainstorming` | `awaiting_confirmation` | `batch_execution` | `verification`
- `batch.status`: `pending` | `in_progress` | `done` | `blocked` | `failed`
- `task.status`: `pending` | `in_progress` | `done` | `failed` | `deferred`
- `verification.status`: `pending` | `in_progress` | `passed` | `failed`

### scenarios.json (Structured format)

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
      "when": "输入正确的用户名和密码，点击\"登录\"",
      "then": [
        { "assertion": "跳转到首页", "type": "ui" },
        { "assertion": "显示用户名", "type": "ui" },
        { "assertion": "localStorage 存储 JWT token", "type": "side-effect" }
      ],
      "testTypes": ["functional", "ui"],
      "priority": "P0"
    }
  ]
}
```

**Field constraints:**
- `priority`: `P0` (blocking) | `P1` (warning) | `P2` (record only)
- `then[].type`: `functional` | `ui` | `side-effect` | `performance`
- `testTypes`: `functional` | `ui` | `integration` | `performance` (multi-select)

### config.json

```json
{
  "version": "1.0",
  "test_mode": "normal",
  "gstack_installed": false,
  "batch_size": 6,
  "test_command": "npm test",
  "test_framework": "vitest",
  "test_coverage": {
    "unit": 80,
    "integration": 60,
    "e2e": "P0"
  },
  "project_type": "new",
  "platforms": ["claude", "opencode"]
}
```

## CLI Design

### Commands

| Command | Purpose | Output |
|---------|---------|--------|
| `forge init` | Env check + project init | Directory structure + config + skill install guide |
| `forge status` | View current project status | Active feature, progress, test mode |
| `forge config` | Manage project config | Read/modify/set config items |
| `forge validate` | Validate state file format | Pass/fail + error details |

### `forge init` Flow

1. Detect `.git` → `project_type = "existing"` or `"new"`
2. Detect Superpowers (`~/.agents/skills/superpowers/`) → guide install if missing
3. Detect GitNexus (existing project) → guide install if missing
4. Detect gstack (optional) → ask about enhanced test mode
5. Detect test framework → auto-detect + user confirm → write to config
6. Generate directory structure
7. Generate platform manifests (`.claude-plugin/plugin.json`, `.opencode/plugin.json`)
8. Initialize CLAUDE.md (if not exists) or append Forge section
9. Output completion summary

### `forge status` Output

```
Forge Status
============
Feature: user-authentication
Status: executing
Phase: batch_execution
Progress: batch 2/3, task 8/16

Batch 1: ✅ done (6 tasks)
Batch 2: 🔄 in_progress (2/6 tasks done)
Batch 3: ⏳ pending (0/4 tasks)

Test mode: normal
Coverage target: unit ≥80%, integration ≥60%
```

### `forge config` Sub-commands

```
forge config get test_mode          → normal
forge config set test_mode enhanced
forge config get test_coverage.unit → 80
forge config set test_coverage.unit 90
forge config list                    → show all config
```

### `forge validate` Output

```
Forge Validate
==============
progress.json: ✅ valid
config.json:   ✅ valid
scenarios.json: ✅ valid (5 scenarios, 3 P0, 2 P1)

Warnings:
  - task 5 marked done but no matching git commit found
```

## Multi-Platform Support

### Directory Structure

```
~/.agents/skills/forge/          ← User-level skill install
  ├── start.md
  ├── next.md
  ├── resume.md
  ├── done.md
  ├── bugfix.md
  ├── scenarios.md
  ├── progress-tracking.md
  └── session-handoff.md

project-root/
  .claude-plugin/plugin.json     ← Claude Code manifest
  .opencode/plugin.json          ← OpenCode manifest
  CLAUDE.md                      ← Cross-session memory (auto-maintained)
```

### Claude Code Manifest

```json
{
  "name": "forge",
  "version": "0.1.0",
  "skills": [
    { "name": "/start", "path": "~/.agents/skills/forge/start.md" },
    { "name": "/next", "path": "~/.agents/skills/forge/next.md" },
    { "name": "/resume", "path": "~/.agents/skills/forge/resume.md" },
    { "name": "/done", "path": "~/.agents/skills/forge/done.md" },
    { "name": "/bugfix", "path": "~/.agents/skills/forge/bugfix.md" }
  ]
}
```

### OpenCode Manifest

```json
{
  "name": "forge",
  "version": "0.1.0",
  "skills": [
    { "name": "/start", "path": "~/.agents/skills/forge/start.md" },
    { "name": "/next", "path": "~/.agents/skills/forge/next.md" },
    { "name": "/resume", "path": "~/.agents/skills/forge/resume.md" },
    { "name": "/done", "path": "~/.agents/skills/forge/done.md" },
    { "name": "/bugfix", "path": "~/.agents/skills/forge/bugfix.md" }
  ]
}
```

### Platform Differences

| Difference | Claude Code | OpenCode |
|------------|-------------|----------|
| Skill registration | `.claude-plugin/plugin.json` | `.opencode/plugin.json` |
| Command prefix | `/start` | `/start` |
| Auto-read | `CLAUDE.md` | `CLAUDE.md` |
| Skill path | `~/.agents/skills/forge/` | `~/.agents/skills/forge/` |

Both platforms share identical skill paths and file formats. Manifests differ only in registration method. `forge init` generates the appropriate manifest based on detected platform.

## Test Strategy

### Test Source (TDD Core)

**Principle**: Tests are generated from requirement scenarios, not invented by AI.

```
scenarios.json (human-confirmed requirement scenarios)
  ↓
writing-plans skill assigns matching scenario to each task
  ↓
subagent executes task: convert scenario to test code first (red)
  ↓
write implementation to pass tests (green)
  ↓
refactor
```

### Test Levels

1. **Unit tests (TDD)**: From scenarios functional scenarios, run after each task
2. **Integration tests (TDD)**: From scenarios integration scenarios, run after each batch
3. **E2E tests (enhanced mode, Phase 2)**: From scenarios UI scenarios, gstack `/qa`
4. **Visual tests (enhanced mode, Phase 2)**: From mockup, gstack `/design-review`
5. **Performance tests (enhanced mode, Phase 2)**: From scenarios performance scenarios, gstack `/benchmark`

### Test Coverage Targets

- Unit test coverage: ≥80% (configurable)
- Integration test coverage: ≥60% (configurable)
- E2E: All P0 scenarios

### Test Command Auto-Detection

Hybrid approach:
1. Read config first
2. If config missing, auto-detect by file features:
   - `package.json` → npm test
   - `pytest.ini` → pytest
   - `go.mod` → go test
   - `Cargo.toml` → cargo test
3. Write detected command to config.json

## Error Handling

### Command-Level Errors

- `/start`: Empty requirement → error; Active feature exists → error
- `/next`: No active feature → error; Status mismatch → error
- `/resume`: No active feature → error; progress.json corrupted → rebuild from git log + CLAUDE.md
- `/done`: Incomplete tasks → error; Verification not passed → error
- `/bugfix`: Empty description → error; Unclear reproduction →追问 until clear

### Execution-Level Errors

- Subagent task fail (3 rounds fix) → mark "failed", interrupt batch, prompt human
- GitNexus query fail → warn, continue without dependency analysis
- File write fail → immediate error, stop
- Code review blocking issue → interrupt batch, wait human fix
- Integration test fail → interrupt batch, output fail list

### Recovery Strategy

**progress.json corrupted:**
1. Rebuild from git log: read all `[forge task-N]` commits
2. If fail → read last known state from CLAUDE.md, warn user may be incomplete

**Inconsistent state:**
- progress.json says task 5 done but no git commit → warn, ask user: "task 5 marked done but no commit found, re-execute?"

## Directory Structure

```
project-root/
  CLAUDE.md                           # Cross-session memory (forge auto-maintains)

  docs/forge/
    specs/                            # Project-level specs (accumulated after archive)
      user-authentication-scenarios.json

    changes/                          # Active features
      user-authentication/
        proposal.md                   # Brainstorming output
        scenarios.json                # Structured scenarios
        scenarios.md                  # Rendered for human reading
        plans/
          batch-1.md
          batch-2.md
          batch-3.md
        review-batch-1.md             # Code review results
        test-report.html              # Test report (normal mode)
        acceptance-report.html        # Acceptance report (enhanced mode, Phase 2)

      archive/                        # Completed features
        2026-05-15-user-login/

    decisions/                        # Architecture decision records (ADR)
      001-use-jwt-instead-of-session.md

  .forge/
    config.json                       # Project config
    progress.json                     # Current task progress (machine-readable)
    test-baseline/                    # Visual test baseline screenshots (Phase 2)

  .claude-plugin/                     # Claude Code manifest
    plugin.json

  .opencode/                          # OpenCode manifest
    plugin.json

  src/                                # Actual code
  tests/                              # Test code
```

## Context Management Strategy

### Main Defense: Results Externalized + Batch Isolation

**Results Externalized:**
```
subagent executes task:
  ↓
Results written to .forge/progress.json + git commit
  ↓
Orchestrator only records: "task N: done" (4 tokens)
  ↓
Review reads from files, not conversation history
```

Orchestrator context growth: from "full task result" (hundreds of tokens) to "one status line per task" (4 tokens). 16 tasks = only 64 tokens.

**Batch Isolation:**
```
16 tasks in 3 batches:
  batch 1: task 1-6   → session 1
  batch 2: task 7-12  → session 2 (new)
  batch 3: task 13-16 → session 3 (new)
```

Auto-prompt new session after each batch. Context never accumulates to overflow.

Max batch size: 6 tasks
- 6 tasks × (read + execute + write) ≈ 20-30k tokens per batch
- Well below context window (Claude Code ~200k tokens)
- Leaves room for brainstorming, planning, review

### Cross-Session Memory: CLAUDE.md

Auto-read by Claude Code every session, auto-maintained by forge:

```markdown
## Forge

**Project Info**
- Name: xxx
- Architecture: xxx
- Tech stack: xxx
- Test mode: normal

**Current Feature**
- Feature: <feature-slug>
- Completed: batch 1-2 (task 1-12)
- Current: batch 3, starting from task 13
- Review Status: batch 1-2 passed, no blocking issues

**Key Decisions**
- 2026-05-20: Use JWT instead of session, reason: xxx

**Completed Features**
- feature-login (2026-05-15)
  - Architecture: JWT + Redis
  - Test coverage: 95%
```

New session reads this and immediately knows: what the project is, what's being done, where it is, what key decisions were made.

## Priority Rules

- **P0 failure** → batch fails, blocks flow
- **P1 failure** → warning recorded, continue
- **P2 failure** → only recorded, no blocking
- **Execution order**: P0 first, then P1/P2
