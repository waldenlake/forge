---
name: next
description: Confirm design and execute, or continue execution
---

# /next

Advance the Forge workflow. Behavior depends on current state.

## First: Output Command Identifier

```
⚒ forge · /next
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Read State

**SCHEMA VALIDATION:** All progress.json reads/writes in this skill must conform
to `schemas/progress.schema.json`. Strict enums for status, task status, guard
status. Reference the schema before writing.

Read `.forge/progress.json`. Determine which scenario applies:

| Status | Condition | Action |
|--------|-----------|--------|
| `planning` | scenarios.json exists, no plan_path | → **Scenario A**: Plan + begin execution |
| `executing` | tasks have `pending` or `in_progress` | → **Scenario B**: Execute remaining tasks |
| `executing` | all tasks `done` or `deferred` | → **Scenario C**: Full verification |
| `idle` | — | → ERROR: "No active feature. Use `/start` first." |
| `bugfix` | — | → ERROR: "Bugfix in progress. Complete it or cancel." |

---

## Scenario A: Planning + First Execution

**Trigger:** `status = "planning"` and `.forge/scenarios.json` exists.

### Step 1: GitNexus Analysis (existing projects only)

1. Read `.forge/config.json` → check `project_type`
2. If `"existing"`:
   - Check if GitNexus is available
   - Available → run dependency analysis, save output for use in planning
   - NOT available → warn: "Proceeding without dependency analysis (GitNexus not available)"
3. If `"new"` → skip

### Step 2: Generate Implementation Plan

Output:
```
▸ Phase 4 · Planning
    → Generating implementation plan...
```

**Use the Superpowers `writing-plans` skill.**

Provide as input:
- The spec path from `progress.json.spec_path`
- `.forge/scenarios.json` (every task should reference one or more scenario IDs)

Requirements for the plan:
- Each task includes TDD steps derived from referenced scenarios
- 2-5 minutes per task
- Implementable with zero project context

Superpowers writes the plan to:
```
docs/superpowers/plans/YYYY-MM-DD-<feature>.md
```

After plan is written:
- Capture the plan path
- Update `progress.json.plan_path` with this path
- Output: `    ✓ plan written: <path>`

### Step 3: Extract Tasks from Plan

Output:
```
    → Extracting tasks...
```

Read the Superpowers plan file. For each task in the plan, extract:
- ID (sequential number, 1-indexed)
- Title (from the task heading)

Populate `progress.json.tasks` with the flat list. Do NOT split into batches—
quality checks happen via Guards (see Step 5).

```json
{
  "tasks": [
    { "id": 1, "title": "Set up project structure", "status": "pending" },
    { "id": 2, "title": "Add user model", "status": "pending" }
  ]
}
```

Output: `    ✓ <N> tasks extracted`

### Step 4: Update progress.json

Set:
```json
{
  "status": "executing",
  "updated_at": "<ISO-8601>",
  "plan_path": "<from Step 2>",
  "total_tasks": <N>,
  "completed_tasks": 0
}
```

### Step 5: Begin Execution

Proceed immediately to **Scenario B**.

---

## Scenario B: Execute Tasks

**Trigger:** `status = "executing"` and tasks have `pending` or `in_progress` status.

Output (if not already shown):
```
▸ Phase 5 · Execution
```

For each pending task in order:

1. **Read task definition** from the plan file at `progress.json.plan_path`

2. **Update progress.json:** Set task status to `"in_progress"`, add `started_at`

3. **Output progress:**
   ```
       → Task <id>: <title>...
   ```

4. **Dispatch subagent:**
   Use the Superpowers `subagent-driven-development` skill.
   
   Provide:
   - The full task definition (from plan file)
   - Matching scenarios from `.forge/scenarios.json` (referenced by ID in the task)
   - Impact analysis from GitNexus (if available)

5. **Run progress-tracking:**
   Use the Forge `progress-tracking` skill. It will:
   - Run tests
   - Auto-fix failures (max 3 rounds)
   - Git commit on success: `feat: <task-title> [forge task-<id>]`
   - Update task status to `"done"` in progress.json
   - Increment `completed_tasks`
   - **Trigger Guards** if conditions met (see config.json `guards`)

6. **Output result:**
   ```
       ✓ Task <id>: done
   ```
   
   Or on failure: `✗ Task <id>: failed (<reason>)` and STOP.

7. **Context discipline:** Record ONLY "Task <id>: done" in conversation. Do NOT retain task details.

8. **Guard handling:**
   If progress-tracking triggered a Guard:
   - Guard passed → continue to next task
   - Guard failed → STOP. Output guard failure details. Wait for user.

After all tasks `done` → automatically proceed to **Scenario C** (verification).

---

## Scenario C: Full Verification

**Trigger:** `status = "executing"`, all tasks have status `"done"` or `"deferred"`.

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

Compare coverage against `.forge/config.json` → `test_coverage` targets.

### Step 4: Update progress.json

```json
{
  "status": "verification_complete",
  "verification": {
    "status": "passed" | "failed",
    "test_mode": "normal",
    "last_run": "<ISO-8601>",
    "report_path": "<optional path to report file>"
  }
}
```

### Step 5: Report to User

**If passed:**
```
    ✓ Tests passing
    ✓ Build OK
    ✓ Coverage: <X>% (target: <Y>%)

▸ Verification Complete ✓
    Run /done to archive this feature.
```

**If failed:**
```
    ✗ Tests failed (<N> failures)
    Coverage: <X>% (target: <Y>%)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠ Verification failed.

  Failed tests: <list>
  Fix failing tests and run /next again.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Error Handling

| Condition | Response |
|-----------|----------|
| progress.json missing | "No active feature. Use `/start` first." |
| Status not recognized | "Unexpected state. Check `.forge/progress.json` for corruption." |
| writing-plans produces no output | "Plan generation failed. Check spec and scenarios.json for completeness." |
| Plan file cannot be parsed for tasks | "Could not extract tasks from plan. Verify the plan file uses standard task structure." |
| All tasks fail | "All tasks failed. Human intervention required." |

---

## Dependencies

- **Superpowers: writing-plans** — implementation plan generation, writes to `docs/superpowers/plans/`
- **Superpowers: subagent-driven-development** — per-task execution
- **Superpowers: requesting-code-review** — used by `batch-review` Guard
- **Forge: progress-tracking** — post-task state management + Guard trigger
- **GitNexus** (optional) — dependency analysis and blast radius
