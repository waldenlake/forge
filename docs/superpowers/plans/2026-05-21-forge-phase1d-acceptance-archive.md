# Forge Phase 1d: Acceptance & Archive Skills

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement /done (acceptance + archive) and /bugfix (lightweight bug fix flow), completing the full forge lifecycle.

**Architecture:** These skills handle end-of-lifecycle operations. /done archives completed features. /bugfix provides a streamlined path that skips full planning.

**Tech Stack:** Markdown (SKILL.md format)

---

## File Structure

```
forge/skills/
  done/
    SKILL.md              # /done command: verify + archive + cleanup
  bugfix/
    SKILL.md              # /bugfix command: lightweight bug fix
```

---

### Task 1: Done Skill

**Files:**
- Create: `forge/skills/done/SKILL.md`

- [ ] **Step 1: Create done/SKILL.md**

```markdown
---
name: done
description: Complete a feature — verify, archive, and clean up
---

# /done

Complete the current feature. Verify all work is done, archive artifacts,
update project knowledge.

## Pre-Conditions

1. Read `.forge/progress.json`
   - File missing → ERROR: "No active feature."
   - status = "idle" → ERROR: "No active feature."
   - status = "planning" → ERROR: "Feature still in planning. Use /next to begin execution."
   - status = "bugfix" → proceed (bugfix completion)

2. Check all batches:
   - Every batch must have status "done"
   - OR: some tasks may be "deferred" (acceptable)
   - Any batch "in_progress", "pending", "blocked", or "failed":
     → ERROR: "Cannot complete. Outstanding work:
       - Batch <N>: <status> (<count> tasks remaining)
       Finish or defer remaining tasks before /done."

3. Check verification:
   - verification.status should be "passed"
   - If "pending" or "failed":
     → WARN: "Verification not passed. Running full verification now..."
     → Execute Scenario D from /next (full verification)
     → If fails: ERROR: "Verification failed. Fix issues before /done."

## Main Flow

### 1. Merge Scenarios to Project Specs

Copy scenarios to permanent spec storage:
```
cp docs/forge/changes/<feature>/scenarios.json \
   docs/forge/specs/<feature>-scenarios.json
```

These scenarios become permanent project knowledge — future development
can reference them to understand expected behavior.

### 2. Update CLAUDE.md

In the `## Forge` section, move current feature to **Completed Features**:

```markdown
**Completed Features**
- <feature-slug> (<YYYY-MM-DD>)
  - Tasks: <completed>/<total> (deferred: <count>)
  - Test coverage: <from verification report if available>
  - Key decisions: <any ADRs created>
```

Remove the **Current Feature** subsection (or set to "None").

### 3. Archive Change Directory

```bash
mkdir -p docs/forge/changes/archive/
mv docs/forge/changes/<feature> \
   docs/forge/changes/archive/<YYYY-MM-DD>-<feature>/
```

### 4. Clean progress.json

Write:
```json
{
  "version": "1.0",
  "feature": null,
  "status": "idle",
  "phase": null,
  "created_at": null,
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

### 5. Git Commit

```bash
git add -A
git commit -m "feat: complete feature <feature-slug> [forge done]"
```

### 6. Output Completion Summary

```
Feature Complete
================
Feature: <feature-slug>
Status: ✅ done
Tasks: <completed>/<total>
Deferred: <count> (if any)
Archived to: docs/forge/changes/archive/<date>-<feature>/
Scenarios saved: docs/forge/specs/<feature>-scenarios.json

Project knowledge updated in CLAUDE.md.
Ready for next feature — use /start.
```
```

- [ ] **Step 2: Commit**

```bash
git add skills/done/SKILL.md
git commit -m "feat: add /done skill for feature completion and archival"
```

---

### Task 2: Bugfix Skill

**Files:**
- Create: `forge/skills/bugfix/SKILL.md`

- [ ] **Step 1: Create bugfix/SKILL.md**

