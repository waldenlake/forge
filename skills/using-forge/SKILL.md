---
name: using-forge
description: Introduction to the Forge orchestration system
---

# Using Forge

Forge is an AI-driven software development orchestration system. In v2, the
Forge CLI Runtime is the source of truth for project state and workflow
transitions.

## Forge CLI

Before calling any Forge Runtime command, resolve the executable:

```bash
FORGE_CMD=$(command -v forge 2>/dev/null || { if [ -f "$HOME/.config/opencode/plugins/forge/cli/dist/index.js" ]; then echo "node $HOME/.config/opencode/plugins/forge/cli/dist/index.js"; else echo ".forge/bin/forge"; fi; })
```

All Runtime commands output JSON by default. Read the JSON, report blocking
errors exactly, and do not edit `.forge/*.json` directly.

## Runtime Ownership

Runtime owns reality-changing operations: initialization, migration, feature
state, phase transitions, task status, guards, verification, memory updates,
scenario archives, commits, and resets.

Direct edits to `.forge/*.json` are invalid during active Forge work. Skills may
read JSON files for context, call Superpowers, generate user-facing summaries,
and write non-Runtime artifacts such as specs and plans when a skill explicitly
owns them.

Exception: the `scenarios` skill owns the first creation of
`.forge/scenarios.json` from a confirmed design spec. The calling workflow must
immediately validate that artifact with `forge schema:validate --file
.forge/scenarios.json`; later Runtime state changes and scenario archives still
belong to the CLI.

## v2 Compatibility

Forge v2 config is not backward-compatible with v1. v2 uses
`config.json` version `2.0` and `test_profiles`; legacy `test_command` and
`test_framework` configs must be migrated.

If `forge status` reports `migration_required: true`, run:

```bash
forge migrate --from 1.0 --to 2.0
```

Do not hand-edit legacy config into v2 shape.

## When to Activate

Check for relevant Forge skills when:
- User wants to build a new feature or project.
- User mentions requirements, PRD, or design specs.
- User wants to fix a bug systematically.
- User asks about progress, status, resume, or completion.

## Available User Commands

| Command | Purpose |
|---|---|
| `/start <requirement>` | Begin a feature: brainstorm, scenarios, review. |
| `/next` | Confirm design, plan, execute tasks, or verify. |
| `/resume` | Recover after interruption. |
| `/done` | Finish, archive, update memory, reset. |
| `/bugfix <description>` | Regression-test-first bug fix. |

## Runtime Commands Used By Skills

Core commands include:
- `forge status`, `forge doctor`, `forge migrate`.
- `forge init --auto-detect --superpowers-available true|false`.
- `forge feature:start --feature <slug> --spec <path>`.
- `forge plan:register --plan <path>`.
- `forge phase:advance`, `forge phase:complete`, `forge phase:finish`.
- `forge task:start`, `forge task:done`, `forge task:fail`,
  `forge task:defer`.
- `forge guard:preview`, `forge guard:run`, `forge guard:record`,
  `forge guard:history`.
- `forge test`, `forge test --coverage`, `forge verify --coverage`.
- `forge commit`, `forge commit:check`, `forge audit`, `forge reset --backup`.
- `forge memory:set-feature`, `forge memory:complete-feature`.
- `forge scenarios:archive`, `forge schema:validate`.

## How It Works

1. `/start` calls Runtime status/init, then Superpowers brainstorming.
2. Scenarios are generated and validated.
3. `/next` advances phase, registers the plan, starts tasks, calls Superpowers
   subagents, runs tests, commits, records guards, and verifies.
4. `/done` finishes the phase, archives scenarios, updates memory, and resets.
5. `/resume` reconstructs position from Runtime status, audit, and commit
   checks.

## Superpowers Boundary

Forge may call Superpowers skills internally:
- `brainstorming` for design specs.
- `writing-plans` for implementation plans.
- `subagent-driven-development` for task execution.
- `test-driven-development` for bug fixes.
- `requesting-code-review` for guard actions.

When Forge is active, do not bypass Forge by invoking those skills directly for
feature work. Use `/start`, `/next`, `/resume`, `/done`, or `/bugfix` so Runtime
state remains accurate.
