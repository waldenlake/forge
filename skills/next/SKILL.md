---
name: next
description: Confirm design and execute, or continue after batch completion
---

# /next

Advance the Forge workflow. Behavior depends on current state.

## First: Output Command Identifier

```
⚒ forge · /next
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Read State

Read `.forge/progress.json`. Determine which scenario applies:

| Status | Phase / Condition | Action |
|--------|-------------------|--------|
| `planning` | `awaiting_confirmation` | → **Scenario A**: Plan + begin execution |
| `executing` | current batch has pending/in_progress tasks | → **Scenario B**: Execute current batch |
| `executing` | current batch done, more batches remain | → **Scenario C**: Start next batch |
| `executing` | all batches done | → **Scenario D**: Full verification |
| `idle` | — | → ERROR: "No active feature. Use `/start` first." |
| `bugfix` | — | → ERROR: "Bugfix in progress. Complete it or cancel." |

---

## Scenario A: Planning + First Execution

**Trigger:** `status = "planning"`, `phase = "awaiting_confirmation"`

### Step 1: GitNexus Analysis (existing projects only)

1. Read `.forge/config.json` → check `project_type`
2. If `"existing"`:
   - Check if GitNexus is available
   - If available → run dependency analysis, save output for use in planning
   - If NOT available → warn: "Proceeding without dependency analysis (GitNexus not available)"
3. If `"new"` → skip this step entirely

### Step 2: Generate Implementation Plan

Output:
```
▸ Phase 4 · Planning
    → Generating implementation plan...
```

**Use the Superpowers `writing-plans` skill.**

Provide as input:
- `docs/forge/changes/<feature>/proposal.md`
- `docs/forge/changes/<feature>/scenarios.json`
- GitNexus dependency information (if available from Step 1)

Requirements for the plan:
- Every task MUST reference one or more scenarios from scenarios.json by ID
- Every task MUST include TDD steps derived from those scenarios
- Tasks should be 2-5 minutes of work each
- Tasks should be implementable by someone with zero project context

Output location: `docs/forge/changes/<feature>/plans/full-plan.md`

After plan written, output:
```
    ✓ full-plan.md written (<N> tasks)
```

### Step 3: Batch Cutting

Output:
```
    → Cutting batches...
```

Read `full-plan.md` and extract all tasks with their dependencies.

**Algorithm:**

1. Parse all tasks. For each task identify:
   - Task ID (sequential number)
   - Title
   - Dependencies (which other tasks must complete first)

2. Build dependency graph.

3. Topological sort:
   - Tasks with no dependencies come first
   - Tasks that depend on others come after their dependencies

4. Read batch size from `.forge/config.json` → `batch_size` (default: 6)

5. Group into batches:
   - Walk the sorted list
   - Add tasks to current batch until batch is full OR next task depends on a task not yet in a completed batch
   - Start new batch when needed
   - Rule: if Task A depends on Task B, B must be in an earlier (lower-numbered) batch

6. Write each batch to a separate file:
   ```
   docs/forge/changes/<feature>/plans/batch-1.md
   docs/forge/changes/<feature>/plans/batch-2.md
   ...
   ```
   Each batch file contains the FULL task definitions (copied from full-plan.md, not references).

After batch cutting, output:
```
    ✓ <N> batches created
