---
name: using-forge
description: Introduction to the Forge orchestration system
---

# Using Forge

Forge is an AI-driven software development orchestration system. It takes
requirements and produces correct, trustworthy software through structured
workflows.

## When to Activate

Check for relevant Forge skills when:
- User wants to build a new feature or project
- User mentions requirements, PRD, or design specs
- User wants to fix a bug systematically
- User asks about project progress or status
- User wants to resume interrupted work

## Available Commands

| Command | Purpose |
|---------|---------|
| `/start <requirement>` | Begin a new feature: brainstorm → scenarios → confirm |
| `/next` | Confirm design and execute, or continue next batch |
| `/resume` | Resume after session interruption |
| `/done` | Complete feature: verify → archive |
| `/bugfix <description>` | Lightweight bug fix with regression test |

## CRITICAL: Forge Overrides Superpowers Workflow

When Forge is active (`.forge/progress.json` exists with `status` ≠ `"idle"`),
all feature development MUST go through Forge commands.

DO NOT directly invoke Superpowers brainstorming, writing-plans, or
subagent-driven-development for feature work — use `/start`, `/next` instead.
Forge will call Superpowers internally with proper state tracking.

Direct Superpowers usage is allowed ONLY for:
- Tasks outside Forge's scope (e.g., one-off refactors not tracked as features)
- When `.forge/progress.json` does not exist (no active Forge project)
- When `status` = `"idle"` (between features)

## How It Works

1. **You describe what to build** → Forge calls Superpowers brainstorming
2. **Scenarios generated** → You confirm they match your intent
3. **Plan created** → Forge calls Superpowers writing-plans
4. **Execution** → Subagents implement each task (TDD)
5. **Guards** → Quality checks run at configured intervals
6. **Verification** → Tests run, code reviewed, report generated
7. **Archive** → Scenarios preserved as project knowledge

## State

Forge stores all state in files (never conversation history):
- `.forge/config.json` — Project configuration (includes `memory_file` field)
- `.forge/progress.json` — Current feature progress
- `.forge/scenarios.json` — Current feature's structured scenarios
- `<memory_file>` — Cross-session memory (CLAUDE.md / AGENTS.md / GEMINI.md, depending on platform)

Documents (design specs, implementation plans) live in `docs/superpowers/` —
managed by Superpowers, not Forge.

## Checking Status

To check current forge status, read `.forge/progress.json`:
- `status: "idle"` → No active feature, user can `/start`
- `status: "planning"` → Feature being designed, waiting for `/next`
- `status: "executing"` → Tasks being implemented
- `status: "verification_complete"` → Ready for `/done`
- `status: "bugfix"` → Bug fix in progress

If `.forge/progress.json` does not exist, the project has not been initialized.
The first `/start` will handle initialization automatically.

## Dependencies

Forge requires:
- **Superpowers** plugin (brainstorming, writing-plans, subagent-driven-development, TDD, code review)

Forge optionally uses:
- **GitNexus** (codebase analysis, blast radius — for existing projects)
- **gstack** (enhanced testing — Phase 2)

## Key Principles

- Tests come from human-confirmed scenarios, not AI invention
- All state in files, context never overflows
- Quality Guards trigger at configured intervals (replaces fixed batch boundaries)
- No guessing: ask humans for anything uncertain
- Reuse existing tools (Superpowers, GitNexus), only orchestrate
