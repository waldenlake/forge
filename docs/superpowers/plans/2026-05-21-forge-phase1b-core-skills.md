# Forge Phase 1b: Core Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the three core skills that drive the planning phase: /start (with auto-init), scenarios, and the planning portion of /next.

**Architecture:** Each skill is a SKILL.md file containing structured instructions for the AI. Skills reference each other by name (AI uses Skill tool to load). Skills operate directly on project files — no CLI intermediary.

**Tech Stack:** Markdown (SKILL.md format)

---

## File Structure

```
forge/skills/
  start/
    SKILL.md              # /start command: init + brainstorm + scenarios
  scenarios/
    SKILL.md              # Internal: generate scenarios.json + scenarios.md
  next/
    SKILL.md              # /next command: planning + batch cut + execution
```

---

### Task 1: Start Skill

**Files:**
- Create: `forge/skills/start/SKILL.md`

- [ ] **Step 1: Create start/SKILL.md**

```markdown
---
name: start
description: Begin a new feature — brainstorm, generate scenarios, get confirmation
---

# /start <requirement>

Begin a new work item (feature, project, or refactor).

## Pre-Conditions

1. Read `.forge/progress.json`
2. If file exists AND status ≠ "idle":
   → ERROR: "There is an active feature: <feature>. Complete it with /done or cancel by deleting .forge/progress.json"
3. If `.forge/config.json` does NOT exist:
   → Execute Auto-Initialization (see below)

## Auto-Initialization

Only runs if `.forge/config.json` is missing (first time using forge in this project).

1. **Detect project type:**
   - `.git/` exists → project_type = "existing"
   - No `.git/` → project_type = "new"

2. **Check Superpowers:**
   - Try loading Superpowers brainstorming skill
   - If unavailable → ERROR: "Forge requires Superpowers. Install it first:
     Claude Code: /plugin install superpowers@claude-plugins-official"

3. **Detect test framework:**
   - Check `package.json` → look for vitest/jest/mocha in devDependencies
   - Check `pytest.ini` or `pyproject.toml` → pytest
   - Check `go.mod` → go test
   - Check `Cargo.toml` → cargo test
   - None found → test_command = "", test_framework = "unknown"

4. **Create directory structure:**
   ```
   docs/forge/specs/
   docs/forge/changes/
   docs/forge/changes/archive/
   docs/forge/decisions/
   .forge/
   ```

5. **Write .forge/config.json:**
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

6. **Append to CLAUDE.md** (create if missing):
   ```markdown
   ## Forge

   **Project Info**
   - Test mode: normal
   - Test framework: <detected>
   - Project type: <new/existing>
   ```

7. Output: "Forge initialized. Continuing with /start..."

## Main Flow

1. **Generate feature slug** from the requirement:
   - Lowercase, hyphenated, max 40 chars
   - Example: "user authentication system" → "user-authentication"

2. **Create change directory:**
   ```
   docs/forge/changes/<feature-slug>/
   ```

3. **Initialize progress.json:**
   Write `.forge/progress.json`:
   ```json
   {
     "version": "1.0",
     "feature": "<feature-slug>",
     "status": "planning",
     "phase": "brainstorming",
     "created_at": "<ISO-8601 now>",
     "updated_at": "<ISO-8601 now>",
     "total_batches": 0,
     "current_batch": 0,
     "batches": [],
     "verification": {
       "status": "pending",
       "test_mode": "normal",
       "last_run": null
     }
   }
   ```

4. **Use the Superpowers `brainstorming` skill:**
   - Input: the user's requirement
   - Clarify all uncertainties through Socratic dialogue
   - If UI is involved, generate HTML mockup
   - If requirement spans >3 independent domains, suggest splitting
   - Output: write `docs/forge/changes/<feature>/proposal.md`

5. **Use the forge `scenarios` skill:**
   - Input: proposal.md (and mockup.html if exists)
   - Output: scenarios.json + scenarios.md in the change directory

6. **Present to user:**
   - Show proposal summary
   - Show scenarios.md
   - Ask: "Do these scenarios accurately describe your requirements?"

7. **Update progress.json:**
   Set phase to "awaiting_confirmation"

8. **Wait for user:**
   - User says /next → proceed to planning
   - User edits files and re-runs /start → overwrite
```

