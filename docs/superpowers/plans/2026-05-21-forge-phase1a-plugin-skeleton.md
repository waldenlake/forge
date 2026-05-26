# Forge Phase 1a: Plugin Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Forge plugin skeleton — plugin.json, SessionStart hook infrastructure (cross-platform), and the using-forge meta-skill that gets injected at session start.

**Architecture:** Pure plugin, no CLI. Claude Code discovers forge via SessionStart hook which injects the using-forge meta-skill content. Cross-platform support via polyglot run-hook.cmd (batch + bash). Skills live in skills/<name>/SKILL.md.

**Tech Stack:** Markdown (skills), JSON (plugin config, hooks), Bash (session-start script), Batch+Bash polyglot (run-hook.cmd)

---

## File Structure

```
forge/
  .claude-plugin/
    plugin.json                 # Plugin metadata
  .opencode/
    INSTALL.md                  # OpenCode installation guide
  hooks/
    hooks.json                  # Claude Code SessionStart hook config
    run-hook.cmd                # Cross-platform polyglot wrapper
    session-start               # Bash: read meta-skill, output JSON
  skills/
    using-forge/
      SKILL.md                  # Meta-skill: injected at session start
  README.md                     # User documentation
  LICENSE                       # MIT license
```

---

### Task 1: Plugin Metadata

**Files:**
- Create: `forge/.claude-plugin/plugin.json`
- Create: `forge/LICENSE`

- [ ] **Step 1: Create plugin.json**

```json
{
  "name": "forge",
  "description": "AI-driven software development orchestration — from requirements to trustworthy, tested software",
  "version": "0.1.0",
  "author": {
    "name": "forge contributors"
  },
  "homepage": "https://github.com/xxx/forge",
  "repository": "https://github.com/xxx/forge",
  "license": "MIT",
  "keywords": [
    "orchestration",
    "tdd",
    "requirements",
    "scenarios",
    "testing",
    "automation"
  ]
}
```

- [ ] **Step 2: Create LICENSE file**

Create standard MIT license file.

- [ ] **Step 3: Commit**

```bash
git add .claude-plugin/plugin.json LICENSE
git commit -m "feat: add plugin metadata and license"
```

---

### Task 2: Cross-Platform Hook Wrapper (run-hook.cmd)

**Files:**
- Create: `forge/hooks/run-hook.cmd`

- [ ] **Step 1: Create run-hook.cmd polyglot file**

This file is simultaneously a valid Windows batch script and a valid Unix bash script.
Windows cmd.exe reads the batch portion (between the top and `CMDBLOCK`).
Unix bash skips the batch portion (`: << 'CMDBLOCK'` is a heredoc no-op in bash).

```cmd
: << 'CMDBLOCK'
@echo off
REM Cross-platform polyglot wrapper for hook scripts.
REM On Windows: cmd.exe runs the batch portion, which finds and calls bash.
REM On Unix: the shell interprets this as a script (: is a no-op in bash).
REM
REM Hook scripts use extensionless filenames (e.g. "session-start" not
REM "session-start.sh") so Claude Code's Windows auto-detection -- which
REM prepends "bash" to any command containing .sh -- doesn't interfere.
REM
REM Usage: run-hook.cmd <script-name> [args...]

if "%~1"=="" (
    echo run-hook.cmd: missing script name >&2
    exit /b 1
)

set "HOOK_DIR=%~dp0"

REM Try Git for Windows bash in standard locations
if exist "C:\Program Files\Git\bin\bash.exe" (
    "C:\Program Files\Git\bin\bash.exe" "%HOOK_DIR%%~1" %2 %3 %4 %5 %6 %7 %8 %9
    exit /b %ERRORLEVEL%
)

if exist "C:\Program Files (x86)\Git\bin\bash.exe" (
    "C:\Program Files (x86)\Git\bin\bash.exe" "%HOOK_DIR%%~1" %2 %3 %4 %5 %6 %7 %8 %9
    exit /b %ERRORLEVEL%
)

REM Try bash on PATH (e.g. user-installed Git Bash, MSYS2, Cygwin)
where bash >nul 2>nul
if %ERRORLEVEL% equ 0 (
    bash "%HOOK_DIR%%~1" %2 %3 %4 %5 %6 %7 %8 %9
    exit /b %ERRORLEVEL%
)

REM No bash found - exit silently rather than error
REM (plugin still works, just without SessionStart context injection)
exit /b 0
CMDBLOCK

# Unix: run the named script directly
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT_NAME="$1"
shift
exec bash "${SCRIPT_DIR}/${SCRIPT_NAME}" "$@"
```

