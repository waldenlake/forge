# Installing Forge for OpenCode

## Prerequisites

- [OpenCode](https://opencode.ai/) installed
- [Superpowers](https://github.com/obra/superpowers) plugin installed

## Installation

OpenCode discovers skills from `~/.config/opencode/skills/<name>/SKILL.md`.
Forge provides install scripts that copy its skills to this location.

### Option A: Install script (recommended)

Clone the repo and run the install script:

```bash
git clone https://github.com/waldenlake/forge.git
cd forge

# Unix/macOS
bash scripts/install-opencode.sh

# Windows
scripts\install-opencode.cmd
```

### Option B: Manual symlink

If you prefer symlinks (auto-updates when you git pull):

```bash
# Unix/macOS
git clone https://github.com/waldenlake/forge.git ~/forge
ln -s ~/forge/skills/* ~/.config/opencode/skills/

# Windows (requires admin or developer mode)
git clone https://github.com/waldenlake/forge.git %USERPROFILE%\forge
for %s in (using-forge start next resume done bugfix scenarios progress-tracking session-handoff) do mklink /D "%USERPROFILE%\.config\opencode\skills\%s" "%USERPROFILE%\forge\skills\%s"
```

### Option C: Project-level only

Copy skills to your project's `.opencode/skills/` directory:

```bash
cp -r forge/skills/* .opencode/skills/
```

This makes forge available only in that project.

## Verify

Restart OpenCode, then:

```
use skill tool to list skills
```

You should see: `using-forge`, `start`, `next`, `resume`, `done`, `bugfix`, `scenarios`, `progress-tracking`, `session-handoff`.

## Usage

```
Tell me about forge
```

Or directly invoke a skill:
```
use skill tool to load start
```

## Updating

Re-run the install script, or `git pull` if using symlinks.

## Note on opencode.json plugin config

Do NOT add forge to the `"plugin"` array in `opencode.json`. That mechanism is
for JavaScript/TypeScript plugins (event hooks, custom tools). Forge is a
pure-skill plugin — it uses SKILL.md files, not JS modules.

Remove this line if you added it:
```json
"forge@git+https://github.com/waldenlake/forge.git"
```
