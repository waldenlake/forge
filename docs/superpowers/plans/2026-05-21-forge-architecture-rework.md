# Forge Architecture Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework Forge to use Superpowers as the documentation backbone, replace `batch` with the extensible `guard` concept, and add cross-platform memory file detection.

**Architecture:** Forge becomes a pure orchestration layer on top of Superpowers. Documents (specs/plans) live in `docs/superpowers/`. Forge only manages `.forge/` state files and the dynamic `<memory_file>`. Quality checks become Guards (extensible, not hardcoded batch reviews).

**Tech Stack:** Markdown (SKILL.md), JSON (state/config schemas)

---

## File Structure

Files modified:
```
skills/using-forge/SKILL.md          # Add "Forge overrides Superpowers" rule
skills/start/SKILL.md                # Memory file detection, no docs/forge/changes
skills/scenarios/SKILL.md            # Read from docs/superpowers/specs/, write to .forge/
skills/next/SKILL.md                 # No batch cutting, trigger Guards instead
skills/progress-tracking/SKILL.md    # Add Guard trigger logic
skills/session-handoff/SKILL.md      # Use memory_file from config
skills/done/SKILL.md                 # Simplified archival
skills/resume/SKILL.md               # Read memory_file from config
skills/bugfix/SKILL.md               # Use memory_file
```

Files unchanged:
```
.claude-plugin/plugin.json
.opencode/plugins/forge.js
hooks/*
README.md, LICENSE
```

---

### Task 1: Update using-forge meta-skill

**Files:**
- Modify: `skills/using-forge/SKILL.md`

- [ ] **Step 1: Add "Forge overrides Superpowers" section**

Insert after the "Available Commands" section in `skills/using-forge/SKILL.md`:

```markdown
## CRITICAL: Forge Overrides Superpowers Workflow

When Forge is active (`.forge/progress.json` exists with `status` ≠ `"idle"`),
all feature development MUST go through Forge commands.

DO NOT directly invoke Superpowers brainstorming, writing-plans, or
subagent-driven-development for feature work — use `/start`, `/next` instead.
Forge will call Superpowers internally with proper state tracking.

Direct Superpowers usage is allowed ONLY for:
- Tasks outside Forge's scope (e.g., one-off refactors not tracked as features)
- When `.forge/progress.json` does not exist (no active Forge project)
- When `status` = `"idle"` (between features)
```

- [ ] **Step 2: Update "State" section to mention dynamic memory file**

Replace the existing State section content with:

```markdown
## State

Forge stores all state in files (never conversation history):
- `.forge/config.json` — Project configuration (includes `memory_file` field)
- `.forge/progress.json` — Current feature progress
- `.forge/scenarios.json` — Current feature's structured scenarios
- `<memory_file>` — Cross-session memory (CLAUDE.md / AGENTS.md / GEMINI.md, depending on platform)

Documents (design specs, implementation plans) live in `docs/superpowers/` —
managed by Superpowers, not Forge.
```

- [ ] **Step 3: Commit**

```bash
git add skills/using-forge/SKILL.md
git commit -m "feat(using-forge): add Forge-overrides-Superpowers rule and dynamic memory file"
```

---

### Task 2: Update start/SKILL.md — Memory file detection + Superpowers integration

**Files:**
- Modify: `skills/start/SKILL.md`

- [ ] **Step 1: Replace Auto-Initialization Step 8 (CLAUDE.md append) with memory file detection**

In `skills/start/SKILL.md`, replace the Step 8 section "Append Forge Section to CLAUDE.md" with:

```markdown
### Step 8: Detect and Initialize Memory File

Detect which memory file to use:

1. Check existing files (priority order):
   - `CLAUDE.md` exists → use `CLAUDE.md`
   - `AGENTS.md` exists → use `AGENTS.md`
   - `GEMINI.md` exists → use `GEMINI.md`

2. If none exist, detect platform:
   - `CLAUDE_PLUGIN_ROOT` env var set → `CLAUDE.md`
   - OpenCode detected (check process or env) → `AGENTS.md`
   - Codex detected → `AGENTS.md`
   - Gemini CLI detected → `GEMINI.md`
   - Fallback → `AGENTS.md` (most universal)

3. Record the chosen filename to `.forge/config.json` field `memory_file`.

4. If the memory file does not exist, create it.

5. Append the Forge section (do NOT overwrite existing content):

```markdown

