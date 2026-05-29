---
name: forge:verify
description: Phase 4 — full verification + failure routing + phase:verify-pass
---

# /verify

Drive the Forge workflow through Phase 4 — full verification (tests +
coverage + build + gstack basic + security + dependency audit + optional
gstack E2E/visual/perf), failure routing, and `phase:verify-pass`.

This skill owns the verify phase end-to-end. It must finish with the feature
in `verified` state (or stop with an explicit blocker).

## Forge CLI

Before calling any Forge Runtime command, resolve the executable:

```bash
FORGE_CMD=$(command -v forge 2>/dev/null || { if [ -f "$HOME/.config/opencode/plugins/forge/cli/dist/index.js" ]; then echo "node $HOME/.config/opencode/plugins/forge/cli/dist/index.js"; else echo ".forge/bin/forge"; fi; })
```

All Runtime commands output JSON. Read the JSON, report blocking errors
exactly, and never edit `.forge/*.json` directly.

## Output Format

Follow `skills/SKILL-UX.md`.

**Header**:

```
⚒ Forge  ·  /verify
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Progress lines**:

```
▸ Verifying…
▸ Promoting to verified…
```

## Preconditions

1. Run `$FORGE_CMD status`.
2. If status is not `execution_complete`, output:
   `✘ status: <status> — /verify requires execution_complete state.`
   Then STOP.
3. If `verification.attempts >= 3`, output:
   `✘ verify: retry budget exhausted — human review required`
   Then STOP. The CLI gate will refuse re-entry.

## Flow

### Step 1: Run forge verify --coverage

Output `▸ Verifying…`, then run:

```bash
$FORGE_CMD verify --coverage
```

This runs the full Phase 5 pipeline: tests + build + gstack-basic +
security_scan + dependency_audit + optional E2E/visual/perf — driven by
`config.verify.*` flags.

The response is a verification report with:
- `ok`, `status`
- `results[]`: each step has `name`, `ok`, `class`, optional `skipped`.
- `failure_class`: aggregated highest-priority class
  (`security` > `infra` > `implementation` > `null`).
- `attempts`: cumulative attempt counter.

### Step 2: Branch on result

#### 2a. ok: true → promote

Output `▸ Promoting to verified…`, then run:

```bash
$FORGE_CMD phase:verify-pass
```

If `ok` is false:

```
✘  phase:verify-pass blocked — <blocked_by>
```

STOP.

On success, do NOT stop — immediately invoke the `/done` skill.

Output `▸ Advancing to done…` then invoke `/done`.

#### 2b. ok: false, failure_class === "security"

A security-class failure (CVE / dependency audit) is a discrete, isolatable
bug. Route to `/bugfix`:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✘  verify: security-class failure (CVE / hardcoded secret)
▸  Next: /bugfix <description from results>
```

STOP. After `/bugfix` completes, the user should run `/verify` again.

#### 2c. ok: false, failure_class === "infra"

Build / environment / tooling failure. Surface verbatim and STOP — these
are not subagent-fixable:

```
✘  verify: infra-class failure — <stderr excerpt>
```

#### 2d. ok: false, failure_class === "implementation"

Test / coverage / E2E / visual / perf failure. Re-enter the executing
phase via subagent. The CLI has already incremented
`verification.attempts`; if it now equals 3 the next /verify call will
block with `retry_exhausted`.

```
✘  verify: implementation-class failure  ·  attempt <N>/3
▸  Next: /executing (re-enter affected tasks via subagent)
   then /verify again
```

STOP.

## Error Handling

| Condition | Output |
|---|---|
| Status not `execution_complete` | `✘ status: <status> — /verify requires execution_complete state.` |
| `verify` blocked: retry_exhausted | `✘ verify: retry budget exhausted — human review required` |
| `phase:verify-pass` blocked | `✘ phase:verify-pass blocked — <blocked_by>` |
| Runtime `ok: false` | `✘ <command>: <error or blocked_by from JSON>` |

## Dependencies

- **Forge CLI Runtime** — verify, phase:verify-pass.
- **/bugfix skill** — for security-class failures.
- **/executing skill** — for implementation-class failures (re-entry).
