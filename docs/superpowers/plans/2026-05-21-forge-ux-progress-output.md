# Forge UX: Progress Output Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add brand identity, environment detection with install guidance, and step-by-step progress output to all forge user-facing skills.

**Architecture:** Each SKILL.md gets "Output Template" sections that instruct the AI what to display at each flow transition. No code changes — pure markdown skill updates.

**Tech Stack:** Markdown (SKILL.md format)

---

## Task 1: Update start/SKILL.md

**Files:**
- Modify: `skills/start/SKILL.md`

- [ ] **Step 1: Add Output Templates section at the top (after frontmatter, before Pre-Conditions)**

Insert a new section "Output Templates" that defines:
- Brand header (full, only for /start)
- Phase progress format
- Environment check output (pass/fail variants)
- Error output with install guidance

- [ ] **Step 2: Modify Pre-Conditions to output brand header first**

Before any logic, output the brand header:
```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  ⚒  F O R G E  v0.1.0               ┃
┃  AI-Driven Development Orchestration  ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

- [ ] **Step 3: Rewrite Auto-Initialization with environment check output**

Replace the current dry Steps 1-7 with an output-aware version:
- Output `▸ Phase 1 · Environment Check` header
- Each detection step outputs its result line (`✓`, `✗`, `·`, `⚠`)
- On Superpowers missing: output the error block with install guidance, STOP
- On GitNexus missing (existing project): output `⚠ GitNexus (recommended)` but continue
- On gstack missing: output `· gstack (optional)` and continue
- On success: output `✓ Project initialized`

- [ ] **Step 4: Add progress output to Main Flow steps**

Each step now outputs progress:
- Step 1 (slug): no output needed (instant)
- Step 2 (create dir): `✓ Feature directory created`
- Step 3 (progress.json): no output needed (internal)
- Step 4 (brainstorming): `▸ Phase 2 · Brainstorming` + `→ Clarifying requirements...` before, `✓ proposal.md written` after
- Step 5 (scenarios): `▸ Phase 3 · Scenarios` + `→ Generating...` before, `✓ N scenarios generated` after
- Step 6 (present): `▸ Ready for Review` + prompt

- [ ] **Step 5: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "feat(ux): add brand header and progress output to /start skill"
```

---

## Task 2: Update next/SKILL.md

**Files:**
- Modify: `skills/next/SKILL.md`

- [ ] **Step 1: Add command identifier at the start**

Before any logic, output:
```
⚒ forge · /next
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

- [ ] **Step 2: Add progress output to Scenario A (Planning)**

- `▸ Phase 4 · Planning`
- `→ Generating implementation plan...` / `✓ full-plan.md written (N tasks)`
- `→ Cutting batches...` / `✓ N batches created`

- [ ] **Step 3: Add progress output to Scenario B (Batch Execution)**

- `▸ Phase 5 · Execution (Batch N/M)`
- For each task: `→ Task N: <title>...` then `✓ Task N: done` or `✗ Task N: failed`

- [ ] **Step 4: Add progress output to Scenario D (Verification)**

- `▸ Phase 6 · Verification`
- `→ Running full test suite...` / `✓ Tests passing` or `✗ Tests failed`
- `✓ Coverage: X%`

- [ ] **Step 5: Commit**

```bash
git add skills/next/SKILL.md
git commit -m "feat(ux): add progress output to /next skill"
```

---

## Task 3: Update resume/SKILL.md

**Files:**
- Modify: `skills/resume/SKILL.md`

- [ ] **Step 1: Add command identifier**

```
⚒ forge · /resume
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

- [ ] **Step 2: Wrap status output in progress format**

- `▸ Status Recovery`
- `✓ Feature: <name>`
- `✓ Progress: batch N/M, task X/Y`
- `→ Interrupt point: Task N (status)`

- [ ] **Step 3: Commit**

```bash
git add skills/resume/SKILL.md
git commit -m "feat(ux): add progress output to /resume skill"
```

---

## Task 4: Update done/SKILL.md

**Files:**
- Modify: `skills/done/SKILL.md`

- [ ] **Step 1: Add command identifier**

```
⚒ forge · /done
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

- [ ] **Step 2: Add progress output to verification + archive steps**

- `▸ Verification` + status lines
- `▸ Archive` + status lines
- `▸ Complete ✓` + summary

- [ ] **Step 3: Commit**

```bash
git add skills/done/SKILL.md
git commit -m "feat(ux): add progress output to /done skill"
```

---

## Task 5: Update bugfix/SKILL.md

**Files:**
- Modify: `skills/bugfix/SKILL.md`

- [ ] **Step 1: Add command identifier**

```
⚒ forge · /bugfix
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

- [ ] **Step 2: Add progress output to analysis + fix phases**

- `▸ Phase 1 · Bug Analysis` + status lines
- `▸ Phase 2 · Fix (TDD)` + task progress
- `▸ Complete ✓` + summary

- [ ] **Step 3: Commit**

```bash
git add skills/bugfix/SKILL.md
git commit -m "feat(ux): add progress output to /bugfix skill"
```

---

## Summary

5 tasks, each modifying one skill file. After completion:
- /start shows full brand header + environment check + brainstorm/scenario progress
- /next shows planning + execution + verification progress
- /resume shows recovery status in structured format
- /done shows verification + archive progress
- /bugfix shows analysis + fix progress

All use consistent visual language (▸ for phases, ✓/→/·/✗ for steps).
