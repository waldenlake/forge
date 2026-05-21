# Forge Skill: session-handoff (Internal)

## Trigger

Called internally after each batch completes, or when user explicitly requests session handoff.

## Purpose

Prepare all information needed to seamlessly continue work in a new AI session.

## Behavior

### 1. Read Current State

1. Read `.forge/progress.json`
2. Read `CLAUDE.md` (existing content)
3. Read `docs/forge/changes/<feature>/` for latest artifacts

### 2. Update CLAUDE.md

Append or update the Forge section in `CLAUDE.md`:

```markdown
## Forge

**Current Feature**
- Feature: <feature-slug>
- Status: <status>/<phase>
- Completed: batch 1-<N> (<X> tasks done)
- Current: batch <N+1>, from task <id>
- Review: batch 1-<N> passed, no blocking issues

**Key Decisions**
- <date>: <decision> - <rationale>
(extract from proposal.md and review-batch-*.md)

**Completed Features**
- <previous-feature> (<date>)
  - Tasks: <N> completed, <M> deferred
  - Test coverage: <X>%
```

**Rules for CLAUDE.md updates:**
- If Forge section exists → update it (don't duplicate)
- If Forge section doesn't exist → create it
- Key decisions are cumulative (append, don't replace)
- Completed features are cumulative (append, don't replace)
- Current feature section is replaced each time

### 3. Generate Recovery Instructions

Output a standardized recovery block that the user can copy to a new session:

```
--- COPY BELOW TO NEW SESSION ---

Continue feature: <feature-slug>
Completed: batch 1-<N> (<X> tasks done)
Next: batch <N+1>
Execute: /next

--- END COPY ---
```

### 4. Output Session Handoff Summary

```
## Session Handoff: <feature-slug>

Progress:
- Completed: batch 1-<N> (<X>/<total> tasks done)
- Next: batch <N+1>, starting with task <id>: <title>
- Review: passed, no blocking issues

CLAUDE.md updated with:
- Current progress
- Key decisions from this batch
- <N> completed features total

To continue in a new session:
1. Open a new session in this project
2. Paste the recovery instructions below
3. Run /next

--- COPY BELOW TO NEW SESSION ---

Continue feature: <feature-slug>
Completed: batch 1-<N> (<X> tasks done)
Next: batch <N+1>
Execute: /next

--- END COPY ---
```

### 5. Verify Handoff Completeness

Before outputting, verify:
- [ ] `progress.json` is up to date
- [ ] `CLAUDE.md` has been updated
- [ ] Recovery instructions are accurate
- [ ] All batch artifacts (commits, reviews) are in place
- [ ] No tasks left in `in_progress` state without completion

## Error Handling

- **CLAUDE.md does not exist**: Create it with minimal Forge section.
- **CLAUDE.md write fails**: Warn user. "Could not update CLAUDE.md. Please update manually before opening new session."
- **progress.json inconsistent**: "progress.json has inconsistencies. Fix before handoff."

## Notes

- This skill ensures zero context loss between sessions
- Recovery instructions are the single source of truth for resuming
- CLAUDE.md is read automatically by Claude Code on session start
- Always suggest opening a new session after batch completion
