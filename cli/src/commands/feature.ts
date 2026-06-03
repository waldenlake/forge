import { existsSync, readFileSync } from "node:fs";
import type { Command } from "commander";
import { readConfig } from "../state/config.js";
import {
  idleProgress,
  nowIso,
  progressPath,
  readProgress,
  writeProgress,
} from "../state/progress.js";
import {
  ensureForgeSection,
  memoryPath,
  replaceWorkflowRules,
  writeAndVerify,
} from "../state/memory.js";

type FeatureStartOptions = {
  feature: string;
  spec: string;
};

const WORKFLOW_RULES_BLOCK = `**Workflow Rules**
MANDATORY — applies until this feature is complete.

NEXT-ACTION LOOP (the single workflow control flow):
  1. Run: $FORGE_CMD run-loop
  2. Read the JSON output. Dispatch by action:
     - invoke-skill → invoke the skill with args; if record exists, run
                      guard:record after the skill returns; then go to 1
     - wait-human   → output reason + recovery; STOP
     - ok:false     → output error + recovery; STOP
  3. Obey the reminder field on every step. Do not improvise.

  The CLI internally handles all deterministic steps (guard:run, guard:record,
  phase:complete, etc.) — you never see or run them yourself.

PER-TASK (inside /executing, invoked by run-loop with task_id):
  1. $FORGE_CMD task:start --id <id>
  2. Output exactly: "→ Subagent: task <id> — <title>"
     Then use the superpowers:subagent-driven-development skill.
     Three sub-stages REQUIRED in order — execute ALL of them before step 3:
       a) Implementer subagent — TDD + commit with [forge task-<id>] tag
       b) Spec Compliance Reviewer subagent
       c) Code Quality Reviewer subagent
     Only after all three pass may you proceed to step 3.
     If the skill is unavailable: output "Subagent unavailable — halting." and STOP.
  3. $FORGE_CMD task:done --id <id>
     (CLI auto-runs gitnexus index --update; failure recorded to guard_history)
  4. Return control to the run-loop (do NOT select the next task).

IMPLEMENTER SUBAGENT TDD DISCIPLINE (strict RED → GREEN → REFACTOR):
  The implementer subagent MUST follow this exact order. No exceptions.
  ① RED: Write failing tests FIRST.
     - Read the task's associated scenario IDs from the plan.
     - Read matching scenarios from .forge/scenarios.json.
     - Write test cases that encode each scenario's Given/When/Then assertions.
     - Run tests — they MUST FAIL. If they pass, the feature already exists.
     - Do NOT write any implementation code until tests exist and fail.
  ② GREEN: Write minimal implementation to make tests pass.
     - Only code necessary to satisfy the failing tests. YAGNI.
     - Run tests — they MUST ALL PASS before proceeding.
  ③ REFACTOR: Clean up code while keeping tests green.
     - Extract duplication, improve naming, simplify logic.
     - Run tests again — confirm still green.
  THEN commit: $FORGE_CMD commit --message "feat: <title>" --tag "forge task-<id>"

  VIOLATIONS (any of these means the TDD discipline was broken):
  - Writing implementation code before tests exist.
  - Writing tests that test implementation details instead of scenario behavior.
  - Skipping the RED phase because "the task is simple."
  - Modifying tests to make them pass instead of fixing implementation.

YOU ARE VIOLATING THESE RULES if you:
  - Implement, edit, test, or commit code yourself (the subagent owns it).
  - Skip any of the three sub-stages, including for "simple" tasks.
  - Call task:done before all three sub-stages complete.
  - Edit .forge/*.json directly (CLI is the only writer).
  - Select the next task yourself instead of letting run-loop decide.
  - Improvise workflow routing instead of obeying run-loop output.

STOP only when: run-loop returns wait-human, run-loop returns ok:false,
guard fails, subagent is unavailable, or all phases complete.
When forge CLI returns ok:false: report the error exactly and stop immediately.

CONTEXT BUDGET:
  After each task completes, assess whether you have sufficient context
  remaining to execute the next task with full quality (TDD + 3-stage
  review). Signs of degraded context: forgetting earlier task details,
  repeating questions already answered, losing track of the plan structure,
  or noticing that the system has compressed earlier messages.
  If context is insufficient:
    1. Run $FORGE_CMD memory:set-feature (save handoff state)
    2. Execute the platform new-session command directly (do NOT just
       output it — actually run it):
       - Claude Code: /clear
       - OpenCode/Codex: /new
       The new session will auto-detect the active feature and run
       /resume automatically. No user intervention needed.`;

function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

export function registerFeatureCommand(program: Command): void {
  program
    .command("feature:start")
    .requiredOption("--feature <feature>", "feature name")
    .requiredOption("--spec <path>", "spec file path")
    .action((options: FeatureStartOptions) => {
      const cwd = process.cwd();

      if (existsSync(progressPath(cwd)) && readProgress(cwd).status !== "idle") {
        process.exitCode = 1;
        writeJson({
          ok: false,
          blocked_by: "active feature in progress",
        });
        return;
      }

      const timestamp = nowIso();
      const progress = {
        ...idleProgress(),
        feature: options.feature,
        status: "planning" as const,
        created_at: timestamp,
        updated_at: timestamp,
        spec_path: options.spec,
      };

      writeProgress(cwd, progress);

      try {
        const config = readConfig(cwd);
        const file = memoryPath(cwd, config);
        const raw = existsSync(file) ? readFileSync(file, "utf8") : "";
        const withForge = ensureForgeSection(raw);
        const updated = replaceWorkflowRules(withForge, WORKFLOW_RULES_BLOCK);
        writeAndVerify(file, updated, "**Workflow Rules**");
      } catch {
        // Non-fatal
      }

      writeJson({
        ok: true,
        feature: options.feature,
        status: "planning",
        spec_path: options.spec,
      });
    });
}
