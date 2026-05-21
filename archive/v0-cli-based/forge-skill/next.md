# Forge Skill: /next

## Trigger

User runs: `/next`

## Pre-flight Checks

1. Read `.forge/progress.json`
2. If file does not exist:
   - Output: "Forge is not initialized. Run: `forge init`"
   - Stop.
3. If `status` is `idle`:
   - Output: "No active feature. Run `/start` to begin."
   - Stop.

## State Machine

`/next` behaves differently based on current state:

| State | Phase | Action |
|-------|-------|--------|
| `planning` + `awaiting_confirmation` | Phase 2 | Planning → batch cutting → execute batch 1 |
| `executing` + batch not done | Phase 3 | Continue current batch |
| `executing` + batch done + more batches | Phase 3 | Start next batch |
| `executing` + all batches done | Phase 4 | Full verification |

---

## Phase 2: Planning (State A)

**Trigger**: `status=planning, phase=awaiting_confirmation`

### 2.1 Codebase Analysis (Existing Projects Only)

1. Read `.forge/config.json` to check `project_type`:
   - If `"existing"` → run GitNexus analysis
   - If `"new"` → skip this step
2. Run GitNexus `query` to understand:
   - Existing architecture and patterns
   - Relevant modules for the feature
   - Potential impact areas
3. Save analysis to `docs/forge/changes/<feature>/analysis.md`

### 2.2 Call Writing-Plans Skill

1. Load the Superpowers `writing-plans` skill
2. Provide:
   - `proposal.md` — the brainstorming output
   - `scenarios.json` — the confirmed scenarios
   - `analysis.md` — codebase analysis (if existing project)
3. The skill will:
   - Break the feature into discrete tasks
   - Assign matching scenarios to each task
   - Identify task dependencies
   - Estimate complexity
4. Save the output to `docs/forge/changes/<feature>/plans/full-plan.md`

### 2.3 Batch Cutting

1. Read the full plan and extract all tasks with their dependencies
2. Run `forge execute batch cut` or perform manually:
   - Topological sort by dependencies
   - Chunk into batches of max 6 tasks
   - Respect dependency order (no task before its dependencies)
3. Write each batch to `docs/forge/changes/<feature>/plans/batch-N.md`:

```markdown
# Batch N: <batch-title>

## Task 1: <title>
- Description: <detailed description>
- Scenarios: <scenario IDs>
- Dependencies: <task IDs or "none">
- Files: <expected files to create/modify>
- Test: <expected test file>

## Task 2: ...
```

4. Update `progress.json`:

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
        { "id": 1, "title": "<title>", "status": "pending" },
        ...
      ]
    }
  ],
  "updated_at": "<ISO-8601>"
}
```

### 2.4 Enter Phase 3

After batch cutting, immediately proceed to Phase 3: Execute Batch 1.

---

## Phase 3: Batch Execution (States B, C)

**Trigger**: `status=executing` with pending tasks in current batch

### 3.1 Read Current Batch

1. Read `progress.json` to find `current_batch`
2. Read `docs/forge/changes/<feature>/plans/batch-<N>.md`
3. Identify the next pending task (first task with `status: "pending"`)

### 3.2 Execute Task (TDD Loop)

For each task in the current batch:

#### Step 1: Update Task Status

```json
{ "batches[N].tasks[M].status": "in_progress" }
```

#### Step 2: Gather Context

1. Read the task definition from `batch-N.md`
2. Read matching scenarios from `scenarios.json`
3. Run GitNexus `impact` analysis on affected files (if existing project)
4. Read existing code patterns from related files

#### Step 3: Write Tests First (Red)

1. Write test code based on the task's scenarios
2. Tests MUST be derived from scenarios, not invented
3. Run tests to confirm they FAIL (red phase):
   - Run `forge execute task run-tests` or the project's test command
   - If tests pass unexpectedly → the test is wrong, fix it
   - If tests fail as expected → proceed to Step 4

#### Step 4: Write Implementation (Green)

1. Write the minimum code to make tests pass
2. Do NOT over-engineer — follow the plan, not assumptions
3. Run tests to confirm they PASS (green phase)

#### Step 5: Refactor

1. Clean up the implementation
2. Ensure tests still pass
3. Follow existing code conventions

#### Step 6: Post-Task Operations

1. **Run unit tests**: Execute the project's test command
2. **Auto-fix on failure** (max 3 rounds):
   - Read test error output
   - Fix the failing code
   - Re-run tests
   - If still failing after 3 rounds → mark task as `failed`, proceed to Step 7
3. **Git commit**:
   ```bash
   git add <affected-files>
   git commit -m "feat: <task-title> [forge task-<id>]"
   ```
4. **Update progress.json**:
   ```json
   {
     "batches[N].tasks[M]": {
       "status": "done",
       "commit": "<git-sha>",
       "completed_at": "<ISO-8601>"
     }
   }
   ```

#### Step 7: Report Result

Return structured result:
```json
{
  "taskId": <id>,
  "status": "done" | "failed",
  "commit": "<git-sha>"
}
```

### 3.3 Batch Completion

After all tasks in the current batch are done or failed:

1. Update batch status:
   ```json
   { "batches[N].status": "done", "completed_at": "<ISO-8601>" }
   ```

2. **Run integration tests** (if configured):
   - Run the project's integration test command
   - Record results in `docs/forge/changes/<feature>/test-report.html`

3. **Code review**:
   - Load the Superpowers `requesting-code-review` skill
   - Review all commits in this batch
   - Save review to `docs/forge/changes/<feature>/plans/review-batch-<N>.md`
   - If blocking issues found → output issues, stop, wait for human fix

4. **Session handoff**:
   - Load the internal `session-handoff.md` skill
   - Update `CLAUDE.md` with current progress and key decisions
   - Generate recovery instructions

5. **Prompt user**:

```
## Batch <N> Complete

