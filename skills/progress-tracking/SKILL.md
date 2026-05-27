---
name: progress-tracking
description: Compatibility shim — delegates all work to /next
---

# Progress Tracking

This skill is a compatibility helper for older Forge skill flows. Invoke `/next`
instead — it handles the full task execution loop including guard evaluation.

## Forge CLI

Before calling any Forge Runtime command, resolve the executable:

```bash
FORGE_CMD=$(command -v forge 2>/dev/null || { if [ -f "$HOME/.config/opencode/plugins/forge/cli/dist/index.js" ]; then echo "node $HOME/.config/opencode/plugins/forge/cli/dist/index.js"; else echo ".forge/bin/forge"; fi; })
```

All Runtime commands output JSON by default. Read the JSON, report blocking
errors exactly, and do not edit `.forge/*.json` directly.

## Delegation

Use the `/next` skill to execute tasks and handle guards. This skill adds no
additional logic.
