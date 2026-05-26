# Installing Forge for OpenCode

## Why a script

OpenCode's plugin and skill systems each have a strict layout:

- **Plugins**: only `.js` / `.ts` / `.mjs` files at the **root** of
  `~/.config/opencode/plugins/` are auto-loaded. Subdirectories are ignored.
- **Skills**: only `~/.config/opencode/skills/<name>/SKILL.md`,
  `.claude/skills/<name>/SKILL.md`, `.agents/skills/<name>/SKILL.md`, and
  their project-level equivalents are discovered. Plugins cannot register
  custom skill paths in current OpenCode builds.

Forge ships as a single repo with both a plugin and skills. The install
script wires it into both systems in one shot:

1. Clones the forge repo into `~/.config/opencode/plugins/forge/`
2. Builds the Forge v2 CLI Runtime from `cli/`
3. Drops a `forge.mjs` bridge file into `~/.config/opencode/plugins/` that
   re-exports the real plugin (so the plugin loader picks it up)
4. Creates a directory junction (Windows) or symlink (Unix) for each forge
   skill under `~/.config/opencode/skills/<name>` (so `/skills` lists them)

## Prerequisites

- [OpenCode](https://opencode.ai/) installed
- [Superpowers](https://github.com/obra/superpowers) plugin installed
- Git
- Node.js 20+

## Install

### Linux / macOS

```bash
git clone https://github.com/waldenlake/forge.git /tmp/forge-installer
bash /tmp/forge-installer/scripts/install-opencode.sh
rm -rf /tmp/forge-installer
```

Or, if you already have the repo cloned locally:

```bash
bash /path/to/forge/scripts/install-opencode.sh
```

### Windows (cmd)

```cmd
git clone https://github.com/waldenlake/forge.git %TEMP%\forge-installer
%TEMP%\forge-installer\scripts\install-opencode.cmd
rmdir /s /q %TEMP%\forge-installer
```

Or:

```cmd
\path\to\forge\scripts\install-opencode.cmd
```

### Windows (PowerShell)

```powershell
git clone https://github.com/waldenlake/forge.git $env:TEMP\forge-installer
cmd /c "$env:TEMP\forge-installer\scripts\install-opencode.cmd"
Remove-Item -Recurse -Force $env:TEMP\forge-installer
```

Restart OpenCode after install.

## Verify

Forge v2 has a CLI Runtime. Verify the install with:

```bash
node ~/.config/opencode/plugins/forge/cli/dist/index.js doctor
```

```cmd
node "%USERPROFILE%\.config\opencode\plugins\forge\cli\dist\index.js" doctor
```

In OpenCode, ask:

```
list available skills
```

You should see Forge skills: `using-forge`, `start`, `next`, `resume`, `done`,
`bugfix`, `scenarios`, `progress-tracking`, `session-handoff`.

## Upgrading From v1

Forge v2 does not accept `config.json` v1 projects. Upgrade old projects before
using Forge v2:

```bash
node ~/.config/opencode/plugins/forge/cli/dist/index.js migrate --from 1.0 --to 2.0
```

```cmd
node "%USERPROFILE%\.config\opencode\plugins\forge\cli\dist\index.js" migrate --from 1.0 --to 2.0
```

Skills must not directly edit `.forge/*.json`; use the CLI runtime so state
validation, migrations, and compatibility checks stay consistent.

Skills resolve a global `forge` first and a project `.forge/bin/forge` second.
The OpenCode installer only builds the plugin runtime; it does not install a
global binary or create a project shim.

## Update

Re-run the install script. It does `git pull --ff-only` if the checkout
already exists.

## Uninstall

Linux / macOS:

```bash
rm -rf ~/.config/opencode/plugins/forge ~/.config/opencode/plugins/forge.mjs
for s in using-forge start next resume done bugfix scenarios progress-tracking session-handoff; do
  rm -rf "${HOME}/.config/opencode/skills/${s}"
done
```

Windows (cmd):

```cmd
rmdir /s /q "%USERPROFILE%\.config\opencode\plugins\forge"
del "%USERPROFILE%\.config\opencode\plugins\forge.mjs"
for %S in (using-forge start next resume done bugfix scenarios progress-tracking session-handoff) do rmdir "%USERPROFILE%\.config\opencode\skills\%S"
```

## Why not `forge@git+https://...` in opencode.json?

OpenCode silently drops `git+https://...` plugin specs when it writes
`~/.config/opencode/package.json` for `bun install`. Only `name`,
`name@version`, and `name@latest` survive. The git+https entry then never
reaches Bun and the plugin never loads. Reported, but unfixed at the
time of writing.

## Usage

Talk naturally:

```
/start user authentication with JWT
```

Or load a skill explicitly:

```
use the start skill
```

## Troubleshooting

### Plugin not loading

Check that both files exist:

```
~/.config/opencode/plugins/forge.mjs       (bridge, ~150 bytes)
~/.config/opencode/plugins/forge/          (cloned repo)
~/.config/opencode/plugins/forge/.opencode/plugins/forge.js  (real plugin)
```

Run with logs and grep for forge:

```bash
opencode run --print-logs "hi" 2>&1 | grep -i forge
```

You should see `loading plugin` for `plugins/forge.mjs`. If you see an ERROR,
the path inside the bridge is wrong, re-run the install script.

### Skills not visible in `/skills`

Confirm each link/junction exists and points at a real `SKILL.md`:

```bash
ls -la ~/.config/opencode/skills/using-forge/SKILL.md
```

```cmd
dir "%USERPROFILE%\.config\opencode\skills\using-forge\SKILL.md"
```

If the link is missing, re-run the install script. On Windows, if `mklink /J`
fails the script falls back to copying — that works but `git pull` updates
won't propagate, so re-run the script after every update.
