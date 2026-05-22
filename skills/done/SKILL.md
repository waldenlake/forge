---
name: done
description: Complete a feature — verify, archive, and clean up
---

# /done

Complete the current feature. Verify all work is finished, archive artifacts,
update project knowledge.

## First: Output Command Identifier

```
⚒ forge · /done
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Pre-Conditions

1. Read `.forge/progress.json`
   - File missing → ERROR: "No active feature."
   - `status` = `"idle"` → ERROR: "No active feature."
   - `status` = `"planning"` → ERROR: "Feature still in planning. Use `/next` to begin execution."

2. Check all batches:
   - Every batch must have status `"done"`
   - OR: some tasks marked `"deferred"` (acceptable)
   - Any batch `"in_progress"`, `"pending"`, `"blocked"`, or `"failed"`:
     → ERROR: "Cannot complete. Batch <N>: <status> (<count> tasks remaining). Finish or defer remaining tasks."

3. Check verification:
   - `verification.status` = `"passed"` → proceed
   - `"pending"` or `"failed"` → WARN: "Verification not passed. Running now..."
     → Execute Scenario D from /next
     → If fails: ERROR: "Verification failed. Fix issues before `/done`."

---

## Main Flow

Output:
```
▸ Verification
    ✓ All batches complete (<done>/<total> tasks)
    ✓ Tests passing
    ✓ Coverage: <X>% (target: <Y>%)
```

### Step 1: Merge Scenarios to Project Specs

Output:
```
▸ Archive
    → Saving scenarios to specs...
```

Copy:
```
docs/forge/changes/<feature>/scenarios.json
  → docs/forge/specs/<feature>-scenarios.json
```

Output: `    ✓ Scenarios saved to specs/`

### Step 2: Update CLAUDE.md

Remove/clear `**Current Feature**` subsection.
Add to `**Completed Features**`:

```markdown
- <feature-slug> (<YYYY-MM-DD>)
  - Tasks: <completed>/<total> (deferred: <count if any>)
  - Scenarios: docs/forge/specs/<feature>-scenarios.json
```

Output: `    ✓ CLAUDE.md updated`

### Step 3: Archive Change Directory

```bash
mkdir -p docs/forge/changes/archive/
mv docs/forge/changes/<feature>/ docs/forge/changes/archive/<YYYY-MM-DD>-<feature>/
```

Output: `    ✓ Feature archived`

### Step 4: Clean progress.json

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
  "verification": { "status": "pending", "test_mode": "normal", "last_run": null }
}
```

Output: `    ✓ progress.json cleaned`

### Step 5: Git Commit

```bash
git add -A
git commit -m "feat: complete feature <feature-slug> [forge done]"
```

### Step 6: Output Completion

```
▸ Complete ✓
    Feature: <feature-slug>
    Tasks:   <completed>/<total>
    Deferred: <count> (if any)
    Archived: docs/forge/changes/archive/<date>-<feature>/

    Ready for next feature — use /start.
```

---

## Handling Deferred Tasks

If some tasks have status `"deferred"`:
- List them in completion output with titles
- Record in CLAUDE.md completed features entry

---

## Error Handling

| Condition | Response |
|-----------|----------|
| progress.json missing | "No active feature." |
| Batch incomplete | List incomplete batches and remaining tasks |
| Verification failed | Auto-run; if still fails, block /done |
| Archive dir creation fails | "Cannot create archive directory. Check permissions." |
| Git commit fails | Warn but continue |
| scenarios.json missing | Warn: "No scenarios file. Skipping spec merge." Continue. |
