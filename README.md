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

Forge v2 includes a CLI Runtime. The Claude/project install script creates a
project shim, so `forge doctor` can verify that install. The OpenCode installer
only builds the plugin runtime; use the explicit runtime path shown below.

### Claude Code

```
/plugin install forge@claude-plugins-official
```

### OpenCode

```bash
# Linux / macOS
curl -fsSL https://raw.githubusercontent.com/waldenlake/forge/main/scripts/install-opencode.sh | bash
```

```powershell
# Windows (PowerShell)
iwr -useb https://raw.githubusercontent.com/waldenlake/forge/main/scripts/install-opencode.cmd -OutFile $env:TEMP\forge-install.cmd; & $env:TEMP\forge-install.cmd; Remove-Item $env:TEMP\forge-install.cmd
```

The script clones the repo into `~/.config/opencode/plugins/forge/`, builds the
CLI, registers a plugin bridge, and links every skill under
`~/.config/opencode/skills/`. Re-run it to update.

Restart OpenCode. See `.opencode/INSTALL.md` for details and troubleshooting.

After a Claude/project install, run:

```bash
forge doctor
```

After an OpenCode install, verify the runtime with:

```bash
node ~/.config/opencode/plugins/forge/cli/dist/index.js doctor
```

```cmd
node "%USERPROFILE%\.config\opencode\plugins\forge\cli\dist\index.js" doctor
```

### Upgrading From v1

Forge v2 does not accept `config.json` v1 projects. For Claude/project installs,
upgrade old projects with:

```bash
forge migrate --from 1.0 --to 2.0
```

For OpenCode installs, run the runtime directly:

```bash
node ~/.config/opencode/plugins/forge/cli/dist/index.js migrate --from 1.0 --to 2.0
```

```cmd
node "%USERPROFILE%\.config\opencode\plugins\forge\cli\dist\index.js" migrate --from 1.0 --to 2.0
```

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
| OpenCode | install script (clone + bridge) | ✅ Full support |
| Windows | Git Bash required for hooks | ✅ Via run-hook.cmd polyglot |
| macOS/Linux | Native bash | ✅ Full support |

**Windows note:** The SessionStart hook requires Git Bash (installed with Git for Windows). The `run-hook.cmd` polyglot automatically locates bash. If bash is unavailable, the plugin works but without automatic context injection — load the `using-forge` skill manually.

## State File Schemas

Forge's state files conform to JSON Schemas in the `schemas/` directory:

- `schemas/progress.schema.json` — `.forge/progress.json` structure
- `schemas/config.schema.json` — `.forge/config.json` structure
- `schemas/scenarios.schema.json` — `.forge/scenarios.json` structure

These define exact required fields, enum values, and types. Forge skills must
not directly edit Runtime-owned `.forge/*.json`; use the CLI runtime so
migrations, validation, and compatibility checks run consistently. The
`scenarios` skill is the narrow exception that creates `.forge/scenarios.json`
from the confirmed spec, and the workflow validates it immediately with
`forge schema:validate`.

Skills resolve a global `forge` first and a project `.forge/bin/forge` second.
Between those two, OpenCode skills can invoke the plugin runtime directly at
`~/.config/opencode/plugins/forge/cli/dist/index.js`, so `/start` can run before
project initialization creates a shim.

## Philosophy

- Tests from human-confirmed scenarios, not AI invention
- State in files, context never overflows
- Batch isolation, any interruption recoverable
- No guessing, no assumptions — ask the human

## License

MIT
