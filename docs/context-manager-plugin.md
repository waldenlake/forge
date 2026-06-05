# Context-Manager Plugin Documentation

## Overview

The context-manager is an optional forge plugin that automatically manages
session context lifetime. It detects when context usage exceeds a threshold
and either triggers an in-place session restart (Chain A) or suggests manual
compaction (Chain B).

## Enabling / Disabling

Add to `.forge/config.json`:

```json
{
  "context_management": {
    "enabled": true,
    "threshold_pct": 0.50,
    "strategy": "in-place-restart",
    "fallback": "prompt-compact",
    "min_tasks_between_handoff": 1
  }
}
```

**Fields:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | — | Master switch. `false` = no intervention. |
| `threshold_pct` | 0-1 | 0.50 | Context usage % that triggers handoff. |
| `strategy` | enum | `"in-place-restart"` | Preferred: `in-place-restart`, `new-window`, `prompt-compact`, `off`. |
| `fallback` | enum | `"prompt-compact"` | Used when strategy is unavailable. |
| `min_tasks_between_handoff` | integer ≥1 | 1 | Anti-loop: min tasks completed between handoffs. |

When `enabled: false` or the section is absent, forge core behaves identically
to before this plugin existed (Correctness Property 7).

## How It Works

```
task:done → next-action (executing handler)
    │
    ├─ context-manager plugin evaluates checkpoint:
    │   1. Read context usage (platform-specific reader)
    │   2. Compare against threshold_pct
    │   3. Check anti-loop (min_tasks_between_handoff)
    │   4. Detect terminal capability
    │
    ├─ BELOW threshold → action: "continue" (dispatch next task)
    │
    ├─ ABOVE threshold + supports in-place:
    │   → action: "handoff-session", method: "in-place"
    │   → Plugin writes .forge/handoff-signal.json
    │   → Stop/idle hook script executes /clear + /resume
    │
    └─ ABOVE threshold + bare terminal:
        → action: "suggest-compact"
        → Skill outputs: "⏸ Context high — run /compact then /resume"
```

## Terminal-Specific Behavior

| Terminal | Strategy | Behavior |
|----------|----------|----------|
| OpenCode (any) | in-place | SDK: session.new → appendPrompt("/resume") → submitPrompt() |
| tmux | in-place | send-keys /clear Enter → sleep → send-keys /resume Enter |
| WezTerm | in-place | cli send-text /clear → sleep → cli send-text /resume |
| Windows Terminal | new-window | `wt new-tab` (send-input not supported) |
| Bare terminal | prompt-compact | User prompted to /compact + /resume manually |

## Troubleshooting

### Check context usage manually

```bash
forge context:usage --json
```

Returns current platform, session, total_context, usage_pct, and advice.

### Check handoff state

```bash
forge handoff:get
```

Outputs `.forge/handoff.md` content (rebuilt from progress.json if missing).

### Verify handoff/progress consistency

```bash
forge audit
```

Reports any `handoff_drift` inconsistencies in the output JSON.

### Plugin not triggering

1. Check `forge context:usage` returns `ok: true` — platform detection working?
2. Check `.forge/config.json` has `context_management.enabled: true`
3. Check threshold — is usage actually above `threshold_pct`?
4. Check anti-loop — has at least `min_tasks_between_handoff` tasks completed
   since last handoff? Look at `.forge/handoff-meta.json`.

### Hook scripts not executing

1. tmux: verify `$TMUX` is set in the hook environment
2. WezTerm: verify `wezterm cli` is available
3. All: check `.forge/handoff-signal.json` was created by the run-loop
4. All: check the Stop hook is registered in `.claude/settings.json`

## See Also

- `forge context:usage` — programmatic context occupancy check
- `forge handoff:get` — handoff state seed
- `docs/install-claude-code.md` — Claude Code env var recommendations
- `docs/superpowers/specs/2026-06-04-context-management-design.md` — full spec
