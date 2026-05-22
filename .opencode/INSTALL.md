# Installing Forge for OpenCode

## Why a script

OpenCode auto-loads `.js` / `.ts` files **at the root** of `~/.config/opencode/plugins/`,
but does **not** descend into subdirectories. Forge ships as a multi-file
plugin (skills, hooks, schemas), so a tiny bridge file in the plugins root is
needed to re-export the real plugin from a checked-out copy.

The install script handles both pieces in one shot:

1. Clones the forge repo into `~/.config/opencode/plugins/forge/`
2. Drops a `forge.mjs` bridge file into `~/.config/opencode/plugins/`

## Prerequisites

- [OpenCode](https://opencode.ai/) installed
- [Superpowers](https://github.com/obra/superpowers) plugin installed
- Git

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

In OpenCode, ask:

```
list available skills
```

You should see Forge skills: `using-forge`, `start`, `next`, `resume`, `done`,
`bugfix`, `scenarios`, `progress-tracking`, `session-handoff`.

## Update

Re-run the install script. It does `git pull --ff-only` if the checkout
already exists.

## Uninstall

Linux / macOS:

```bash
rm -rf ~/.config/opencode/plugins/forge ~/.config/opencode/plugins/forge.mjs
```

Windows (cmd):

```cmd
rmdir /s /q "%USERPROFILE%\.config\opencode\plugins\forge"
del "%USERPROFILE%\.config\opencode\plugins\forge.mjs"
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

### Skills not visible

Confirm the `config` hook ran by inspecting OpenCode's reported skill paths.
Forge contributes:

```
~/.config/opencode/plugins/forge/skills
```

If that directory exists but no skills appear, the plugin loaded but the
`config` hook on this OpenCode build does not allow `skills.paths` injection.
File an issue with the OpenCode log.
