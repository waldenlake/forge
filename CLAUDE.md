# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repo Is

Forge is an AI-driven development orchestration plugin. It ships as:
- A **CLI runtime** (`cli/`) — TypeScript/Node.js, compiled to `cli/dist/`, the source of truth for all state mutations
- **Skills** (`skills/`) — Markdown instruction files that tell the AI *how* to call the CLI; they do not contain logic
- **Schemas** (`schemas/`) — JSON Schema files that validate `.forge/config.json`, `.forge/progress.json`, and `.forge/scenarios.json`
- **Hooks** (`hooks/`) — Shell hooks for Claude Code's SessionStart event

The CLI never edits user source files. It manages `.forge/*.json` state files in the *user's* project directory (not this repo).

## CLI Development Commands

All commands run from `cli/`:

```bash
npm run build          # tsc — compiles src/ to dist/
npm test               # vitest run — runs all tests
npm run check          # build + test in one step
npm test -- <file>     # run a single test file, e.g. npm test -- security-scan.test.ts
```

The built binary is `cli/dist/index.js`. Tests use `spawnSync` against this binary, so **build before testing integration tests**.

## Architecture: CLI Runtime

### State Layer (`cli/src/state/`)

Two runtime state files live in the user's `.forge/` directory:

- **`config.ts`** — reads/writes/validates `.forge/config.json` (`ForgeConfig` type). Contains test profiles, guard rules, and feature flags. Schema-validated via AJV on every read.
- **`progress.ts`** — reads/writes/validates `.forge/progress.json` (`ForgeProgress` type). Tracks feature lifecycle: `idle → planning → executing → execution_complete → verified`. Contains tasks, guard history, and verification state.
- **`memory.ts`** — reads/writes the memory file (`CLAUDE.md` / `AGENTS.md` / `GEMINI.md`) referenced in config.

### Command Layer (`cli/src/commands/`)

Each file registers one or more subcommands via `registerXCommand(program)`. All commands:
1. Output **JSON only** to stdout (one line, `JSON.stringify(payload)\n`)
2. Set `process.exitCode = 1` on failure — never call `process.exit()`
3. Read state via `readConfig(cwd)` / `readProgress(cwd)`, never access `.forge/` directly
4. Never modify user source files

Key commands:
- `init` — creates `.forge/config.json` from auto-detected project type
- `status` — reads both state files, returns current progress + guard preview
- `task:start/done/fail/defer` — mutates progress.tasks and triggers guard evaluation
- `guard:run/preview/record/history` — guard lifecycle management
- `guard:security-scan`, `guard:dependency-audit`, `guard:coverage-check` — direct scanner invocations
- `test:gstack` — routes to gstack runner (requires `config.gstack_installed: true`)
- `scenarios:export/import` — template system for scenario reuse
- `verify` — runs test suite and updates verification state
- `commit` — runs git commit after verification passes

### Library Layer (`cli/src/lib/`)

- **`guard.ts`** — pure `triggeredGuards(config, progress, task)` function; the only place guard trigger logic lives
- **`runner.ts`** — `runShellCommand(root, workingDir, command)` and `git(cwd, args)` wrappers around `spawnSync`
- **`detect.ts`** — detects test frameworks and monorepo workspaces from project files
- **`schema.ts`** — AJV validation wrapper used by the state layer
- **`logger.ts`** — JSONL structured logger; activated by global `--log-file <path>` option
- **`scanners/`** — `security.ts` (regex rules), `dependency.ts` (npm audit + license), `coverage.ts` (Istanbul JSON parser)
- **`gstack/`** — `runner.ts` (dispatcher), `e2e.ts` (Playwright report parser), `visual.ts` (pixelmatch), `performance.ts` (Web Vitals)

### Guard System

Guards are configured in `config.guards` and evaluated after each `task:done`. `triggeredGuards()` in `lib/guard.ts` is the authoritative trigger logic — it checks:
- `security-scan`: keyword match in task title/tags
- `batch-review`: `completed_tasks % every_n_tasks === 0`
- `performance-budget`: keyword match
- `human-review`: `task.requires_human_review === true`

`dependency-audit` is detected differently (via git diff of package.json) and is not in the standard trigger loop.

## Skills

Skills in `skills/<name>/SKILL.md` are instruction files consumed by Claude Code's `/skillName` commands. They:
- Must never mutate `.forge/*.json` directly — all state changes go through CLI commands
- Resolve the CLI binary via: `FORGE_CMD=$(command -v forge 2>/dev/null || echo "node ~/.config/opencode/plugins/forge/cli/dist/index.js")`
- Are not TypeScript — no build step required

## Key Constraints

- **`cli/dist/` is gitignored** — never commit compiled output
- **State files** (`.forge/*.json`) are the user's project data — this repo only contains the schemas that validate them
- **All CLI output is JSON** — no human-readable output, no `console.log`; always `process.stdout.write(JSON.stringify(...))`
- **Schemas are co-versioned** — if `ForgeConfig` or `ForgeProgress` types change, update the corresponding file in `schemas/`

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **forge** (2349 symbols, 4420 relationships, 200 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/forge/context` | Codebase overview, check index freshness |
| `gitnexus://repo/forge/clusters` | All functional areas |
| `gitnexus://repo/forge/processes` | All execution flows |
| `gitnexus://repo/forge/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
