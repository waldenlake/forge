import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const repoRoot = resolve(import.meta.dirname, "../..");

// Phase 7 skill rewrite:
// - /next is a thin next-action loop; it does NOT call task, verify, or phase commands.
// - /executing is single-task only; it does NOT contain per-task loop or phase:complete.
// - /planning is creative-only; it returns control after phase:advance.
// - /resume converges on next-action after recovery checks.
const skillsCallingForge = [
  "skills/forge_start/SKILL.md",
  "skills/forge_planning/SKILL.md",
  "skills/forge_executing/SKILL.md",
  "skills/forge_verify/SKILL.md",
  "skills/forge_done/SKILL.md",
  "skills/forge_next/SKILL.md",
  "skills/forge_progress-tracking/SKILL.md",
  "skills/forge_resume/SKILL.md",
  "skills/forge_bugfix/SKILL.md",
  "skills/forge_session-handoff/SKILL.md",
  "skills/forge_using-forge/SKILL.md",
] as const;

// Skills that must NOT instruct direct .forge/*.json edits.
const orchestrationSkillFiles = skillsCallingForge.filter(
  (file) => file !== "skills/forge_using-forge/SKILL.md",
);

const scenarioSkillFile = "skills/forge_scenarios/SKILL.md";

const cliResolutionLine = `FORGE_CMD=$(command -v forge 2>/dev/null || { if [ -f "$HOME/.config/opencode/plugins/forge/cli/dist/index.js" ]; then echo "node $HOME/.config/opencode/plugins/forge/cli/dist/index.js"; else echo ".forge/bin/forge"; fi; })`;

const stateMutationProhibition = "do not edit `.forge/*.json` directly";

function readSkill(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), "utf8");
}

function indexesInOrder(content: string, snippets: string[]): boolean {
  let previous = -1;

  return snippets.every((snippet) => {
    const next = content.indexOf(snippet, previous + 1);
    if (next === -1) {
      return false;
    }
    previous = next;
    return true;
  });
}