## Forge

**Project Info**
- Test mode: normal
- Test framework: <detected>
- Test command: <detected>
- Project type: <new/existing>

**Active Feature:** none
```
```

- [ ] **Step 2: Update Step 7 (config.json) to include memory_file and guards**

Replace the config.json template with:

```json
{
  "version": "1.0",
  "memory_file": "<detected filename>",
  "test_mode": "normal",
  "gstack_installed": false,
  "test_command": "<detected or empty>",
  "test_framework": "<detected or unknown>",
  "test_coverage": { "unit": 80, "integration": 60, "e2e": "P0" },
  "project_type": "<new or existing>",
  "guards": {
    "batch-review": {
      "enabled": true,
      "every_n_tasks": 6,
      "actions": ["spec-compliance-review"]
    }
  }
}
```

- [ ] **Step 3: Replace Main Flow Step 2 (Create Change Directory)**

Remove the entire "Create Change Directory" step. Replace with:

```markdown
### 2. Initialize Feature State

The feature's design and plan documents will be written by Superpowers to:
- `docs/superpowers/specs/YYYY-MM-DD-<feature-slug>-design.md`
- `docs/superpowers/plans/YYYY-MM-DD-<feature-slug>.md`

Forge does NOT create a `docs/forge/changes/<slug>/` directory anymore.
```

- [ ] **Step 4: Update Step 4 (Brainstorming) to point at Superpowers location**

Replace the "Output:" subsection with:

```markdown
**Output:** Superpowers brainstorming writes the design to:
```
docs/superpowers/specs/YYYY-MM-DD-<feature-slug>-design.md
```

The exact filename is generated by Superpowers. Capture this path — it's needed for the next step.
```

- [ ] **Step 5: Update Step 5 (Generate Scenarios)**

Replace with:

```markdown
### 5. Generate Scenarios

Output:
```
▸ Phase 3 · Scenarios
    → Generating test scenarios...
```

Use the Forge `scenarios` skill.

Input: the spec file path from Step 4.
Output: `.forge/scenarios.json`

After completion, output:
```
    ✓ <N> scenarios generated (<P0> P0, <P1> P1, <P2> P2)
    ✓ scenarios.json written
```
```

- [ ] **Step 6: Update progress.json template (Step 3 of Main Flow)**

Replace with:

```json
{
  "version": "1.0",
  "feature": "<feature-slug>",
  "status": "planning",
  "created_at": "<ISO-8601>",
  "updated_at": "<ISO-8601>",
  "spec_path": "<set by Step 4 — Superpowers brainstorming output path>",
  "plan_path": null,
  "total_tasks": 0,
  "completed_tasks": 0,
  "tasks": [],
  "guard_history": [],
  "verification": { "status": "pending", "test_mode": "normal", "last_run": null }
}
```

- [ ] **Step 7: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "feat(start): use Superpowers doc paths, dynamic memory file, no docs/forge/changes"
```

---

### Task 3: Update scenarios/SKILL.md — Read from Superpowers spec, write to .forge

**Files:**
- Modify: `skills/scenarios/SKILL.md`

- [ ] **Step 1: Update Input section**

Replace the Input section with:

```markdown
## Input

| File | Required | Description |
|------|----------|-------------|
| `<spec_path>` (from progress.json) | **Yes** | Superpowers brainstorming output (e.g., `docs/superpowers/specs/YYYY-MM-DD-<feature>-design.md`) |
| Mockup HTML | No | Visual mockup if UI is involved (path may be referenced in spec) |

Read `spec_path` from `.forge/progress.json` to determine where the design lives.
```

- [ ] **Step 2: Update Output section**

Replace with:

```markdown
## Output

