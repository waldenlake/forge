# Context Management Validation Report

> Status: **PENDING** — requires real-machine execution
> Created: 2026-06-04

## ut-5 Style Token Verification (Task 28)

### Methodology

Run a complete forge feature (7+ tasks, real implementer + 3-layer review +
verify + done) on a real engineering project with the context management
spec fully implemented. Read token usage from OpenCode SQLite or Claude Code
JSONL after completion.

### Target Metrics

| Metric | Baseline (ut-5) | Target | Measured | Status |
|--------|-----------------|--------|----------|--------|
| bash test output tokens | ~14k | <3k | — | PENDING |
| read file tokens | ~10k | <5k | — | PENDING |
| Final context (total) | 163k | <100k | — | PENDING |
| Tasks completable in one session | ~10 | ≥20 | — | PENDING |

### How to Run

```bash
# 1. Set up a project with forge init
forge init --auto-detect

# 2. Start a 7+ task feature
forge feature:start --feature <slug> --spec <path>

# 3. Execute all tasks through the run-loop (with real subagents)
# 4. After completion, read the session token data:

# OpenCode:
sqlite3 ~/.local/share/opencode/opencode.db \
  "SELECT tokens FROM message WHERE session_id='<id>' AND role='assistant' ORDER BY time_created DESC LIMIT 1"

# Claude Code:
tail -1 ~/.claude/projects/<encoded>/<session>.jsonl | jq '.message.usage'
```

### Deviations

Document any deviations from targets here with root cause analysis.

---

## Chain A Real-Machine Timing Verification (Task 29)

### Environments to Test

| Environment | Mechanism | Status | Measured Delay |
|-------------|-----------|--------|----------------|
| OpenCode (SDK) | session.new → appendPrompt → submitPrompt | PENDING | — |
| Claude Code + tmux | send-keys /clear + /resume | PENDING | — |
| Claude Code + WezTerm | cli send-text /clear + /resume | PENDING | — |
| Claude Code + wt.exe | wt new-tab (fallback) | PENDING | — |

### Verification Criteria

For each environment, confirm:
1. Clear/spawn fires at agent idle time (not mid-response)
2. `/clear` actually executes (not dropped into buffer)
3. Resume command executes after clear
4. New context starts from correct next task (verified via handoff.md)
5. Injection failure silently degrades to Chain B, progress.json unchanged

### Delay Tuning

Record the minimum reliable delay for each environment:
- tmux: start at 300ms, increase until reliable
- WezTerm: start at 300ms
- wt.exe: N/A (opens new tab, no timing issue)

Write final values into plugin default config.

---

## Notes

- Task 28+29 MUST be run on real machines — simulated/mocked tests are
  insufficient for timing validation (spec requirement: "坑 2 必须真机跑通")
- If any metric doesn't meet target, document WHY and adjust implementation
- Do NOT mark these tasks complete until real measurements are recorded
