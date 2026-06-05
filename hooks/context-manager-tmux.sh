#!/usr/bin/env bash
# Forge context-manager hook for Claude Code + tmux (Chain A, in-place restart).
#
# Triggered by Claude Code's Stop hook. Waits for agent idle, then sends
# /clear to the current tmux pane followed by the resume command.
#
# Usage in .claude/settings.json:
#   "Stop": [{ "matcher": "", "hooks": [{ "type": "command", "command": ".forge/hooks/context-manager-tmux.sh" }] }]
#
# Prerequisites:
#   - Running inside tmux ($TMUX set)
#   - .forge/handoff-signal.json exists with action: "handoff-session"
#
# Failure: exits silently (non-blocking). Degrades to Chain B.

set -euo pipefail

SIGNAL_FILE=".forge/handoff-signal.json"

# Only act if signal file exists
if [ ! -f "$SIGNAL_FILE" ]; then
  exit 0
fi

# Parse signal (simple grep — no jq dependency)
ACTION=$(grep -o '"action"[[:space:]]*:[[:space:]]*"[^"]*"' "$SIGNAL_FILE" | head -1 | grep -o '"[^"]*"$' | tr -d '"')

if [ "$ACTION" != "handoff-session" ]; then
  exit 0
fi

# Clear signal immediately
rm -f "$SIGNAL_FILE"

# Configurable delay (ms) — tune per environment
DELAY_MS="${FORGE_HANDOFF_DELAY_MS:-500}"
DELAY_S=$(echo "scale=3; $DELAY_MS / 1000" | bc 2>/dev/null || echo "0.5")

# Spawn detached background process to send keys after delay.
# Must be detached so the Stop hook returns immediately.
(
  sleep "$DELAY_S"
  tmux send-keys -t "$TMUX_PANE" "/clear" Enter
  sleep 0.3
  tmux send-keys -t "$TMUX_PANE" "/resume" Enter
) &
disown

exit 0
