import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";

import { defaultConfig } from "../src/state/config.js";
import { idleProgress } from "../src/state/progress.js";

const repoRoot = resolve(import.meta.dirname, "../..");
const forgeBin = resolve(repoRoot, "cli/dist/index.js");

function withTempProject(run: (cwd: string) => void): void {
  const cwd = mkdtempSync(join(tmpdir(), "forge-compact-inject-"));
  try {
    mkdirSync(join(cwd, ".forge"), { recursive: true });
    run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

function runForge(cwd: string, args: string[]) {
  return spawnSync(process.execPath, [forgeBin, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: "", GEMINI_CLI: "" },
  });
}

function writeConfig(cwd: string, memoryFile = "AGENTS.md"): void {
  writeFileSync(
    join(cwd, ".forge", "config.json"),
    JSON.stringify(defaultConfig({ memory_file: memoryFile as any }), null, 2),
    "utf8",
  );
}

function writeProgress(cwd: string): void {
  writeFileSync(
    join(cwd, ".forge", "progress.json"),
    JSON.stringify(idleProgress(), null, 2),
    "utf8",
  );
}

describe("feature:start injects Compact Instructions", () => {
  test("creates ## Compact Instructions block in AGENTS.md", () => {
    withTempProject((cwd) => {
      writeConfig(cwd, "AGENTS.md");
      writeProgress(cwd);

      const result = runForge(cwd, [
        "feature:start",
        "--feature",
        "compact-test",
        "--spec",
        "docs/spec.md",
      ]);
      expect(result.status).toBe(0);

      const memFile = join(cwd, "AGENTS.md");
      expect(existsSync(memFile)).toBe(true);
      const content = readFileSync(memFile, "utf8");

      // Must have the Compact Instructions heading
      expect(content).toContain("## Compact Instructions");

      // Must have the three required instructions
      expect(content).toContain("progress.json");
      expect(content).toContain("handoff.md");
      expect(content).toContain("/resume");
    });
  });

  test("creates ## Compact Instructions block in CLAUDE.md", () => {
    withTempProject((cwd) => {
      writeConfig(cwd, "CLAUDE.md");
      writeProgress(cwd);

      const result = runForge(cwd, [
        "feature:start",
        "--feature",
        "compact-test",
        "--spec",
        "docs/spec.md",
      ]);
      expect(result.status).toBe(0);

      const memFile = join(cwd, "CLAUDE.md");
      expect(existsSync(memFile)).toBe(true);
      const content = readFileSync(memFile, "utf8");
      expect(content).toContain("## Compact Instructions");
    });
  });

  test("Compact Instructions appears as a top-level ## heading (not nested under ## Forge)", () => {
    withTempProject((cwd) => {
      writeConfig(cwd, "AGENTS.md");
      writeProgress(cwd);

      runForge(cwd, [
        "feature:start",
        "--feature",
        "heading-test",
        "--spec",
        "docs/spec.md",
      ]);

      const content = readFileSync(join(cwd, "AGENTS.md"), "utf8");

      // Both headings must exist as separate ## sections
      expect(content).toContain("## Compact Instructions");
      expect(content).toContain("## Forge");

      // Compact Instructions should appear BEFORE ## Forge
      const compactIdx = content.indexOf("## Compact Instructions");
      const forgeIdx = content.indexOf("## Forge");
      expect(compactIdx).toBeLessThan(forgeIdx);
    });
  });

  test("does not duplicate Compact Instructions on repeated feature:start", () => {
    withTempProject((cwd) => {
      writeConfig(cwd, "AGENTS.md");
      writeProgress(cwd);

      // First feature:start
      runForge(cwd, [
        "feature:start",
        "--feature",
        "first",
        "--spec",
        "docs/spec.md",
      ]);

      // Reset progress to idle so we can start another feature
      writeProgress(cwd);

      // Second feature:start
      runForge(cwd, [
        "feature:start",
        "--feature",
        "second",
        "--spec",
        "docs/spec2.md",
      ]);

      const content = readFileSync(join(cwd, "AGENTS.md"), "utf8");
      const matches = content.match(/## Compact Instructions/g);
      expect(matches?.length).toBe(1);
    });
  });

  test("preserves existing content in memory file", () => {
    withTempProject((cwd) => {
      writeConfig(cwd, "AGENTS.md");
      writeProgress(cwd);

      // Pre-seed the file with existing content
      writeFileSync(
        join(cwd, "AGENTS.md"),
        "# My Project\n\nSome important notes.\n",
        "utf8",
      );

      runForge(cwd, [
        "feature:start",
        "--feature",
        "preserve-test",
        "--spec",
        "docs/spec.md",
      ]);

      const content = readFileSync(join(cwd, "AGENTS.md"), "utf8");
      expect(content).toContain("# My Project");
      expect(content).toContain("Some important notes.");
      expect(content).toContain("## Compact Instructions");
      expect(content).toContain("## Forge");
    });
  });
});