| File | Format | Purpose |
|------|--------|---------|
| `.forge/scenarios.json` | JSON | Machine-readable scenarios for downstream automation |

Note: A human-readable rendering is NOT generated separately. The Superpowers spec
is already human-readable; scenarios.json is the structured machine artifact.
```

- [ ] **Step 3: Remove the scenarios.md generation section (Step 8)**

Delete the entire "### Step 8: Write scenarios.md" section. Renumber subsequent sections.

- [ ] **Step 4: Update the JSON `source` field example**

Find the `"source": "proposal.md"` reference and update to:

```json
"source": "<spec_path from progress.json>"
```

- [ ] **Step 5: Commit**

```bash
git add skills/scenarios/SKILL.md
git commit -m "feat(scenarios): read from Superpowers spec, drop scenarios.md output"
```

---

### Task 4: Update next/SKILL.md — No batch cutting, trigger Guards

**Files:**
- Modify: `skills/next/SKILL.md`

- [ ] **Step 1: Replace Scenario A Step 2 (writing-plans)**

Replace with:

```markdown
### Step 2: Generate Implementation Plan

Output:
```
▸ Phase 4 · Planning
    → Generating implementation plan...
```

Use the Superpowers `writing-plans` skill.

Provide as input:
- The spec path from `progress.json.spec_path`
- `.forge/scenarios.json`

Superpowers writes the plan to `docs/superpowers/plans/YYYY-MM-DD-<feature>.md`.

After plan is written:
- Capture the plan file path
- Update `progress.json.plan_path` with this path
- Output: `    ✓ plan written: <path>`
```

- [ ] **Step 2: Remove Step 3 (Batch Cutting) entirely**

Delete the entire "### Step 3: Batch Cutting" section. Replace with:

```markdown
### Step 3: Extract Tasks from Plan

Read the Superpowers plan file. Extract all tasks with their:
- ID (sequential number)
- Title
- Dependencies (referenced in task descriptions)

Populate `progress.json.tasks` array. Do NOT split into batches.
Tasks execute sequentially; quality checks happen via Guards (Step 5).

Output:
```
    ✓ <N> tasks extracted
```
```

- [ ] **Step 3: Update Step 4 (progress.json) to remove batches**

Replace the JSON template with:

```json
{
  "status": "executing",
  "updated_at": "<ISO-8601>",
  "plan_path": "<from Step 2>",
  "total_tasks": <N>,
  "completed_tasks": 0,
  "tasks": [
    { "id": 1, "title": "<from plan>", "status": "pending" },
    { "id": 2, "title": "<from plan>", "status": "pending" }
  ],
  "guard_history": []
}
```

- [ ] **Step 4: Replace Step 5 (Begin Execution)**

Replace with:

```markdown
### Step 5: Execute Tasks

Output:
```
▸ Phase 5 · Execution
```

For each pending task in order:

1. Update task status to `"in_progress"` in progress.json
2. Output: `    → Task <id>: <title>...`
3. Use the Superpowers `subagent-driven-development` skill to execute the task.
4. After subagent completes, use the Forge `progress-tracking` skill.
5. progress-tracking will:
   - Run tests, commit
   - Update task status to `"done"`
   - Increment `completed_tasks`
   - Check if a Guard should trigger (see config.json `guards`)
   - If Guard triggered → run Guard actions → record in `guard_history`

If a Guard fails (status `"failed"`):
- Stop execution
- Output the Guard failure details
- Wait for human to fix and re-run /next
```

- [ ] **Step 5: Remove Scenario B's "After all tasks in batch complete" section**

The post-batch logic (code review, session-handoff) is now Guard-driven. Remove the
"After all tasks in batch complete" block from Scenario B. Code review is triggered
by the `batch-review` Guard, not by batch completion.

- [ ] **Step 6: Commit**

```bash
git add skills/next/SKILL.md
git commit -m "feat(next): remove batch cutting, use Guards for quality checks"
```

---

### Task 5: Update progress-tracking/SKILL.md — Add Guard trigger logic

**Files:**
- Modify: `skills/progress-tracking/SKILL.md`

- [ ] **Step 1: Add new section after Step 4 (Update progress.json)**

Insert before "### Step 5: Context Discipline":

```markdown
### Step 4.5: Check Guards

