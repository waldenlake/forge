# Installing Forge for OpenCode

## Prerequisites

- [OpenCode.ai](https://opencode.ai/) installed
- [Superpowers](https://github.com/obra/superpowers) plugin installed

## Installation

Add forge to the `plugin` array in your `opencode.json` (global or project-level):

```json
{
  "plugin": ["forge@git+https://github.com/anthropic/forge.git"]
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
  "plugin": ["forge@git+https://github.com/anthropic/forge.git#v0.1.0"]
}
```

## Troubleshooting

### Plugin not loading

1. Check logs: `opencode run --print-logs "hello" 2>&1 | grep -i forge`
2. Verify the plugin line in your `opencode.json`
3. Make sure you're running a recent version of OpenCode

### Windows install issues

If OpenCode cannot install the plugin via git URL, try:

```
npm install forge@git+https://github.com/anthropic/forge.git --prefix "$HOME\.config\opencode"
```

Then use local path in `opencode.json`:

```json
{
  "plugin": ["~/.config/opencode/node_modules/forge"]
}
```

### Skills not found

1. Use `skill` tool to list what's discovered
2. Check that the plugin is loading (see above)

## Getting Help

- Report issues: https://github.com/anthropic/forge/issues
