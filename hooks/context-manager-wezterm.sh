#!/usr/bin/env bash
# Forge context-manager hook for Claude Code + WezTerm (Chain A, clear session).
#
# Triggered by Claude Code's Stop hook. Waits for agent idle, then sends
# /clear via WezTerm's CLI. Claude's SessionStart hook is responsible for
# restoring Forge workflow context after the clear.
#
# Usage in .claude/settings.json:
#   "Stop": [{ "matcher": "", "hooks": [{ "type": "command", "command": ".forge/hooks/context-manager-wezterm.sh" }] }]
#
# Prerequisites:
#   - Running inside WezTerm ($WEZTERM_PANE set or `wezterm` on PATH)
#   - .forge/handoff-signal.json exists with action: "handoff-session"
#
# Failure: exits silently (non-blocking). Degrades to Chain B.

set -euo pipefail

SIGNAL_FILE=".forge/handoff-signal.json"

if [ ! -f "$SIGNAL_FILE" ]; then
  exit 0
fi

ACTION=$(grep -o '"action"[[:space:]]*:[[:space:]]*"[^"]*"' "$SIGNAL_FILE" | head -1 | grep -o '"[^"]*"$' | tr -d '"')

if [ "$ACTION" != "handoff-session" ]; then
  exit 0
fi

rm -f "$SIGNAL_FILE"

DELAY_MS="${FORGE_HANDOFF_DELAY_MS:-500}"
DELAY_S=$(echo "scale=3; $DELAY_MS / 1000" | bc 2>/dev/null || echo "0.5")

# Resolve pane ID
PANE_ID="${WEZTERM_PANE:-}"
if [ -z "$PANE_ID" ]; then
  PANE_ID=$(wezterm cli list --format json 2>/dev/null | grep -o '"pane_id":[0-9]*' | head -1 | grep -o '[0-9]*')
fi

if [ -z "$PANE_ID" ]; then
  exit 0
fi

(
  sleep "$DELAY_S"
  wezterm cli send-text --pane-id "$PANE_ID" --no-paste "/clear
"
) &
disown

exit 0
