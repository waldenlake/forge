# Installing Forge for OpenCode

## Prerequisites

- [OpenCode](https://opencode.ai/) installed
- [Superpowers](https://github.com/obra/superpowers) plugin installed

## Installation

Add forge to the `plugin` array in your `opencode.json` (global or project-level):

```json
{
  "plugin": ["forge@git+https://github.com/waldenlake/forge.git"]
}
```

Restart OpenCode. The plugin installs through OpenCode's plugin manager and
registers all skills.

Verify by asking: "Tell me about forge"

## Windows Install Issues

Some Windows OpenCode builds have issues with `git+https` URLs. If the plugin
doesn't load, install with npm instead:

```bash
npm install forge@git+https://github.com/waldenlake/forge.git --prefix "%USERPROFILE%\.config\opencode"
```

Then use the local path in `opencode.json`:

```json
{
  "plugin": ["~/.config/opencode/node_modules/forge"]
}
```

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

OpenCode installs Forge through a git-backed package spec. If updates do not
appear after restart, clear OpenCode's package cache or reinstall the plugin.

To pin a specific version:

```json
{
  "plugin": ["forge@git+https://github.com/waldenlake/forge.git#v0.1.0"]
}
```

## Troubleshooting

### Plugin not loading

1. Check OpenCode logs for errors related to forge
2. Verify the plugin line in your `opencode.json`
3. Try the npm install workaround above (Windows)

### Skills not found

1. Use `skill` tool to list what's discovered
2. Check that the plugin loaded successfully
