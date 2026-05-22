# Installing Forge for OpenCode

## Prerequisites

- [OpenCode](https://opencode.ai/) installed
- [Superpowers](https://github.com/obra/superpowers) plugin installed

## Installation

Clone the forge repository to OpenCode's plugins directory (same way Superpowers is installed):

```bash
# Windows
git clone https://github.com/waldenlake/forge.git %USERPROFILE%\.config\opencode\plugins\forge

# macOS/Linux
git clone https://github.com/waldenlake/forge.git ~/.config/opencode/plugins/forge
```

Restart OpenCode. The plugin loads automatically from the plugins directory.

## Verify

```
use skill tool to list skills
```

You should see forge skills: `using-forge`, `start`, `next`, `resume`, `done`, `bugfix`, `scenarios`, `progress-tracking`, `session-handoff`.

## Usage

Just talk naturally:

```
/start user authentication with JWT
```

Or load a skill manually:

```
use skill tool to load start
```

## Updating

```bash
# Windows
cd %USERPROFILE%\.config\opencode\plugins\forge && git pull

# macOS/Linux
cd ~/.config/opencode/plugins/forge && git pull
```

## Troubleshooting

### Skills not found after restart

1. Verify the directory exists: `~/.config/opencode/plugins/forge/`
2. Check that `skills/` directory is present inside it
3. Restart OpenCode again

### Plugin not loading

Check OpenCode logs for errors related to forge.js loading.

## Note on opencode.json

Do NOT add forge to the `"plugin"` array in `opencode.json`. That mechanism
uses Bun's npm installer which has issues with git+https URLs on Windows.
The direct clone approach above is the reliable method (same as Superpowers).
