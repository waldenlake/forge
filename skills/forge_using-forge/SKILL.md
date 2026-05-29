---
name: forge:using-forge
description: Introduction to the Forge orchestration system (5-phase workflow)
---

# Using Forge

Forge is an AI-driven Engineering Cognition Runtime. It orchestrates the
entire feature lifecycle as **5 ordered phases + 1 vertical bugfix flow**:

```
/start → /planning → /executing → /verify → /done
                                      ↕
                                   /bugfix (any time)
```

Forge CLI is the single source of truth for state and phase transitions.
AI-driven phases call CLI commands; CLI verifies and writes state.

## Forge CLI

Before calling any Forge Runtime command, resolve the executable:

```bash
FORGE_CMD=$(command -v forge 2>/dev/null || { if [ -f "$HOME/.config/opencode/plugins/forge/cli/dist/index.js" ]; then echo "node $HOME/.config/opencode/plugins/forge/cli/dist/index.js"; else echo ".forge/bin/forge"; fi; })
```

## State Machine

| State | Meaning | Phase skill |
|-------|---------|-------------|
| `idle` | No active feature | `/start` |
| `planning` | Feature registered, awaiting spec/plan | `/planning` |
| `executing` | Plan registered, tasks in flight | `/executing` |
| `execution_complete` | Tasks done, ready to verify | `/verify` |
| `verified` | Verification passed, ready to finish | `/done` |

## User Commands

| Command | Purpose |
|---|---|
| `/start <requirement>` | Phase 1: env check, init, feature:start, lifecycle Checklist |
| `/planning` | Phase 2: brainstorm spec, scenarios, plan, advance |
| `/executing` | Phase 3: per-task TDD via subagent + phase:complete gate |
| `/verify` | Phase 4: full verification + failure routing + phase:verify-pass |
| `/done` | Phase 5: phase:finish + archive + memory + reset |
| `/next` | Status router — dispatches to the phase skill matching current state |
| `/resume` | Recover after session interruption |
| `/bugfix <description>` | Systematic 4-phase debugging (interrupts and resumes feature) |

## Runtime Commands Used By Skills

State / migration:
- `forge status`, `forge doctor`, `forge migrate`, `forge init`

Phase transitions:
- `forge feature:start`, `forge phase:advance`, `forge phase:complete`,
  `forge phase:verify-pass`, `forge phase:finish`

Tasks:
- `forge plan:register`, `forge task:start`, `forge task:done`,
  `forge task:fail`, `forge task:defer`, `forge task:reset`

Guards (per-task):
- `forge guard:preview`, `forge guard:run`, `forge guard:record`,
  `forge guard:history`

Verification:
- `forge test`, `forge verify --coverage`

Git / audit:
- `forge commit`, `forge commit:check`, `forge audit`, `forge reset --backup`

Memory:
- `forge memory:set-feature`, `forge memory:complete-feature`

Scenarios:
- `forge scenarios:archive`, `forge scenarios:export/import`,
  `forge schema:validate`

## Required External Tools

- **Superpowers** (subagent runtime, brainstorming, TDD, code review, etc.)
- **GitNexus** (`gitnexus index --update` after every `task:done` and
  `phase:finish`; `gitnexus index` baseline in `forge init`)
- **gstack** (recommended) — contract / smoke tests by default; E2E /
  visual / performance opt-in via `config.verify.*`

`/start` runs `forge doctor` which fails hard on missing Superpowers or
GitNexus. Missing gstack only emits a warning — `gstack_installed: false`
is recorded in config and gstack-dependent verify steps are skipped.

## Runtime Ownership

The Forge CLI is the single Reality Authority. It owns:
- All state file writes (`.forge/progress.json`, `.forge/config.json`).
- All phase transitions (only via `phase:*` commands).
- All test execution (via `forge test` / `forge verify`).
- All commit verification (via `forge commit:check` / `forge audit`).

AI / skills MUST NOT:
- Edit `.forge/*.json` directly.
- Call other phase commands without going through the phase skill (no
  manual `phase:advance` to skip /planning).
- Bypass guards or verification.

## Failure Routing

Verification failures route by class (computed by `forge verify`):

| failure_class | Route | Why |
|---------------|-------|-----|
| `null` | `phase:verify-pass` → `/done` | All steps passed |
| `implementation` | Re-enter `/executing` (≤ 2 retries) | Tests/coverage/E2E/visual/perf — needs spec context |
| `security` | `/bugfix` | Discrete CVE / hardcoded secret — no spec needed |
| `infra` | STOP for human | Build / tooling outage — no AI fix |

## Bugfix Interrupt Protocol

`/bugfix` may interrupt an `executing` feature:
1. Confirm with user.
2. `forge task:reset --id N --reason "interrupted by /bugfix"` resets the
   in-flight task back to `pending`.
3. Run `superpowers:systematic-debugging` Phase 1–4 (rigid; no skipping).
4. Commit + `gitnexus index --update`.
5. Output `/resume` hint to continue the feature; the reset task will be
   re-executed fully.

## v2 Compatibility

Forge v2 is not backward-compatible with v1. v2 uses:
- `config.json` version `2.0` (no `test_mode` field; v1's `normal/enhanced`
  mode no longer exists)
- `progress.json` v1 with status enum
  `idle / planning / executing / execution_complete / verified`
  (the old `verification_complete / bugfix` enum values are gone)

If `forge status` reports `migration_required: true`, run:

```bash
forge migrate --from 1.0 --to 2.0
```

If `forge status` reports `stale_progress: true`, the progress.json file
is from a pre-Phase-1 forge build and should be archived:

```bash
forge reset --backup
```

## Superpowers Boundary

Forge calls Superpowers skills internally. When Forge is active, do not
bypass it by calling these directly:
- `brainstorming` (called by `/planning`)
- `writing-plans` (called by `/planning`)
- `subagent-driven-development` (called by `/executing` per task)
- `test-driven-development` (called inside subagent-driven-development)
- `verification-before-completion` (called inside subagent-driven-development
  and `/bugfix` Phase 4)
- `requesting-code-review` (called by `/executing` per task and at
  phase:complete gate; also by `/bugfix`)
- `finishing-a-development-branch` (called at phase:complete gate)
- `systematic-debugging` (called by `/bugfix`, 4 phases rigid)

Always use `/start`, `/next`, `/resume`, `/done`, `/bugfix` so Runtime
state stays accurate.
