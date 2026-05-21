# Forge Phase 1f: Design Doc Alignment Fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Fix 6 gaps identified in the design doc vs implementation comparison. All fixes are targeted corrections, not new features.

**Scope:** 6 items, each with clear before/after behavior.

---

## Task 1: Fix `/done` Archive scenarios.json Format

**Problem**: `done.ts` archives `scenarios.md` (rendered) instead of `scenarios.json` (structured). Design doc line 151: "Merge scenarios.json → docs/forge/specs/<feature>-scenarios.json"

**Files to modify:**
- `forge/src/commands/done.ts` — change source from `scenarios.md` to `scenarios.json`, dest from `.md` to `.json`
- `forge/tests/unit/commands/done.test.ts` — update archive test to verify JSON copy

**Steps:**
1. In `done.ts:80-83`, change `scenarios.md` → `scenarios.json` and dest extension `.md` → `.json`
2. Also copy `scenarios.md` alongside `.json` (both are useful)
3. Update test to verify `test-feature-scenarios.json` is created
4. Run tests, commit

---

## Task 2: Add CLAUDE.md Auto-Update to `/done`

**Problem**: Design doc line 152: "Update CLAUDE.md: append Completed Features". Not implemented.

**Files to create/modify:**
- `forge/src/utils/claude-md.ts` (new) — utility to update CLAUDE.md
- `forge/tests/unit/utils/claude-md.test.ts` (new) — tests
- `forge/src/commands/done.ts` — call the utility in `runArchive`

**Steps:**
1. Create `claude-md.ts` with `updateClaudeMd(projectRoot, featureSlug, progress)` function
2. Function appends to CLAUDE.md:
   ```markdown
   ## Completed Features
   - <feature-slug> (<date>)
     - Tasks: <N> completed, <M> deferred
     - Test coverage: <from verification>
     - Deferred tasks: <list if any>
   ```
3. If CLAUDE.md doesn't exist, create it
4. If Forge section exists, update it; if not, create it
5. Call from `done.ts` `runArchive` before moving directory
6. Write tests, run, commit

---

## Task 3: Complete `/bugfix` Flow

**Problem**: Design doc lines 162-168 specify 7 steps. Only steps 1-2 implemented. Steps 3-6 (reproduction confirmation, impact analysis, fix planning, TDD execution) are missing.

**Files to create/modify:**
- `forge/src/commands/bugfix.ts` — add `reproduce`, `plan`, `execute` subcommands
- `forge/tests/unit/commands/bugfix.test.ts` — add tests for new subcommands

**Steps:**
1. Add `reproduce` subcommand: updates bug-report.md with confirmed reproduction steps
2. Add `plan` subcommand: generates lightweight fix plan (1-3 tasks) in `fix-plan.md`
3. Add `execute` subcommand: runs TDD flow (write regression test → fix → verify)
4. Each subcommand validates that bugfix is active
5. Write tests for each subcommand, run, commit

---

## Task 4: Add `forge skills install` Command

**Problem**: `forge init` outputs "Install Forge skills: npx forge skills install" but the command doesn't exist.

**Files to create/modify:**
- `forge/src/commands/skills.ts` (new) — skills install command
- `forge/tests/unit/commands/skills.test.ts` (new) — tests
- `forge/src/index.ts` — register `skills` command

**Steps:**
1. Create `skills.ts` with `runSkillsInstall(projectRoot)` function
2. Copies all 8 skill files from `~/.agents/skills/forge/` to project-level `.claude/skills/forge/` (for Claude Code) and `.opencode/skills/forge/` (for OpenCode)
3. Reads detected platforms from config.json to decide which to install
4. Outputs summary of installed skills
5. Write tests, run, commit

---

## Task 5: Add Coverage Target to `forge status`

**Problem**: Design doc output includes "Coverage target: unit ≥80%, integration ≥60%". Current implementation only shows "Test mode: normal".

**Files to modify:**
- `forge/src/commands/status.ts` — read config.json test_coverage and append to output
- `forge/tests/unit/commands/status.test.ts` — update test to verify coverage line

**Steps:**
1. In `runStatus`, read config.json to get `test_coverage`
2. Append line: `Coverage target: unit ≥{unit}%, integration ≥{integration}%`
3. Handle missing config.json gracefully (skip coverage line)
4. Update test, run, commit

---