Tasks: <done>/<total> done, <failed> failed

Review: passed, no blocking issues

Next:
- Run `/next` to continue with batch <N+1>
- Run `/status` to see full progress
- Open a new session and paste the recovery instructions below

--- COPY BELOW TO NEW SESSION ---
Continue feature: <feature-slug>
Completed: batch 1-<N> (<X> tasks done)
Next: batch <N+1>
Execute: /next
--- END COPY ---
```

### 3.4 Continue to Next Batch (State C)

If user runs `/next` and more batches remain:

1. Increment `current_batch` in `progress.json`
2. Set new batch status to `in_progress`
3. Proceed to Phase 3: Execute the next batch (repeat from 3.1)

---

## Phase 4: Full Verification (State D)

**Trigger**: `status=executing, all batches = done`

### 4.1 Run Full Test Suite

1. Run the project's full test command (unit + integration)
2. Record results in `docs/forge/changes/<feature>/test-report.html`
3. If tests fail → output fail list, stop, wait for human fix

### 4.2 Run Coverage Check

1. Run test coverage command
2. Compare against targets from `.forge/config.json.test_coverage`:
   - `unit` ≥ configured percentage
   - `integration` ≥ configured percentage
3. If coverage below target → output gaps, stop, wait for human fix

### 4.3 Run Code Review (Final)

1. Load the Superpowers `requesting-code-review` skill
2. Review ALL commits for this feature
3. Save final review to `docs/forge/changes/<feature>/review-final.md`
4. If blocking issues found → output issues, stop

### 4.4 Update Verification Status

```json
{
  "verification": {
    "status": "passed",
    "test_mode": "normal",
    "last_run": "<ISO-8601>",
    "report_path": "docs/forge/changes/<feature>/test-report.html"
  }
}
```

### 4.5 Prompt User

```
## Verification Complete

All tests passed. Coverage: unit <X>%, integration <Y>%
Code review: passed, no blocking issues

Run `/done` to archive this feature.
```

---

## Error Handling

- **No active feature**: "No active feature. Run `/start` to begin."
- **Task fails after 3 auto-fix rounds**: Mark as `failed`, output error summary, ask user: "Task <id> failed after 3 fix attempts. Fix manually and run `/next` to continue, or defer this task?"
- **Integration tests fail**: Output failing test list, stop. "Integration tests failed. Fix before continuing."
- **Code review blocking issue**: Output issue details, stop. "Code review found blocking issues. Fix before continuing."
- **Coverage below target**: Output gap details. "Coverage below target: unit <X>% < <target>%. Add tests before continuing."
- **Git commit fails**: Stop immediately. "Git commit failed. Check for uncommitted changes."
- **progress.json write fails**: Stop immediately. "Could not update progress.json."

## Notes

- `/next` is the engine of Forge — it drives planning, execution, and verification
- TDD is NOT optional: tests MUST be written before implementation
- Auto-fix has a hard limit of 3 rounds — no infinite loops
- Results are externalized to files, not held in conversation
- Batch isolation: each batch should fit in a single session context
- Never skip verification — even for "simple" tasks
- The orchestrator's context grows by only 4 tokens per task ("task N: done")
