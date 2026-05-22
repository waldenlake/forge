---
name: done
description: Complete a feature — verify, archive, and clean up
---

# /done

Complete the current feature. Verify all work is finished, archive scenarios,
update project knowledge.

## First: Output Command Identifier

```
⚒ forge · /done
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Memory File

All references to "memory file" mean: read `.forge/config.json` → `memory_file`
field. Use that filename for all read/write operations.

---

## Pre-Conditions

1. Read `.forge/progress.json`
   - File missing → ERROR: "No active feature."
   - `status` = `"idle"` → ERROR: "No active feature."
   - `status` = `"planning"` → ERROR: "Feature still in planning. Use `/next` to begin execution."

2. Check all tasks:
   - Every task must have status `"done"` or `"deferred"`
   - Any task `"in_progress"`, `"pending"`, or `"failed"`:
     → ERROR: "Cannot complete. Outstanding tasks: <list>. Finish or defer first."

3. Check verification:
   - `verification.status` = `"passed"` → proceed
   - `"pending"` or `"failed"` → WARN: "Verification not passed. Running now..."
     → Execute Scenario C from /next (full verification)
     → If fails: ERROR: "Verification failed. Fix issues before `/done`."

---

## Main Flow

Output:
```
▸ Verification
    ✓ All tasks complete (<done>/<total>)
    ✓ Tests passing
    ✓ Coverage: <X>% (target: <Y>%)
```

### Step 1: Archive Scenarios

Output:
```
▸ Archive
    → Archiving scenarios...
```

Copy:
```
.forge/scenarios.json → .forge/specs/<feature>-scenarios.json
```

Output: `    ✓ Scenarios archived to .forge/specs/`

Note: Superpowers documents (`docs/superpowers/specs/<feature>-design.md`,
`docs/superpowers/plans/<feature>.md`) are NOT moved. They remain as project
knowledge in their original location.

### Step 2: Update Memory File

Open the memory file. In the `## Forge` section:

1. **Remove** or clear the `**Current Feature**` subsection.

2. **Add** to the `**Completed Features**` subsection (create if missing):

```markdown
**Completed Features**
- <feature-slug> (<YYYY-MM-DD>)
  - Tasks: <completed>/<total> (deferred: <count>)
  - Spec: <progress.json.spec_path>
  - Plan: <progress.json.plan_path>
  - Scenarios: .forge/specs/<feature>-scenarios.json
```

Output: `    ✓ Memory file updated`

### Step 3: Clean progress.json

Overwrite `.forge/progress.json` with idle state:

```json
{
  "version": "1.0",
  "feature": null,
  "status": "idle",
  "created_at": null,
  "updated_at": "<ISO-8601 now>",
  "spec_path": null,
  "plan_path": null,
  "total_tasks": 0,
  "completed_tasks": 0,
  "tasks": [],
  "guard_history": [],
  "verification": { "status": "pending", "test_mode": "normal", "last_run": null }
}
```

Output: `    ✓ progress.json cleaned`

### Step 4: Git Commit

```bash
git add -A
git commit -m "feat: complete feature <feature-slug> [forge done]"
```

### Step 5: Output Completion

```
▸ Complete ✓
    Feature:    <feature-slug>
    Tasks:      <completed>/<total>
    Deferred:   <count> (if any, list them)
    Scenarios:  .forge/specs/<feature>-scenarios.json
    Spec:       <spec_path>
    Plan:       <plan_path>

    Ready for next feature — use /start.
```

---

## Handling Deferred Tasks

If some tasks have status `"deferred"`:
- List them with their titles in the completion output
- Record in memory file completed features entry

---

## Error Handling

| Condition | Response |
|-----------|----------|
| progress.json missing | "No active feature." |
| Tasks incomplete | List incomplete tasks |
| Verification failed | Auto-run; if still fails, block /done |
| Git commit fails | Warn but continue |
| scenarios.json missing | Warn: "No scenarios file. Skipping archival." Continue. |