After updating task status to `"done"`, check whether any Guard should trigger.

1. Read `.forge/config.json` → `guards` object
2. For each enabled guard:
   - Evaluate trigger condition:
     - `every_n_tasks: N` → trigger if `completed_tasks % N == 0`
   - If condition met → run Guard actions
3. Record result in `progress.json.guard_history`:

```json
{
  "id": "guard-<sequence>",
  "type": "<guard type>",
  "triggered_at": "<ISO-8601>",
  "task_range": [<first task id in this guard window>, <last task id>],
  "status": "passed" | "failed",
  "notes": "<brief result>"
}
```

#### Guard Actions

**`spec-compliance-review`:**
- Use the Superpowers `requesting-code-review` skill
- Scope: commits since last guard (or since feature start if first guard)
- Review against:
  - Scenarios in `.forge/scenarios.json` (spec compliance)
  - Code quality (DRY, YAGNI, naming)
- Pass if no blocking issues
- Fail if blocking issues found

**`session-handoff-suggestion`:** (optional, if listed in guard actions)
- Use the Forge `session-handoff` skill to update memory file and suggest new session

If a Guard fails:
- Set this guard's status to `"failed"` with notes
- Do NOT proceed to next task
- Output the failure details
- Return control to /next which will stop execution
```

- [ ] **Step 2: Commit**

```bash
git add skills/progress-tracking/SKILL.md
git commit -m "feat(progress-tracking): trigger Guards after task completion"
```

---

### Task 6: Update session-handoff/SKILL.md — Use memory_file from config

**Files:**
- Modify: `skills/session-handoff/SKILL.md`

- [ ] **Step 1: Replace all references to CLAUDE.md**

Find every occurrence of `CLAUDE.md` in `skills/session-handoff/SKILL.md` and replace with `<memory_file>` (where `<memory_file>` means: read `.forge/config.json` field `memory_file` and use that filename).

Add a note at the top of the Process section:

```markdown
**Memory file detection:** Read `.forge/config.json` → `memory_file` field. This
contains the platform-appropriate filename (CLAUDE.md / AGENTS.md / GEMINI.md).
All references to "CLAUDE.md" in this skill should use this filename.
```

- [ ] **Step 2: Commit**

```bash
git add skills/session-handoff/SKILL.md
git commit -m "feat(session-handoff): use dynamic memory_file from config.json"
```

---

### Task 7: Update done/SKILL.md — Simplified archival, dynamic memory file

**Files:**
- Modify: `skills/done/SKILL.md`

- [ ] **Step 1: Replace all CLAUDE.md references with <memory_file>**

Same as Task 6 — read filename from config.json, update all references.

- [ ] **Step 2: Replace Step 3 (Archive Change Directory)**

Replace with:

```markdown
### Step 3: Archive Scenarios

Copy:
```
.forge/scenarios.json → .forge/specs/<feature>-scenarios.json
```

Output: `    ✓ Scenarios archived to .forge/specs/`

Note: Superpowers documents (`docs/superpowers/specs/<feature>-design.md`,
`docs/superpowers/plans/<feature>.md`) are NOT moved. They remain as project
knowledge in their original location.
```

- [ ] **Step 3: Update Step 4 (Clean progress.json) JSON template**

Replace with:

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

- [ ] **Step 4: Update completed features template in CLAUDE.md update**

Replace the markdown template with:

```markdown
**Completed Features**
- <feature-slug> (<YYYY-MM-DD>)
  - Tasks: <completed>/<total> (deferred: <count>)
  - Spec: docs/superpowers/specs/<filename>
  - Plan: docs/superpowers/plans/<filename>
  - Scenarios: .forge/specs/<feature>-scenarios.json
