---
name: session-handoff
description: Prepare cross-session recovery (used by Guard `session-handoff-suggestion` action)
---

# Session Handoff

Internal skill. Called as a Guard action (`session-handoff-suggestion`) or at
key transition points by other skills.

## Purpose

Ensure a new session can pick up exactly where work left off, without relying
on conversation history. All recovery information lives in files.

---

## Memory File Detection

**All references to "memory file" below mean: read `.forge/config.json` →
`memory_file` field. This contains the platform-appropriate filename
(CLAUDE.md / AGENTS.md / GEMINI.md). Use that filename for all read/write
operations in this skill.**

If `memory_file` is not set in config.json (shouldn't happen after /start),
fall back to `AGENTS.md`.

---

## Process

### Step 1: Read Current State

Read `.forge/progress.json` and extract:
- `feature` — feature slug
- `completed_tasks` — count of tasks done
- `total_tasks` — total task count
- `tasks` — array (find any in_progress or next pending)
- `guard_history` — recent guard results

### Step 2: Update Memory File

Open the memory file (filename from config.json `memory_file`).
Find the `## Forge` section. Replace the **Current Feature** subsection (or
add it if missing) with:

**If more tasks remain:**

```markdown
**Current Feature**
- Feature: <feature-slug>
- Progress: <completed_tasks>/<total_tasks> tasks done
- Next: Task <next-task-id> "<next-task-title>"
- Run `/resume` in a new session to continue
```

**If all tasks done:**

```markdown
**Current Feature**
- Feature: <feature-slug>
- Status: all tasks complete (<total_tasks> tasks done)
- Next: run `/next` for verification, then `/done` to archive
```

Do NOT overwrite other sections of the memory file. Only modify the Current Feature subsection.

### Step 3: Output to User

**If more tasks remain:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Progress: <completed>/<total> tasks done
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Recommend opening a new session to keep context fresh.

To continue, run in a new session:

  /resume

Or continue here:

  /next
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**If all tasks done:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
All tasks complete! (<total> done)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Next:
1. Run /next to trigger verification
2. After verification passes, run /done to archive
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Step 4: Stop

After outputting the message, **STOP**. Wait for the user to:
- Open a new session and run `/resume`, OR
- Run `/next` in the current session

---

## Why New Sessions

Context management is the primary reason:
- Long sessions with many task results accumulate context
- A fresh session reads `<memory_file>` and `.forge/progress.json` for instant state recovery
- Fresh context = more reliable execution

This is a recommendation, not a requirement. The user can continue in the same
session if they prefer.