function directStateMutationInstructions(content: string): string[] {
  const normalized = content.replace(/`/g, "");
  const action = String.raw`(?:write|overwrite|update|edit|modify|set|populate|clean|reset)`;
  const target = String.raw`(?:\.forge\/(?:progress|config)\.json|(?:progress|config)\.json)`;
  const patterns = [
    new RegExp(String.raw`\b${action}\b[^\n]{0,80}\b${target}\b`, "gi"),
    new RegExp(String.raw`\b${target}\b[^\n]{0,80}\b${action}\b`, "gi"),
  ];
  const matches = patterns.flatMap((pattern) => normalized.match(pattern) ?? []);

  return matches.filter(
    (match) =>
      !/\bdo not\b/i.test(match) &&
      !/\bmust not\b/i.test(match) &&
      !/\bwithout\b/i.test(match) &&
      !/\bRuntime\b/i.test(match) &&
      !/\bnever\b/i.test(match) &&
      !/\bforge\s+reset\b/i.test(match),
  );
}

describe("Forge skill contracts", () => {
  test.each(skillsCallingForge)("%s resolves the Forge CLI before Runtime calls", (file) => {
    expect(readSkill(file)).toContain(cliResolutionLine);
  });

  test.each(skillsCallingForge)("%s can resolve OpenCode plugin runtime", (file) => {
    const content = readSkill(file);
    expect(content).toContain("$HOME/.config/opencode/plugins/forge/cli/dist/index.js");
    expect(
      indexesInOrder(content, [
        "command -v forge",
        "$HOME/.config/opencode/plugins/forge/cli/dist/index.js",
        ".forge/bin/forge",
      ]),
    ).toBe(true);
  });

  test.each(orchestrationSkillFiles)(
    "%s prohibits direct .forge/*.json edits",
    (file) => {
      const content = readSkill(file);
      // Each skill must contain a wording that forbids direct JSON edits.
      // Tolerate either the long-form ("do not edit") or the short-form
      // ("never edit `.forge/*.json` directly").
      const ok =
        content.includes(stateMutationProhibition) ||
        /never edit `\.forge\/\*\.json` directly/.test(content);
      expect(ok, `${file} must prohibit direct .forge/*.json edits`).toBe(true);
    },
  );

  test.each(orchestrationSkillFiles)(
    "%s does not reintroduce direct Forge JSON state mutation instructions",
    (file) => {
      expect(directStateMutationInstructions(readSkill(file))).toEqual([]);
    },
  );

  test("direct state mutation detector catches legacy wording examples", () => {
    expect(
      directStateMutationInstructions(
        [
          "Overwrite `.forge/progress.json` with idle state.",
          "Update progress.json after extracting tasks.",
          "Write .forge/config.json using the detected values.",
        ].join("\n"),
      ),
    ).toEqual([
      "Overwrite .forge/progress.json",
      "Update progress.json",
      "Write .forge/config.json",
    ]);
  });

  test("using-forge documents Runtime ownership and v2 migration rules", () => {
    const content = readSkill("skills/forge_using-forge/SKILL.md");

    expect(content).toContain("single source of truth");
    expect(content).toMatch(/MUST NOT|do not|never/i);
    expect(content).toContain("v2 is not backward-compatible");
    expect(content).toContain("forge migrate --from 1.0 --to 2.0");
  });

  // /next is a thin run-loop driver. It must NOT contain phase-specific CLI calls.
  test("next skill is a thin run-loop driver and does not run phase commands", () => {
    const content = readSkill("skills/forge_next/SKILL.md");

    // Must reference run-loop as the primary mechanism
    expect(content).toContain("run-loop");

    // Phase skills are invoked via run-loop dispatch
    expect(content).toContain("/planning");
    expect(content).toContain("/executing");
    expect(content).toContain("/verify");
    expect(content).toContain("/done");

    // Must NOT contain any run-cli execution logic or guard/after handling
    expect(content).not.toContain("$FORGE_CMD task:start");
    expect(content).not.toContain("$FORGE_CMD task:done");
    expect(content).not.toContain("$FORGE_CMD guard:run");
    expect(content).not.toContain("$FORGE_CMD guard:record");
    expect(content).not.toContain("$FORGE_CMD phase:advance");
    expect(content).not.toContain("call-next-action");
    // Skill should not instruct dispatching run-cli actions
    expect(content).not.toContain('action: "run-cli"');
  });

  test("planning skill registers the plan before advancing to execution", () => {
    expect(
      indexesInOrder(readSkill("skills/forge_planning/SKILL.md"), [
        "schema:validate --file .forge/scenarios.json",
        "plan:register --plan",
        "phase:advance",
      ]),
    ).toBe(true);
  });

  test("executing skill drives single-task lifecycle", () => {
    const content = readSkill("skills/forge_executing/SKILL.md");
    // Single-task: has task:start and task:done
    expect(content).toContain("task:start");
    expect(content).toContain("task:done");
    // Does NOT contain $FORGE_CMD phase:complete (it only mentions phase:complete
    // in a "do NOT" instruction, not as a command to run)
    expect(content).not.toContain("$FORGE_CMD phase:complete");
    // Returns control to /next loop
    expect(content).toContain("Return control");
  });

  test("verify skill runs forge verify and promotes via phase:verify-pass", () => {
    expect(
      indexesInOrder(readSkill("skills/forge_verify/SKILL.md"), [
        "$FORGE_CMD verify --coverage",
        "phase:verify-pass",
      ]),
    ).toBe(true);
  });

  test("done skill finishes phase, archives scenarios, updates memory, then resets", () => {
    expect(
      indexesInOrder(readSkill("skills/forge_done/SKILL.md"), [
        "phase:finish",
        "scenarios:archive",
        "memory:complete-feature",
        "reset --backup",
      ]),
    ).toBe(true);
  });

  test("start runs doctor and feature:start without doing planning work", () => {
    const content = readSkill("skills/forge_start/SKILL.md");

    // /start handles env check + feature registration; planning belongs to
    // /planning.
    expect(content).toContain("$FORGE_CMD doctor");
    expect(content).toContain("feature:start --feature <slug>");

    // /start no longer drives brainstorming or scenarios — those moved to
    // /planning.
    expect(content).not.toContain("schema:validate --file .forge/scenarios.json");
    expect(content).not.toContain("scenarios skill with");
  });

  test("scenarios skill accepts explicit /planning inputs without progress state", () => {
    const content = readSkill(scenarioSkillFile);

    expect(content).toContain("explicit `<spec_path>` from the calling skill");
    expect(content).toContain("explicit `<feature_slug>` from the calling skill");
    expect(content).toContain("Do not read `.forge/progress.json`");
    expect(content).not.toContain("progress.json.spec_path");
    expect(content).not.toContain("spec_path not set in progress.json");
  });

  // Phase 7: /resume converges on run-loop
  test("resume skill converges on run-loop after recovery checks", () => {
    const content = readSkill("skills/forge_resume/SKILL.md");

    // Still has recovery-invariant checks
    expect(content).toContain("audit");
    expect(content).toContain("commit:check");

    // Converges on run-loop
    expect(content).toContain("run-loop");
  });
});
