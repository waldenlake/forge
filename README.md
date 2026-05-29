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
| `/next` | Route to the current phase and advance the workflow |
| `/resume` | Resume after interruption |
| `/done` | Complete and archive |
| `/bugfix <desc>` | Lightweight bug fix |

## How It Works

The workflow is split into 5 ordered phase skills. `/next` is a status-aware
router: it reads the current state and dispatches to the matching phase skill.
Each phase auto-advances into the next, so a single `/next` can carry the work
forward until it hits a human checkpoint or a blocker.

```
state: idle → planning → executing → execution_complete → verified → idle

/start "user authentication with JWT"   (idle → planning)
  → environment check + init + feature registration
  → auto-advances into the planning phase

/planning                                (planning, internal)
  → Brainstorming (clarify requirements) → spec  ·  human confirms
  → Scenarios (Given/When/Then) → plan → phase:advance

/executing                               (planning → executing → execution_complete)
  → per task: TDD → implement → test → commit (subagent, no pausing)
  → Guards (spec compliance + code quality) at configured intervals
  → phase:complete gate (tasks done + clean tree + build passes)

/verify                                  (execution_complete → verified)
  → full test suite + build + security/dependency checks → phase:verify-pass

/done                                    (verified → idle)
  → archive scenarios as project knowledge + reset

/next                                    routes to whichever phase matches state
/resume / /bugfix                        recover after interruption / fix a bug
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
