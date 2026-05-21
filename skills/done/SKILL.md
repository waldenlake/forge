---
name: done
description: Complete a feature — verify, archive, and clean up
---

# /done

Complete the current feature. Verify all work is finished, archive artifacts,
update project knowledge.

---

## Pre-Conditions

1. Read `.forge/progress.json`
   - File missing → ERROR: "No active feature."
   - `status` = `"idle"` → ERROR: "No active feature."
   - `status` = `"planning"` → ERROR: "Feature still in planning. Use `/next` to begin execution."

2. Check all batches:
   - Every batch must have status `"done"`
   - OR: some tasks marked `"deferred"` (acceptable — note them in summary)
   - Any batch with status `"in_progress"`, `"pending"`, `"blocked"`, or `"failed"`:
     → ERROR:
     > "Cannot complete. Outstanding work:
     > - Batch <N>: <status> (<count> tasks remaining)
     > 
     > Finish or defer remaining tasks before `/done`."

3. Check verification:
   - `verification.status` should be `"passed"`
   - If `"pending"` or `"failed"`:
     → WARN: "Verification not passed. Running full verification now..."
     → Execute Scenario D from `/next` (full verification)
     → If verification fails: ERROR: "Verification failed. Fix issues before `/done`."
     → If verification passes: continue below

---

## Main Flow

### Step 1: Merge Scenarios to Project Specs

Copy the scenarios file to permanent project knowledge:

```
docs/forge/changes/<feature>/scenarios.json
  → copy to →
docs/forge/specs/<feature>-scenarios.json
```

These scenarios become permanent project documentation. Future development
can reference them to understand expected behavior and existing test coverage.

### Step 2: Update CLAUDE.md

In the `## Forge` section of `CLAUDE.md`:

1. **Remove** or clear the `**Current Feature**` subsection

2. **Add** to the `**Completed Features**` subsection (create if missing):

```markdown
**Completed Features**
- <feature-slug> (<YYYY-MM-DD>)
  - Tasks: <completed>/<total> (deferred: <count if any>)
  - Test coverage: <from verification report if available>
  - Scenarios: docs/forge/specs/<feature>-scenarios.json
```

### Step 3: Archive Change Directory

Move the entire feature directory to the archive:

```bash
mkdir -p docs/forge/changes/archive/
mv docs/forge/changes/<feature>/ docs/forge/changes/archive/<YYYY-MM-DD>-<feature>/
```

Where `<YYYY-MM-DD>` is today's date.

### Step 4: Clean progress.json

Overwrite `.forge/progress.json` with idle state:

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

### Step 5: Git Commit

```bash
git add -A
git commit -m "feat: complete feature <feature-slug> [forge done]"
```

### Step 6: Output Completion Summary

```
Feature Complete
════════════════════════════════
Feature:    <feature-slug>
Status:     ✅ done
Tasks:      <completed>/<total>
Deferred:   <count> (if any, list them)
Archived:   docs/forge/changes/archive/<date>-<feature>/
Scenarios:  docs/forge/specs/<feature>-scenarios.json

Project knowledge updated in CLAUDE.md.
Ready for next feature — use /start.
════════════════════════════════
```

---

## Handling Deferred Tasks

If some tasks have status `"deferred"`:
- List them in the completion summary with their titles
- They are recorded in the archived progress but not blocking
- Mention in CLAUDE.md completed features entry

Example:
```
Deferred:   2 tasks
  - Task 12: "Add email notification preferences" (deferred: low priority for MVP)
  - Task 15: "Performance optimization for large datasets" (deferred: premature)
```

---

## Error Handling

| Condition | Response |
|-----------|----------|
| progress.json missing | "No active feature." |
| Batch incomplete | List incomplete batches and remaining tasks |
| Verification not passed | Auto-run verification; if fails, block /done |
| Archive directory creation fails | "Cannot create archive directory. Check permissions." |
| Git commit fails | Warn but continue (archive is more important than the commit) |
| scenarios.json missing | Warn: "No scenarios file found. Skipping spec merge." Continue. |
