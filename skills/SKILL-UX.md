# Forge Skill UX Standard

All user-invocable skills (`/start`, `/next`, `/done`, `/resume`, `/bugfix`)
follow this output standard. Copy the exact templates into each skill's
**Output Format** section. Do not improvise formatting.

---

## 1. Skill Header

Output once at the very beginning, after any hard gates (e.g. empty-argument
checks) but before any CLI calls.

```
⚒ Forge  ·  /command
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Replace `command` with the skill name. No version number, no box drawing.

---

## 2. Progress Line

Output one line **before** starting each significant operation (task, subagent,
phase transition). Keeps the user informed without wall-of-text.

```
▸ [N/T] Task title
```

Where `N` is the 1-based current task number and `T` is total task count.
For non-task operations (brainstorm, verify, archive):

```
▸ Brainstorming…
▸ Verifying…
▸ Archiving scenarios…
```

---

## 3. Step Result

Output one line **after** each significant operation completes successfully.

```
✔ Task N done
✔ Guard passed  ·  batch-review
✔ Verification passed
✔ Scenarios validated  ·  8 scenarios, 3 P0
```

Use `·` (middle dot U+00B7) as the separator for secondary info. No parentheses.

---

## 4. STOP Block

Output whenever execution pauses and the user must act. Always at the end
of the response. Never mid-flow.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏸  <one-line reason>
▸  Next: <exact command or action>
```

Examples:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏸  Plan written — review before registering
▸  Next: /next

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏸  Guard: human-review triggered for Task 4
▸  Next: confirm or reject, then run /next

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏸  Scenarios ready — review above before continuing
▸  Next: /next to confirm  ·  or ask to revise
```

---

## 5. Completion Block

Output when a phase or the entire feature finishes cleanly.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✔  <feature-slug>  ·  N tasks done  ·  N deferred
▸  Next: /done
```

Or for `/done`:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✔  Feature complete: <feature-slug>
   Tasks:     <done>/<total>  (deferred: <N>)
   Scenarios: <archive-path>
   Spec:      <spec-path>
   Plan:      <plan-path>
```

---

## 6. Error Line

Output when a Runtime command returns `ok: false` or a precondition fails.
Always followed by STOP.

```
✘  <command>: <error field from JSON>
```

For blocked transitions:

```
✘  phase:advance blocked — <blocked_by field>
```

---

## 7. Rules

- **No emoji beyond the defined set** (`⚒ ▸ ✔ ⏸ ✘`). Do not add 🎉, 🚀, etc.
- **No bold or headers mid-flow.** Use plain lines. Structure comes from the
  template shapes, not markdown.
- **One blank line** between progress/result lines. No extra spacing.
- **Do not repeat the skill header** if invoking a sub-skill (e.g. scenarios)
  within the same response.
- **STOP Block is always the last thing output.** Nothing after the `▸ Next:` line.
- For multi-step completions (e.g. several tasks), batch the `✔` lines
  together before the STOP Block — do not interleave with prose.
- **NEVER display raw JSON from CLI commands.** All `$FORGE_CMD` commands
  output JSON — parse it silently, extract only the relevant fields, and
  present human-readable results using the templates above. If you need to
  report an error, use the Error Line format (`✘ command: error message`),
  not the raw JSON payload.
- **Consolidate adjacent progress lines.** If multiple checks complete in
  sequence (e.g. doctor + status + init), output them as a single block
  with one progress line and a summary result — do not split each into a
  separate message with its own `▸` line.
