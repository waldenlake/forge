---
name: session-handoff
description: Prepare cross-session recovery after batch completion
---

# Session Handoff

Internal skill. Called by `next/SKILL.md` after a batch completes successfully.

## Purpose

Ensure a new session can pick up exactly where work left off, without relying
on conversation history. All recovery information lives in files.

---

## Process

### Step 1: Read Current State

Read `.forge/progress.json` and extract:
- `feature` — the feature slug
- `current_batch` — the batch that just completed
- `total_batches` — total number of batches
- Count of completed tasks across all batches
- Count of total tasks across all batches

### Step 2: Update CLAUDE.md

Open `CLAUDE.md` at the project root. Find the `## Forge` section.

Replace the **Current Feature** content (or add it if missing) with:

**If more batches remain:**

```markdown
**Current Feature**
- Feature: <feature-slug>
- Completed: batch 1–<N> (tasks 1–<M> done)
- Review: batch <N> passed
- Next: batch <N+1>, starting from task <M+1>
- Run `/resume` in a new session to continue
```

**If all batches are done:**

```markdown
**Current Feature**
- Feature: <feature-slug>
- Status: all batches complete (<total-tasks> tasks done)
- Next: run `/next` for verification, then `/done` to archive
```

Do NOT overwrite other sections of CLAUDE.md (Project Info, Key Decisions,
Completed Features). Only modify the Current Feature subsection.

### Step 3: Output to User

**If more batches remain:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Batch <N> complete (<done>/<total> tasks done)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Recommend opening a new session to keep context fresh.
Each batch uses ~20-30k tokens — a fresh session ensures
reliable execution for the remaining batches.

To continue, run in a new session:

  /resume

Or continue in this session:

  /next
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**If all batches are done:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
All batches complete! (<total> tasks done)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Next steps:
1. Run /next to trigger full verification
2. After verification passes, run /done to archive

You can continue in this session — verification is lightweight.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Step 4: Stop

After outputting the message, **STOP**. Do not automatically continue
to the next batch. Wait for the user to:
- Open a new session and run `/resume`, OR
- Run `/next` in the current session

---

## Why New Sessions

Context management is the primary reason:
- Each batch of 6 tasks uses ~20-30k tokens
- Claude Code's context window is ~200k tokens
- After 2-3 batches, accumulated context degrades quality
- A fresh session reads CLAUDE.md and `.forge/progress.json` for instant state recovery
- Fresh context = more reliable execution

This is a recommendation, not a requirement. The user can continue in the same
session if they prefer.