- [ ] **Step 2: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "feat: add /start skill with auto-initialization"
```

---

### Task 2: Scenarios Skill

**Files:**
- Create: `forge/skills/scenarios/SKILL.md`

- [ ] **Step 1: Create scenarios/SKILL.md**

```markdown
---
name: scenarios
description: Generate structured test scenarios from a proposal
---

# Scenarios Generation

Internal skill. Called by start/SKILL.md after brainstorming completes.

## Input

- `docs/forge/changes/<feature>/proposal.md` (required)
- `docs/forge/changes/<feature>/mockup.html` (optional)

## Output

- `docs/forge/changes/<feature>/scenarios.json` (machine-readable)
- `docs/forge/changes/<feature>/scenarios.md` (human-readable)

## Process

1. **Read proposal.md** — identify all distinct functional behaviors

2. **For each behavior, generate a scenario:**

   Each scenario MUST be:
   - Testable (no vague language like "works well")
   - Specific (concrete values, not "appropriate response")
   - Atomic (one behavior per scenario)

3. **Assign test types:**
   - `functional` — backend logic, API behavior
   - `ui` — visual behavior, user interaction
   - `integration` — cross-component interaction
   - `performance` — response time, throughput (only if proposal mentions it)

4. **Assign priorities:**
   - `P0` — Core functionality, must work or feature is broken
   - `P1` — Important but not blocking, should work
   - `P2` — Nice to have, can be deferred

5. **If mockup.html exists:**
   - Generate UI-specific scenarios for each interactive element
   - Reference specific UI elements ("login button", "error message div")

6. **Write scenarios.json:**

   ```json
   {
     "version": "1.0",
     "feature": "<feature-slug>",
     "source": "proposal.md",
     "generated_at": "<ISO-8601>",
     "scenarios": [
       {
         "id": 1,
         "title": "Descriptive title",
         "given": "Initial state/context",
         "when": "Action/trigger",
         "then": [
           { "assertion": "Expected outcome 1", "type": "functional" },
           { "assertion": "Expected outcome 2", "type": "ui" }
         ],
         "testTypes": ["functional", "ui"],
         "priority": "P0"
       }
     ]
   }
   ```

7. **Write scenarios.md** (rendered for human reading):

   ```markdown
   # Scenarios: <Feature Title>

   ## Scenario 1: <Title>
   **Given**: <initial state>
   **When**: <action>
   **Then**:
     - <assertion 1>
     - <assertion 2>

   **Test Type**: <types>
   **Priority**: P0
   ```

8. **Validation rules:**
   - Every scenario must have at least one assertion in `then`
   - At least one P0 scenario must exist
   - IDs must be sequential starting from 1
   - No duplicate titles

## Important

- Scenarios are the source of truth for testing. They will be used by
  writing-plans to generate TDD test cases.
- Every scenario MUST be confirmable by a human reading it.
- Do NOT include implementation details in scenarios — only observable behavior.
```

- [ ] **Step 2: Commit**

```bash
git add skills/scenarios/SKILL.md
git commit -m "feat: add scenarios skill for structured test scenario generation"
```

---

### Task 3: Next Skill (Planning Phase)

**Files:**
- Create: `forge/skills/next/SKILL.md`

- [ ] **Step 1: Create next/SKILL.md**

```markdown
---
name: next
description: Confirm design and execute, or continue after batch completion
---

# /next

Advance the forge workflow. Behavior depends on current state.

## Read State

Read `.forge/progress.json`. Determine scenario:

| Status | Phase | Action |
|--------|-------|--------|
| planning | awaiting_confirmation | → Scenario A: Begin planning + execution |
| executing | current batch in_progress | → Scenario B: Continue current batch |
| executing | current batch done, more remain | → Scenario C: Start next batch |
| executing | all batches done | → Scenario D: Full verification |
| idle | — | → ERROR: "No active feature. Use /start first." |
| bugfix | — | → ERROR: "Bugfix in progress. Complete it or cancel." |

## Scenario A: Planning + First Execution

**Trigger:** status=planning, phase=awaiting_confirmation

1. **GitNexus analysis (existing projects only):**
   - Read config.json project_type
   - If "existing": check if GitNexus is available
     - Available → run dependency analysis on the project
     - Not available → warn "Proceeding without dependency analysis"
   - If "new": skip

