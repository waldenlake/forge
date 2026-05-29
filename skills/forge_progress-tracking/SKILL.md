---
name: forge:progress-tracking
description: Compatibility shim — delegates all work to /next
---

# Progress Tracking

This skill is a compatibility helper for older Forge skill flows. It immediately
invokes `/next` — no additional logic, no separate output.

## Forge CLI

Before calling any Forge Runtime command, resolve the executable:

```bash
FORGE_CMD=$(command -v forge 2>/dev/null || { if [ -f "$HOME/.config/opencode/plugins/forge/cli/dist/index.js" ]; then echo "node $HOME/.config/opencode/plugins/forge/cli/dist/index.js"; else echo ".forge/bin/forge"; fi; })
```

All Runtime commands output JSON by default. Read the JSON, report blocking
errors exactly, and do not edit `.forge/*.json` directly.

## Behavior

When invoked, immediately invoke the `/next` skill. Do not output any header
or status of your own — `/next` handles all output and state management.
