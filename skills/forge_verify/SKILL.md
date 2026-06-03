---
name: forge:verify
description: Phase 4 — full verification + failure routing + phase:verify-pass
---

# /verify

Drive the Forge workflow through Phase 4 — full verification (tests +
coverage + build + security + dependency audit), failure routing, and
`phase:verify-pass`.

> **Note:** gstack integration (basic tests, E2E, visual regression,
> performance) is not yet implemented. All gstack-related steps are
> automatically skipped.

This skill owns the verify phase end-to-end. It must finish with the feature
in `verified` state (or stop with an explicit blocker).

## Forge CLI

Before calling any Forge Runtime command, resolve the executable:

```bash
FORGE_CMD=$(command -v forge 2>/dev/null || { if [ -f "$HOME/.config/opencode/plugins/forge/cli/dist/index.js" ]; then echo "node $HOME/.config/opencode/plugins/forge/cli/dist/index.js"; else echo ".forge/bin/forge"; fi; })
```

All Runtime commands output JSON. Parse the JSON silently, extract only
relevant fields, and present results using SKILL-UX.md templates. NEVER
display raw JSON to the user. Never edit `.forge/*.json` directly.

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

### Step 1: Display verification plan

Before running the full verification, output `▸ Verification plan:` and run:

```bash
$FORGE_CMD verify --plan
```

Display a one-line summary so the user knows what's about to run:

```
▸ Verification plan:
  will run:  tests, build, security_scan, dependency_audit
  skipped:   gstack-basic (not yet implemented), e2e (not yet implemented), visual_regression (not yet implemented), performance (not yet implemented)
  thresholds: coverage_unit=80, security=HIGH, retry=3
```

This is informational only — do not prompt. To change the plan, the user
runs `$FORGE_CMD config:verify --<flag>` themselves and re-invokes `/verify`.

### Step 2: Run forge verify --coverage

Output `▸ Verifying…`, then run:

```bash
$FORGE_CMD verify --coverage
```

This runs the full Phase 5 pipeline: tests + build +
security_scan + dependency_audit — driven by `config.verify.*` flags.

> gstack steps (basic, E2E, visual, performance) are not yet implemented
> and will appear as `skipped` in the verification report.

The response is a verification report with:
- `ok`, `status`
- `results[]`: each step has `name`, `ok`, `class`, optional `skipped`.
- `failure_class`: aggregated highest-priority class
  (`security` > `infra` > `implementation` > `null`).
- `attempts`: cumulative attempt counter.

### Step 3: Branch on result

#### 3a. ok: true → promote

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

#### 3b. ok: false, failure_class === "security"

A security-class failure (CVE / dependency audit) is a discrete, isolatable
bug. Route to `/bugfix`:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✘  verify: security-class failure (CVE / hardcoded secret)
▸  Next: /bugfix <description from results>
```

STOP. After `/bugfix` completes, the user should run `/verify` again.

#### 3c. ok: false, failure_class === "infra"

Build / environment / tooling failure. Surface verbatim and STOP — these
are not subagent-fixable:

```
✘  verify: infra-class failure — <stderr excerpt>
```

#### 3d. ok: false, failure_class === "implementation"

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
