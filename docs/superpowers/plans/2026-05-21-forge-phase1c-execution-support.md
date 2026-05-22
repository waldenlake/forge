# Forge Phase 1c: Execution Support Skills

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the three support skills that enable reliable batch execution: progress-tracking (post-task operations), session-handoff (post-batch operations), and /resume (session recovery).

**Architecture:** These skills are called by next/SKILL.md during execution. They manage state files and cross-session continuity.

**Tech Stack:** Markdown (SKILL.md format)

---

## File Structure

```
forge/skills/
  progress-tracking/
    SKILL.md              # Internal: post-task standard operations
  session-handoff/
    SKILL.md              # Internal: post-batch CLAUDE.md update
  resume/
    SKILL.md              # /resume command: session recovery
```

---

### Task 1: Progress-Tracking Skill

**Files:**
- Create: `forge/skills/progress-tracking/SKILL.md`

- [ ] **Step 1: Create progress-tracking/SKILL.md**

```markdown
---
name: progress-tracking
description: Standard operations after each task completes
---

# Progress Tracking

Internal skill. Called by next/SKILL.md after each subagent task completes.

## Purpose

Ensure consistent post-task operations:
1. Verify tests pass
2. Commit changes
3. Update progress.json
4. Keep orchestrator context minimal

## Process

### 1. Run Tests

Determine test command:
1. Read `.forge/config.json` → `test_command` field
2. If empty or missing, auto-detect:
   - `package.json` exists with scripts.test → `npm test`
   - `pytest.ini` or `pyproject.toml` exists → `pytest`
   - `go.mod` exists → `go test ./...`
   - `Cargo.toml` exists → `cargo test`
3. If still unknown → WARN: "No test command detected. Skipping test verification."

Run the test command.

### 2. Handle Test Failure

If tests fail:
- **Round 1-3:** Auto-fix
  1. Read test output, identify failing tests
  2. Fix the implementation (do NOT modify the test unless the test itself is wrong)
  3. Re-run tests
- **After 3 rounds still failing:**
  1. Update progress.json task status to "failed"
  2. Update batch status to "failed"
  3. Output: "Task <N> failed after 3 fix attempts. Failing tests: <list>. Human intervention needed."
  4. STOP execution. Do not proceed to next task.

### 3. Git Commit

If tests pass:
```bash
git add -A
git commit -m "feat: <task-title> [forge task-<id>]"
```

Capture the commit SHA.

### 4. Update progress.json

Update the current task entry:
```json
{
  "id": <task-id>,
  "title": "<task-title>",
  "status": "done",
  "commit": "<commit-sha>",
  "completed_at": "<ISO-8601>"
}
```

Update `updated_at` at the root level.

### 5. Context Discipline

**CRITICAL:** The orchestrator (the session running /next) MUST NOT retain
detailed task results in conversation history.

After this skill completes, the orchestrator records ONLY:
- "Task N: done" (or "Task N: failed")

All details live in:
- `.forge/progress.json` (status, commit)
- Git history (actual changes)
- Test output (if needed for debugging)

Do NOT summarize what the task did. Do NOT paste code back to orchestrator.
```

- [ ] **Step 2: Commit**

```bash
git add skills/progress-tracking/SKILL.md
git commit -m "feat: add progress-tracking skill for post-task operations"
```

---

### Task 2: Session-Handoff Skill

**Files:**
- Create: `forge/skills/session-handoff/SKILL.md`

- [ ] **Step 1: Create session-handoff/SKILL.md**

```markdown
---
name: session-handoff
description: Prepare cross-session recovery after batch completion
---

# Session Handoff

Internal skill. Called by next/SKILL.md after a batch completes successfully.

## Purpose

Ensure that a new session can pick up exactly where we left off, without
relying on conversation history.

## Process

### 1. Read Current State

Read `.forge/progress.json`:
- feature name
- current_batch (just completed)
- total_batches
- count of completed tasks vs total tasks

### 2. Update CLAUDE.md

Find the `## Forge` section in CLAUDE.md (or create it).
Replace the **Current Feature** subsection with:

```markdown
**Current Feature**
- Feature: <feature-slug>
- Completed: batch 1-<N> (task 1-<M>)
- Review: batch <N> passed / blocked
- Next: batch <N+1>, starting from task <M+1>
```

If all batches done, write:
```markdown
**Current Feature**
- Feature: <feature-slug>
- Status: all batches complete, awaiting /done
- Total tasks: <count>
```

### 3. Generate Recovery Instructions

Output to the user:

```
Batch <N> complete (<done>/<total> tasks done).

Recommend opening a new session to avoid context buildup.
Copy this to the new session:

  /resume
```

### 4. Context Budget Check

If total_batches > current_batch (more work remains):
- Strongly recommend new session
- Explain: "Each batch uses ~20-30k tokens of context. A fresh session ensures reliable execution."

If current_batch == total_batches:
- All done, next step is /done
- New session optional but /done is lightweight
```

- [ ] **Step 2: Commit**

```bash
git add skills/session-handoff/SKILL.md
git commit -m "feat: add session-handoff skill for cross-session recovery"
```

---

### Task 3: Resume Skill

**Files:**
- Create: `forge/skills/resume/SKILL.md`

- [ ] **Step 1: Create resume/SKILL.md**

```markdown
---
name: resume
description: Resume work after session interruption
---

# /resume

Resume interrupted work. Reads state from files, locates position, confirms
with user, then continues.

## Pre-Conditions

1. Read `.forge/progress.json`
   - File missing → ERROR: "No active forge feature found. Use /start to begin."
   - status = "idle" → ERROR: "No active feature. Use /start to begin."

## Main Flow

### 1. Read State

From `.forge/progress.json`:
- feature name
- status, phase
- current_batch
- For current batch: which tasks are done, which pending/in_progress

From `CLAUDE.md` (## Forge section):
- Cross-reference with progress.json for consistency

### 2. Output Location Summary

```
Forge Resume
============
Feature: <feature-slug>
Status: <status> / <phase>

Progress: batch <current>/<total>
  Batch 1: ✅ done (<N> tasks)
  Batch 2: 🔄 in_progress (<done>/<total> tasks)
    - Task 7: ✅ done
    - Task 8: ⚠️ in_progress (interrupted)
    - Task 9: ⏳ pending
    - Task 10: ⏳ pending
  Batch 3: ⏳ pending

Next action: continue Task 8
```

### 3. Consistency Check

For each task marked "done" in progress.json:
- Check git log for commit matching `[forge task-<id>]`
- If commit missing → WARN: "Task <id> marked done but no commit found."

If inconsistencies found:
- List them
- Ask: "Some tasks may need re-execution. Continue anyway? (yes/no/re-execute <task-ids>)"

### 4. User Confirmation

Ask: "Resume from this point? (yes / no / show details)"

- "yes" → proceed
- "no" → stop
- "show details" → read and display the in-progress task definition from batch file

### 5. Continue

Once confirmed, behave as if /next was called:
- If current batch has pending tasks → execute them (Scenario B of /next)
- If current batch is done → start next batch (Scenario C of /next)
- If all done → verification (Scenario D of /next)
```

- [ ] **Step 2: Commit**

```bash
git add skills/resume/SKILL.md
git commit -m "feat: add /resume skill for session recovery"
```

---

## Summary

After completing all 3 tasks:
- progress-tracking: reliable post-task operations (test, commit, update state)
- session-handoff: CLAUDE.md update + recovery instructions after each batch
- /resume: full state recovery from files when starting a new session

Next phase (1d) will implement /done and /bugfix.