```markdown
---
name: bugfix
description: Lightweight bug fix flow with regression test
---

# /bugfix <description>

Streamlined bug fix process. Skips full brainstorming/planning — goes
straight from description to fix with TDD (regression test first).

## Pre-Conditions

1. `<description>` must not be empty
   - Empty → ERROR: "Please describe the bug. Include error messages, reproduction steps, or affected behavior."

2. Read `.forge/progress.json`
   - Active feature in progress → WARN: "Feature <name> is in progress. Bugfix will run in parallel. Continue? (yes/no)"
   - If user says no → stop

## Main Flow

### 1. Create Bugfix Directory

Generate bugfix ID: `bugfix-<short-description-slug>`
```
docs/forge/changes/bugfix-<id>/
```

### 2. Update progress.json

If no active feature (status=idle):
```json
{
  "status": "bugfix",
  "feature": "bugfix-<id>",
  "phase": "batch_execution",
  "created_at": "<ISO-8601>",
  "updated_at": "<ISO-8601>",
  "total_batches": 1,
  "current_batch": 1,
  "batches": [{
    "batch": 1,
    "status": "in_progress",
    "tasks": []
  }]
}
```

### 3. Clarify Reproduction

If the description is unclear (no concrete steps or error messages):
- Ask: "Can you provide reproduction steps? e.g.:
  1. Go to <page>
  2. Click <button>
  3. Expected: <X>, Actual: <Y>"
- Keep asking until reproduction is concrete enough to write a test

Write reproduction to: `docs/forge/changes/bugfix-<id>/reproduction.md`

### 4. Impact Analysis (if GitNexus available)

If GitNexus is available:
- Analyze which files/functions are likely involved
- Write to: `docs/forge/changes/bugfix-<id>/impact.md`

### 5. Generate Fix Plan

Create a lightweight plan (1-3 tasks):

**Task 1:** Write regression test
- Convert reproduction steps into a failing test
- Test MUST fail before the fix (confirms bug exists)

**Task 2:** Fix the bug
- Implement minimal fix to make the regression test pass
- Do NOT refactor or change unrelated code

**Task 3 (if needed):** Verify no side effects
- Run full test suite
- Check for regressions in related areas

Write plan to: `docs/forge/changes/bugfix-<id>/fix-plan.md`

### 6. Execute Fix (TDD)

For each task:

1. **Use Superpowers `test-driven-development` skill:**
   - Task 1: Write regression test → verify it FAILS (red)
   - Task 2: Fix implementation → verify test PASSES (green)
   - Task 3: Run full test suite → all pass

2. **Use forge `progress-tracking` skill:**
   - Commit each step
   - Update progress.json

### 7. Verification

1. Run full test suite (not just the new test)
2. Verify the original reproduction steps no longer trigger the bug
3. If test suite passes → proceed to archive
4. If tests fail → auto-fix (max 3 rounds) → if still fails → stop, ask human

### 8. Archive

1. Move bugfix directory to archive:
   ```bash
   mv docs/forge/changes/bugfix-<id> \
      docs/forge/changes/archive/<YYYY-MM-DD>-bugfix-<id>/
   ```

2. Clean progress.json → status: "idle"

3. Commit:
   ```bash
   git add -A
   git commit -m "fix: <bug-description> [forge bugfix-<id>]"
   ```

4. Output summary:
   ```
   Bugfix Complete
   ===============
   Bug: <description>
   Regression test: <test file path>
   Fix: <brief description of change>
   All tests passing: ✅
   Archived to: docs/forge/changes/archive/<date>-bugfix-<id>/
   ```
```

- [ ] **Step 2: Commit**

```bash
git add skills/bugfix/SKILL.md
git commit -m "feat: add /bugfix skill for lightweight bug fix flow"
```

---

## Summary

After completing both tasks, the full forge lifecycle is functional:
- /start → /next → (batch execution loop) → /done
- /bugfix → (quick TDD fix) → archive
- /resume works at any interruption point

This completes the Phase 1 MVP skill set. Phase 1e (OpenCode support) can
be done independently.
