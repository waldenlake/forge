# Forge

AI-driven software development orchestration. Input requirements, output
correct, trustworthy software.

## What It Does

Forge orchestrates the full development cycle:
1. **Understand requirements** — brainstorming + scenario generation
2. **Plan implementation** — batched tasks with TDD steps
3. **Execute** — subagent per task, test-first
4. **Verify** — tests, code review, reports
5. **Archive** — scenarios become project knowledge

Human intervention at only two points: **requirement confirmation** and
**final acceptance**.

## Installation

### Claude Code

```
/plugin install forge@claude-plugins-official
```

### OpenCode

See `.opencode/INSTALL.md` for detailed instructions.

## Commands

| Command | Purpose |
|---------|---------|
| `/start <requirement>` | Begin new feature |
| `/next` | Confirm and execute, or continue next batch |
| `/resume` | Resume after interruption |
| `/done` | Complete and archive |
| `/bugfix <desc>` | Lightweight bug fix |

## How It Works

```
/start "user authentication with JWT"
  → Brainstorming (clarify requirements)
  → Scenarios (Given/When/Then, human confirms)

/next
  → Plan (tasks with TDD steps, batched by 6)
  → Execute (subagent per task, test first)
  → Review (spec compliance + code quality)
  → "Batch done. Open new session, run /next"

/next (in new session)
  → Execute next batch...
  → (repeat until all batches done)
  → Full verification

/done
  → Archive feature
  → Scenarios saved as project knowledge
```

## Requirements

- **Superpowers** plugin (required) — provides brainstorming, planning, TDD, code review
- **GitNexus** (optional) — codebase analysis for existing projects
- **gstack** (optional, Phase 2) — enhanced testing with browser, visual QA, performance

## Platform Support

| Platform | Install Method | Status |
|----------|---------------|--------|
| Claude Code | `/plugin install` or marketplace | ✅ Full support |
| OpenCode | `opencode.json` plugin array | ✅ Full support |
| Windows | Git Bash required for hooks | ✅ Via run-hook.cmd polyglot |
| macOS/Linux | Native bash | ✅ Full support |

**Windows note:** The SessionStart hook requires Git Bash (installed with Git for Windows). The `run-hook.cmd` polyglot automatically locates bash. If bash is unavailable, the plugin works but without automatic context injection — load the `using-forge` skill manually.

## Philosophy

- Tests from human-confirmed scenarios, not AI invention
- State in files, context never overflows
- Batch isolation, any interruption recoverable
- No guessing, no assumptions — ask the human

## License

MIT