```

- [ ] **Step 5: Commit**

```bash
git add skills/done/SKILL.md
git commit -m "feat(done): simplified archival, dynamic memory file, references Superpowers paths"
```

---

### Task 8: Update resume/SKILL.md — Dynamic memory file

**Files:**
- Modify: `skills/resume/SKILL.md`

- [ ] **Step 1: Replace CLAUDE.md references**

Find every occurrence of `CLAUDE.md` and replace with `<memory_file>` (read from config.json).

Add note at top of Main Flow:

```markdown
**Memory file:** Read `.forge/config.json` → `memory_file` field for the platform-appropriate filename.
```

- [ ] **Step 2: Update consistency check to use new progress.json schema**

The progress.json no longer has a `batches` array — it has a flat `tasks` array. Update any references in the Consistency Check section to iterate over `progress.tasks` directly instead of `progress.batches[].tasks`.

- [ ] **Step 3: Commit**

```bash
git add skills/resume/SKILL.md
git commit -m "feat(resume): dynamic memory file, flat tasks schema"
```

---

### Task 9: Update bugfix/SKILL.md — Dynamic memory file

**Files:**
- Modify: `skills/bugfix/SKILL.md`

- [ ] **Step 1: Replace CLAUDE.md references**

Find every occurrence of `CLAUDE.md` and replace with `<memory_file>`.

- [ ] **Step 2: Update progress.json template to flat tasks (no batches)**

Replace the bugfix progress.json template with:

```json
{
  "version": "1.0",
  "feature": "bugfix-<id>",
  "status": "bugfix",
  "created_at": "<ISO-8601>",
  "updated_at": "<ISO-8601>",
  "spec_path": null,
  "plan_path": null,
  "total_tasks": 1,
  "completed_tasks": 0,
  "tasks": [
    { "id": 1, "title": "Write regression test", "status": "pending" },
    { "id": 2, "title": "Fix the bug", "status": "pending" }
  ],
  "guard_history": [],
  "verification": { "status": "pending", "test_mode": "normal", "last_run": null }
}
```

- [ ] **Step 3: Commit**

```bash
git add skills/bugfix/SKILL.md
git commit -m "feat(bugfix): dynamic memory file, flat tasks schema"
```

---

### Task 10: Final verification

**Files:**
- All modified skill files

- [ ] **Step 1: Verify no remaining `CLAUDE.md` hardcoded references**

Run:
```bash
grep -rn "CLAUDE.md" skills/
```

Expected: only references should be in detection logic (e.g., "if `CLAUDE.md` exists"). No hardcoded write/append targets.

- [ ] **Step 2: Verify no remaining `docs/forge/changes/` references**

Run:
```bash
grep -rn "docs/forge/changes" skills/
```

Expected: zero matches.

- [ ] **Step 3: Verify no remaining `batch-N.md` or `batches` array references**

Run:
```bash
grep -rn "batch-N.md\|batches\[" skills/
```

Expected: zero matches (Guards replaced batch concept).

- [ ] **Step 4: Verify Guard concept is documented**

Run:
```bash
grep -rn "guard" skills/
```

Expected: matches in `using-forge`, `next`, `progress-tracking`, and config.json templates.

- [ ] **Step 5: Push all changes**

```bash
git push
```

---

## Summary

After all 10 tasks:
- Forge no longer manages `docs/` paths — Superpowers owns spec/plan documents
- Memory file is dynamic per platform (CLAUDE.md / AGENTS.md / GEMINI.md)
- Batch concept replaced by extensible Guard mechanism
- progress.json schema is flatter (no batches array, just tasks + guard_history)
- using-forge enforces "Forge overrides Superpowers" rule when active

## Self-Review

**Spec coverage:** Each section of the design spec has corresponding tasks ✓
- Documents归 Superpowers → Tasks 2, 3, 4, 7
- Memory file dynamic → Tasks 2, 6, 7, 8, 9
- Guard mechanism → Tasks 4, 5
- Forge over Superpowers rule → Task 1

**Placeholder check:** No "TBD" or "implement appropriate handling" — all steps have concrete instructions ✓

**Type consistency:** progress.json schema is consistent across tasks (flat tasks array, guard_history) ✓