```

### Step 4: Update progress.json

```json
{
  "version": "1.0",
  "feature": "<feature-slug>",
  "status": "executing",
  "phase": "batch_execution",
  "updated_at": "<ISO-8601 now>",
  "total_batches": <N>,
  "current_batch": 1,
  "batches": [
    {
      "batch": 1,
      "status": "in_progress",
      "started_at": "<ISO-8601 now>",
      "tasks": [
        { "id": 1, "title": "<from plan>", "status": "pending" },
        { "id": 2, "title": "<from plan>", "status": "pending" },
        ...
      ]
    },
    {
      "batch": 2,
      "status": "pending",
      "tasks": [
        { "id": 7, "title": "<from plan>", "status": "pending" },
        ...
      ]
    }
  ],
  "verification": {
    "status": "pending",
    "test_mode": "<from config.json>",
    "last_run": null
  }
}
```

### Step 5: Begin Execution

Output:
```
▸ Phase 5 · Execution (Batch 1/<N>)
```

Proceed immediately to **Scenario B** (execute current batch).

---

## Scenario B: Execute Current Batch

**Trigger:** `status = "executing"`, current batch has tasks with status `"pending"` or `"in_progress"`

If not already displayed (e.g., coming from Scenario C), output:
```
▸ Phase 5 · Execution (Batch <current>/<total>)
```

### For each pending task (in order):

1. **Read task definition** from `batch-<N>.md`

2. **Output progress:**
   ```
       → Task <id>: <title>...
   ```

3. **Update progress.json:** Set task status to `"in_progress"`, add `started_at`

3. **Dispatch subagent:**
   Use the Superpowers `subagent-driven-development` skill.
   
   Provide the subagent with:
   - The full task definition from the batch file
   - The matching scenarios from `scenarios.json` (referenced by ID in the task)
   - Impact analysis from GitNexus (if available):
     * Run GitNexus blast-radius query for files the task will modify
     * Include affected functions/callers in subagent context
   
   The subagent will:
   - Write tests first (from scenarios — red)
   - Implement to pass tests (green)
   - Refactor
   - Run verification steps from the task

4. **Run progress-tracking:**
   Use the Forge `progress-tracking` skill.
   
   This will:
   - Run the test suite
   - Handle test failures (auto-fix up to 3 rounds)
   - Git commit on success
   - Update progress.json task entry

5. **Context discipline:**
   After progress-tracking completes, output:
   ```
       ✓ Task <id>: done
   ```
   Record ONLY "Task N: done" in conversation. Do NOT retain task details.

6. **If task failed:** Output `    ✗ Task <id>: failed (<reason>)` and STOP. Do not proceed to next task. Report to user.

7. **Continue** to next pending task.

### After all tasks in batch complete:

1. **Update batch status** in progress.json: `"done"`, add `completed_at`

2. **Run integration tests** (if configured):
   - Check `config.json` → `test_coverage.integration` value
   - If > 0: run integration test suite (same test command, or dedicated integration command if configured)
   - If integration tests fail → output failures, set batch status `"blocked"`, STOP
   - If pass → continue

3. **Code review:**
   Use the Superpowers `requesting-code-review` skill.
   
   Review scope: all commits in this batch (identified by `[forge task-N]` messages)
   
   Two stages:
   - Spec compliance: do changes match the scenarios?
   - Code quality: DRY, YAGNI, naming, structure
   
   Write review to: `docs/forge/changes/<feature>/review-batch-<N>.md`
   
   If blocking issues found:
   - Set batch status to `"blocked"` in progress.json
   - Output the blocking issues to user
   - STOP. Wait for human to fix or approve.

4. **Session handoff:**
   Use the Forge `session-handoff` skill.
   
   This will:
   - Update CLAUDE.md with progress
   - Generate recovery instructions
   - Prompt user to open new session or continue with /next

---

## Scenario C: Start Next Batch

**Trigger:** `status = "executing"`, current batch status = `"done"`, more batches remain

1. Increment `current_batch` in progress.json
2. Set the next batch status to `"in_progress"`, add `started_at`
3. Update `updated_at`
4. Proceed to **Scenario B**

---

## Scenario D: Full Verification

**Trigger:** `status = "executing"`, ALL batches have status `"done"`

Output:
```
▸ Phase 6 · Verification
    → Running full test suite...
```

### Step 1: Run Full Test Suite

1. Read test command from `.forge/config.json` → `test_command`
2. If empty, auto-detect (same logic as progress-tracking)
3. Run the full test suite
4. Capture: pass/fail count, coverage percentage (if available)

### Step 2: Build Verification

Detect and run build command:
- `package.json` with `scripts.build` → `npm run build`
- `Cargo.toml` → `cargo build`
- `go.mod` → `go build ./...`
- None detected → skip with warning

### Step 3: Coverage Check

Compare coverage against `.forge/config.json` → `test_coverage` targets:
- `unit`: minimum unit test coverage percentage
- `integration`: minimum integration test coverage
- `e2e`: which priority scenarios must pass

### Step 4: Write Test Report

Write to: `docs/forge/changes/<feature>/test-report.html`

Include:
- Test pass/fail summary
- Coverage percentage
- Build result
- Failed tests (if any) with error messages
- Timestamp

(For Phase 1, a simple markdown-formatted report is acceptable. HTML template can be enhanced later.)

### Step 5: Update progress.json

```json
{
  "status": "verification_complete",
  "verification": {
    "status": "passed" | "failed",
    "test_mode": "normal",
    "last_run": "<ISO-8601 now>",
    "report_path": "docs/forge/changes/<feature>/test-report.html"
  }
}
```

### Step 6: Report to User

**If passed:**
Output:
```
    ✓ Tests passing
    ✓ Build OK
    ✓ Coverage: <X>% (target: <Y>%)

▸ Verification Complete ✓
    Run /done to archive this feature.
```

**If failed:**
Output:
```
    ✗ Tests failed (<N> failures)
    Coverage: <X>% (target: <Y>%)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠ Verification failed.

  See report: docs/forge/changes/<feature>/test-report.html
  Fix failing tests and run /next again.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Error Handling

| Condition | Response |
|-----------|----------|
| progress.json missing | "No active feature. Use `/start` first." |
| Status/phase combination not recognized | "Unexpected state: status=<X>, phase=<Y>. Check `.forge/progress.json` for corruption." |
| writing-plans produces no output | "Plan generation failed. Check proposal.md and scenarios.json for completeness." |
| Batch cutting finds circular dependencies | "Circular dependency detected between tasks. Fix the plan and retry." |
| All tasks fail in a batch | "All tasks in batch <N> failed. Human intervention required." |

---

## Dependencies

This skill uses:
- **Superpowers: writing-plans** — for implementation plan generation
- **Superpowers: subagent-driven-development** — for task execution via subagents
- **Superpowers: requesting-code-review** — for post-batch code review
- **Forge: progress-tracking** — for post-task state management
- **Forge: session-handoff** — for cross-session recovery preparation
- **GitNexus** (optional) — for dependency analysis and blast radius
