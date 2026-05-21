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

## How It Works

1. **You describe what to build** → Forge clarifies via brainstorming
2. **Scenarios generated** → You confirm they match your intent
3. **Plan created** → Tasks with TDD steps, batched for context management
4. **Execution** → Subagents implement each task (test first, then code)
5. **Verification** → Tests run, code reviewed, report generated
6. **Archive** → Feature documented, scenarios preserved as project knowledge

## State

Forge stores all state in files (never conversation history):
- `.forge/config.json` — Project configuration
- `.forge/progress.json` — Current feature progress
- `CLAUDE.md` — Cross-session memory (Forge section)
- `docs/forge/changes/<feature>/` — Feature artifacts

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
- Batch isolation: ≤6 tasks per batch, new session between batches
- No guessing: ask humans for anything uncertain
- Reuse existing tools (Superpowers, GitNexus), only orchestrate