- [ ] **Step 2: Make run-hook.cmd executable (Unix)**

```bash
chmod +x hooks/run-hook.cmd
```

- [ ] **Step 3: Commit**

```bash
git add hooks/run-hook.cmd
git commit -m "feat: add cross-platform polyglot hook wrapper"
```

---

### Task 3: SessionStart Hook Configuration

**Files:**
- Create: `forge/hooks/hooks.json`

- [ ] **Step 1: Create hooks.json**

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|clear|compact",
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd\" session-start",
            "async": false
          }
        ]
      }
    ]
  }
}
```

Note: `matcher` excludes "resume" — when user resumes a session, forge state
is already in CLAUDE.md so re-injection is unnecessary (and avoids double context).

- [ ] **Step 2: Commit**

```bash
git add hooks/hooks.json
git commit -m "feat: add SessionStart hook configuration"
```

---

### Task 4: Session-Start Script

**Files:**
- Create: `forge/hooks/session-start`

- [ ] **Step 1: Create session-start bash script**

```bash
#!/usr/bin/env bash
# SessionStart hook for forge plugin
set -euo pipefail

# Determine plugin root directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Read using-forge meta-skill content
using_forge_content=$(cat "${PLUGIN_ROOT}/skills/using-forge/SKILL.md" 2>&1 || echo "Error reading using-forge skill")

# Escape string for JSON embedding
escape_for_json() {
    local s="$1"
    s="${s//\\/\\\\}"
    s="${s//\"/\\\"}"
    s="${s//$'\n'/\\n}"
    s="${s//$'\r'/\\r}"
    s="${s//$'\t'/\\t}"
    printf '%s' "$s"
}

using_forge_escaped=$(escape_for_json "$using_forge_content")

session_context="<IMPORTANT>\nYou have the Forge orchestration plugin installed.\n\n**Below is the full content of your 'forge:using-forge' skill — your introduction to using Forge. For all other Forge skills, use the Skill tool:**\n\n${using_forge_escaped}\n</IMPORTANT>"

# Output context injection as JSON.
# Platform detection via environment variables.
if [ -n "${CURSOR_PLUGIN_ROOT:-}" ]; then
  # Cursor format
  printf '{\n  "additional_context": "%s"\n}\n' "$session_context"
elif [ -n "${CLAUDE_PLUGIN_ROOT:-}" ] && [ -z "${COPILOT_CLI:-}" ]; then
  # Claude Code format
  printf '{\n  "hookSpecificOutput": {\n    "hookEventName": "SessionStart",\n    "additionalContext": "%s"\n  }\n}\n' "$session_context"
else
  # Copilot CLI or unknown platform — SDK standard format
  printf '{\n  "additionalContext": "%s"\n}\n' "$session_context"
fi

exit 0
```

- [ ] **Step 2: Make session-start executable**

```bash
chmod +x hooks/session-start
```

- [ ] **Step 3: Commit**

```bash
git add hooks/session-start
git commit -m "feat: add session-start hook script with platform detection"
```

---

### Task 5: Using-Forge Meta-Skill

**Files:**
- Create: `forge/skills/using-forge/SKILL.md`

- [ ] **Step 1: Create the using-forge meta-skill**

```markdown
---
name: using-forge
description: Introduction to the Forge orchestration system
---

# Using Forge

Forge is an AI-driven software development orchestration system. It takes
requirements and produces correct, trustworthy software through structured
workflows.

## When to Activate

Check for relevant Forge skills when:
- User wants to build a new feature or project
- User mentions requirements, PRD, or design specs
- User wants to fix a bug systematically
- User asks about project progress or status
- User wants to resume interrupted work

## Available Commands

| Command | Purpose |
|---------|---------|
| `/start <requirement>` | Begin a new feature: brainstorm → scenarios → confirm |
| `/next` | Confirm design and execute, or continue next batch |
| `/resume` | Resume after session interruption |
| `/done` | Complete feature: verify → archive |
| `/bugfix <description>` | Lightweight bug fix with regression test |

## How It Works

1. **You describe what to build** → Forge clarifies via brainstorming
2. **Scenarios generated** → You confirm they match your intent
3. **Plan created** → Tasks with TDD steps, batched for context management
4. **Execution** → Subagents implement each task (test first, then code)
5. **Verification** → Tests run, code reviewed, report generated
6. **Archive** → Feature documented, scenarios preserved as project knowledge

