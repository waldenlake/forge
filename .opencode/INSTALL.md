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

Restart OpenCode. The plugin:
1. Registers its skills directory so OpenCode discovers all forge skills
2. Injects the `using-forge` meta-skill content at session start

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

OpenCode re-fetches git-backed plugins on restart. To pin a version:

```json
{
  "plugin": ["forge@git+https://github.com/waldenlake/forge.git#v0.1.0"]
}
```

## Troubleshooting

### Plugin not loading

1. Check that `opencode.json` has the plugin line
2. Restart OpenCode
3. Look for errors in OpenCode logs

### Skills not found

1. Use `skill` tool to list what's discovered
2. Verify the plugin loaded (check for "Forge" in available skills)

### Windows issues

If OpenCode cannot install via git URL, try:

```
npm install forge@git+https://github.com/waldenlake/forge.git --prefix "%USERPROFILE%\.cache\opencode"
```