2. **Use the Superpowers `writing-plans` skill:**
   - Input:
     - `docs/forge/changes/<feature>/proposal.md`
     - `docs/forge/changes/<feature>/scenarios.json`
     - GitNexus dependency graph (if available)
   - The plan MUST:
     - Assign each task one or more scenarios from scenarios.json
     - Include TDD steps derived from those scenarios
     - Be implementable by someone with zero project context
   - Output: `docs/forge/changes/<feature>/plans/full-plan.md`

3. **Batch cutting:**
   Read full-plan.md, extract tasks and their dependencies.

   Algorithm:
   a. Parse all tasks, identify dependencies (Task N depends on Task M)
   b. Topological sort
   c. Group into batches of max `config.json.batch_size` (default 6)
   d. Rule: if Task A depends on Task B, B must be in an earlier batch

   Write each batch to: `docs/forge/changes/<feature>/plans/batch-N.md`

   Each batch file contains the full task definitions for that batch
   (copied from full-plan.md, not references).

4. **Update progress.json:**
   ```json
   {
     "status": "executing",
     "phase": "batch_execution",
     "total_batches": <N>,
     "current_batch": 1,
     "batches": [
       {
         "batch": 1,
         "status": "in_progress",
         "started_at": "<ISO-8601>",
         "tasks": [
           { "id": 1, "title": "...", "status": "pending" },
           { "id": 2, "title": "...", "status": "pending" },
           ...
         ]
       },
       {
         "batch": 2,
         "status": "pending",
         "tasks": [...]
       }
     ]
   }
   ```

5. **Begin batch 1 execution:**
   Proceed to Scenario B logic.

## Scenario B: Execute Current Batch

**Trigger:** status=executing, current batch has pending/in_progress tasks

For each pending task in the current batch (in order):

1. Read task definition from `batch-N.md`
2. Update task status to "in_progress" in progress.json
3. **Use the Superpowers `subagent-driven-development` skill:**
   - Dispatch a subagent with:
     - The task definition (from batch file)
     - Matching scenarios from scenarios.json
     - Impact analysis (if GitNexus available)
   - Subagent executes TDD: write test (red) → implement (green) → refactor
   - Subagent commits result
4. **Use the forge `progress-tracking` skill:**
   - Run tests, update progress.json, handle failures
5. Continue to next task

After ALL tasks in batch complete:
- Set batch status to "done"
- **Use the Superpowers `requesting-code-review` skill:**
  - Review against scenarios (spec compliance)
  - Review code quality
  - Write review to `docs/forge/changes/<feature>/review-batch-N.md`
  - If blocking issues → set batch status "blocked", STOP
- **Use the forge `session-handoff` skill:**
  - Update CLAUDE.md
  - Generate recovery instructions
  - Prompt user: "Batch N complete. Recommend opening new session. Run /next to continue."

## Scenario C: Start Next Batch

**Trigger:** status=executing, current batch done, more batches remain

1. Increment current_batch in progress.json
2. Set next batch status to "in_progress"
3. Proceed to Scenario B logic

## Scenario D: Full Verification

**Trigger:** status=executing, all batches done

1. Run full test suite (test command from config.json)
2. Run build command (if detectable: npm run build / cargo build / etc.)
3. Check coverage meets targets from config.json
4. Write test report: `docs/forge/changes/<feature>/test-report.html`
5. Update progress.json:
   ```json
   {
     "status": "verification_complete",
     "verification": {
       "status": "passed" | "failed",
       "test_mode": "normal",
       "last_run": "<ISO-8601>",
       "report_path": "docs/forge/changes/<feature>/test-report.html"
     }
   }
   ```
6. If passed: "All tests pass. Run /done to archive."
7. If failed: "Tests failed. Review test-report.html and fix issues."
```

- [ ] **Step 2: Commit**

```bash
git add skills/next/SKILL.md
git commit -m "feat: add /next skill with planning, batch execution, and verification"
```

---

## Summary

After completing all 3 tasks, the core planning flow works:
- /start: auto-inits, brainstorms, generates scenarios, waits for confirmation
- scenarios: generates structured JSON + human-readable scenarios
- /next: plans tasks, cuts batches, executes via subagents, verifies

Next phase (1c) will implement progress-tracking, session-handoff, and /resume.