## State

Forge stores all state in files (never conversation history):
- `.forge/config.json` — Project configuration
- `.forge/progress.json` — Current feature progress
- `CLAUDE.md` — Cross-session memory (Forge section)
- `docs/forge/changes/<feature>/` — Feature artifacts

## Checking Status

To check current forge status, read `.forge/progress.json`:
- `status: "idle"` → No active feature, user can `/start`
- `status: "planning"` → Feature being designed, waiting for `/next`
- `status: "executing"` → Tasks being implemented
- `status: "verification_complete"` → Ready for `/done`
- `status: "bugfix"` → Bug fix in progress

## Dependencies

Forge requires:
- **Superpowers** plugin (brainstorming, writing-plans, subagent-driven-development, TDD, code review)

Forge optionally uses:
- **GitNexus** (codebase analysis, blast radius — for existing projects)
- **gstack** (enhanced testing — Phase 2)

## Key Principles

- Tests come from human-confirmed scenarios, not AI invention
- All state in files, context never overflows
- Batch isolation: ≤6 tasks per batch, new session between batches
- No guessing: ask humans for anything uncertain
```

- [ ] **Step 2: Commit**

```bash
git add skills/using-forge/SKILL.md
git commit -m "feat: add using-forge meta-skill"
```

---

### Task 6: OpenCode Installation Guide

**Files:**
- Create: `forge/.opencode/INSTALL.md`

- [ ] **Step 1: Create INSTALL.md**

```markdown
# Installing Forge for OpenCode

## Prerequisites

- [OpenCode.ai](https://opencode.ai/) installed
- [Superpowers](https://github.com/obra/superpowers) plugin installed

## Installation

Add forge to the `plugin` array in your `opencode.json` (global or project-level):

```json
{
  "plugin": ["forge@git+https://github.com/xxx/forge.git"]
}
```

Restart OpenCode. The plugin installs through OpenCode's plugin manager and
registers all skills.

Verify by asking: "Tell me about forge"

## Usage

Use OpenCode's native `skill` tool:

```
use skill tool to list skills
use skill tool to load forge/start
```

## Updating

OpenCode re-fetches git-backed plugins on restart. To pin a version:

```json
{
  "plugin": ["forge@git+https://github.com/xxx/forge.git#v0.1.0"]
}
```

## Troubleshooting

### Plugin not loading
1. Check logs: `opencode run --print-logs "hello" 2>&1 | grep -i forge`
2. Verify the plugin line in your `opencode.json`

### Windows install issues
If OpenCode cannot install the plugin via git URL, try:

```
npm install forge@git+https://github.com/xxx/forge.git --prefix "$HOME\.config\opencode"
```

Then use local path in `opencode.json`:

```json
{
  "plugin": ["~/.config/opencode/node_modules/forge"]
}
```
```

- [ ] **Step 2: Commit**

```bash
git add .opencode/INSTALL.md
git commit -m "feat: add OpenCode installation guide"
```

---

### Task 7: README

**Files:**
- Create: `forge/README.md`

- [ ] **Step 1: Create README.md**

```markdown
# Forge

AI-driven software development orchestration. Input requirements, output
correct, trustworthy software.

## What It Does

Forge orchestrates the full development cycle:
1. Understand requirements (brainstorming + scenarios)
2. Plan implementation (batched tasks with TDD)
3. Execute (subagent per task, test-first)
4. Verify (tests, code review, reports)
5. Archive (scenarios become project knowledge)

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

## Requirements

- **Superpowers** plugin (required)
- **GitNexus** (optional, for existing projects)
- **gstack** (optional, Phase 2, for enhanced testing)

## Philosophy

- Tests from human-confirmed scenarios, not AI invention
- State in files, context never overflows
- Batch isolation, any interruption recoverable
- No guessing, no assumptions

## License

MIT
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "feat: add README documentation"
```

---

## Summary

After completing all 7 tasks, the forge plugin skeleton is ready:
- Claude Code can discover it via plugin.json
- SessionStart hook injects the meta-skill on every new session
- Cross-platform support via polyglot run-hook.cmd
- OpenCode users have installation instructions
- The AI knows about forge commands and can load specific skills

Next phase (1b) will implement the actual command skills (start, scenarios, next).
