import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const repoRoot = resolve(import.meta.dirname, "../..");

const skillFiles = [
  "skills/start/SKILL.md",
  "skills/next/SKILL.md",
  "skills/progress-tracking/SKILL.md",
  "skills/done/SKILL.md",
  "skills/resume/SKILL.md",
  "skills/bugfix/SKILL.md",
  "skills/session-handoff/SKILL.md",
  "skills/using-forge/SKILL.md",
] as const;

const orchestrationSkillFiles = [
  "skills/start/SKILL.md",
  "skills/next/SKILL.md",
  "skills/progress-tracking/SKILL.md",
  "skills/done/SKILL.md",
  "skills/resume/SKILL.md",
  "skills/bugfix/SKILL.md",
  "skills/session-handoff/SKILL.md",
] as const;

const scenarioSkillFile = "skills/scenarios/SKILL.md";

const cliResolutionBlock = `## Forge CLI

Before calling any Forge Runtime command, resolve the executable:

\`\`\`bash
FORGE_CMD=$(command -v forge 2>/dev/null || { if [ -f "$HOME/.config/opencode/plugins/forge/cli/dist/index.js" ]; then echo "node $HOME/.config/opencode/plugins/forge/cli/dist/index.js"; else echo ".forge/bin/forge"; fi; })
\`\`\`

All Runtime commands output JSON by default. Read the JSON, report blocking
errors exactly, and do not edit \`.forge/*.json\` directly.`;

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
      !/\bRuntime\b/i.test(match),
  );
}

describe("Forge skill contracts", () => {
  test.each(skillFiles)("%s resolves the Forge CLI before Runtime calls", (file) => {
    expect(readSkill(file)).toContain(cliResolutionBlock);
  });

  test.each(skillFiles)("%s can resolve OpenCode plugin runtime before project init", (file) => {
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
    "%s delegates state mutation to Runtime instead of editing Forge JSON",
    (file) => {
      const content = readSkill(file);

      expect(content).toContain("do not edit `.forge/*.json` directly");
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

  test("using-forge states Runtime ownership and v2 migration rules", () => {
    const content = readSkill("skills/using-forge/SKILL.md");

    expect(content).toContain(
      "Runtime owns reality-changing operations",
    );
    expect(content).toContain(
      "Direct edits to `.forge/*.json` are invalid during active Forge work",
    );
    expect(content).toContain("v2 config is not backward-compatible");
    expect(content).toContain("forge migrate --from 1.0 --to 2.0");
  });

  test("next skill documents task execution, guard, commit, and verification commands", () => {
    const content = readSkill("skills/next/SKILL.md");

    for (const command of [
      "task:start",
      "$FORGE_CMD test --coverage",
      "forge commit",
      "task:done",
      "guard:record",
      "$FORGE_CMD verify --coverage",
    ]) {
      expect(content).toContain(command);
    }
  });

  test("next registers the plan before advancing to execution", () => {
    expect(
      indexesInOrder(readSkill("skills/next/SKILL.md"), [
        "plan:register --plan <path>",
        "phase:advance",
      ]),
    ).toBe(true);
  });

  test("done skill documents finish, archive, memory, and backup reset commands", () => {
    const content = readSkill("skills/done/SKILL.md");

    for (const command of [
      "phase:finish",
      "scenarios:archive",
      "memory:complete-feature",
      "reset --backup",
    ]) {
      expect(content).toContain(command);
    }
  });

  test("start validates scenarios before starting the Runtime feature", () => {
    const content = readSkill("skills/start/SKILL.md");

    expect(content).toContain("explicit `<spec_path>`");
    expect(content).toContain("explicit `<feature_slug>`");
    expect(
      indexesInOrder(content, [
        "schema:validate --file .forge/scenarios.json",
        "feature:start --feature <slug> --spec <path>",
      ]),
    ).toBe(true);
  });

  test("done finishes before archive, memory completion, and reset fallback", () => {
    expect(
      indexesInOrder(readSkill("skills/done/SKILL.md"), [
        "phase:finish",
        "scenarios:archive",
        "memory:complete-feature",
        "reset --backup",
      ]),
    ).toBe(true);
  });

  test("scenarios skill accepts explicit start inputs without progress state", () => {
    const content = readSkill(scenarioSkillFile);

    expect(content).toContain("explicit `<spec_path>` from the calling skill");
    expect(content).toContain("explicit `<feature_slug>` from the calling skill");
    expect(content).toContain("Do not read `.forge/progress.json`");
    expect(content).not.toContain("progress.json.spec_path");
    expect(content).not.toContain("spec_path not set in progress.json");
  });
});
