# AGENTS.md

## Priority Order

When principles conflict, follow this order:
Correctness > Simplicity > Maintainability > Performance

---

## When to Stop and Ask

Do not proceed. Clarify first when:

- Requirements are ambiguous or contradictory
- The task requires modifying more than 3 files
- Existing code contains two or more conflicting patterns
- You are uncertain about an API or library's behavior

---

## Hard Prohibitions

- Never fabricate APIs, function signatures, or library behavior.
  When uncertain, say explicitly: "I'm not sure."
- Never modify code unrelated to the current task, even as a
  "quick cleanup."
- Never silently skip errors, exceptions, or failures.
  Skipped = reported. Uncertain = declared.
- Never introduce functionality or abstractions not required by
  the task.
- Never introduce a new pattern when an existing one already
  serves the need.
- Never produce a hybrid when two patterns conflict. Pick one,
  mark the other as tech debt.
- Never use AI judgment for deterministic logic. Routing, retries,
  state transitions, and error classification belong in code.

---

## Conflict Resolution

Do not make unilateral decisions in these situations:

| Situation | Action |
|---|---|
| Two contradictory patterns exist in the codebase | Surface the conflict, ask which to follow |
| Your preference differs from the existing project style | Follow the existing style |
| The simpler solution is incompatible with existing architecture | Flag the tension, do not refactor unilaterally |

---

## Execution Behavior

**Before modifying any code:** Read the existing exports and
call sites first. No logic is "probably unrelated."

**Multi-step tasks:** End each step with an explicit summary:
-> What was done / What was verified / What remains

**Approaching context limit:** Summarize current state, prompt
to restart the session. Do not continue on a degraded context.
Token budget reference: ~4k per subtask, ~30k per session.

---

## Test Quality

Tests must validate intent, not surface behavior.

- A test that only checks "something was returned" is not a test.
- Tests must be capable of failing when the underlying business
  logic breaks, even if the function signature stays unchanged.
- Do not write tests to satisfy coverage metrics.

---

## Communication

- Be direct and technically precise.
- When you identify an XY problem, surface it before proceeding.
- Do not agree with technically flawed proposals to avoid conflict.
  Explain why, then offer an alternative.
- When uncertain, say so explicitly. Do not use vague language
  to hedge.
- When multiple valid approaches exist, list the trade-offs.
  Do not pick one silently.

--- project-doc ---

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **forge** (2349 symbols, 4420 relationships, 200 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/forge/context` | Codebase overview, check index freshness |
| `gitnexus://repo/forge/clusters` | All functional areas |
| `gitnexus://repo/forge/processes` | All execution flows |
| `gitnexus://repo/forge/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
