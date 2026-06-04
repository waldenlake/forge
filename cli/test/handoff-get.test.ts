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

import { defaultConfig, type ForgeConfig } from "../src/state/config.js";
import { idleProgress, type ForgeProgress } from "../src/state/progress.js";

const repoRoot = resolve(import.meta.dirname, "../..");
const forgeBin = resolve(repoRoot, "cli/dist/index.js");

function withTempProject(run: (cwd: string) => void): void {
  const cwd = mkdtempSync(join(tmpdir(), "forge-handoff-get-"));
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

function writeConfig(cwd: string, config: ForgeConfig): void {
  writeFileSync(
    join(cwd, ".forge", "config.json"),
    `${JSON.stringify(config, null, 2)}\n`,
    "utf8",
  );
}

function writeProgress(cwd: string, progress: ForgeProgress): void {
  writeFileSync(
    join(cwd, ".forge", "progress.json"),
    `${JSON.stringify(progress, null, 2)}\n`,
    "utf8",
  );
}

function executingProgress(): ForgeProgress {
  return {
    ...idleProgress(),
    feature: "ecommerce-checkout",
    status: "executing",
    spec_path: "docs/spec.md",
    plan_path: "docs/plan.md",
    total_tasks: 3,
    completed_tasks: 1,
    tasks: [
      {
        id: 1,
        title: "First task",
        status: "done",
        commit: "abc1234",
      },
      {
        id: 2,
        title: "Second task pending",
        status: "pending",
        tags: ["S001", "S002"],
      },
      { id: 3, title: "Third task pending", status: "pending" },
    ],
  };
}

describe("forge handoff:get", () => {
  test("echoes handoff.md content when present", () => {
    withTempProject((cwd) => {
      writeConfig(cwd, defaultConfig({}));
      writeProgress(cwd, executingProgress());

      // Pre-write a sentinel handoff.md so we can verify echo, not rebuild.
      const handoffFile = join(cwd, ".forge", "handoff.md");
      const sentinel =
        "# Forge Handoff\n<!-- pre-existing sentinel -->\nFeature:    sentinel-feature\n";
      writeFileSync(handoffFile, sentinel, "utf8");

      const result = runForge(cwd, ["handoff:get"]);
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");

      // stdout must be exactly the file content (no JSON wrapping). Hooks
      // pipe this directly to compaction seeds — must not contain any
      // CLI-added envelope.
      expect(result.stdout).toContain("pre-existing sentinel");
      expect(result.stdout).toContain("Feature:    sentinel-feature");
    });
  });

  test("rebuilds handoff.md from progress.json when file missing", () => {
    withTempProject((cwd) => {
      writeConfig(cwd, defaultConfig({}));
      writeProgress(cwd, executingProgress());

      const handoffFile = join(cwd, ".forge", "handoff.md");
      expect(existsSync(handoffFile)).toBe(false);

      const result = runForge(cwd, ["handoff:get"]);
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");

      // Output must reflect the rebuilt content from progress.json
      expect(result.stdout).toContain("# Forge Handoff");
      expect(result.stdout).toContain("ecommerce-checkout");
      expect(result.stdout).toMatch(/Last task:\s*1\s*—\s*First task/);
      expect(result.stdout).toMatch(/Next task:[\s\S]*id:\s*2/);
      expect(result.stdout).toContain("Resume command: /resume");

      // The file must now exist on disk so subsequent reads are echoes.
      expect(existsSync(handoffFile)).toBe(true);
      const onDisk = readFileSync(handoffFile, "utf8");
      expect(onDisk).toContain("ecommerce-checkout");
    });
  });

  test("rebuild handles idle progress gracefully", () => {
    withTempProject((cwd) => {
      writeConfig(cwd, defaultConfig({}));
      writeProgress(cwd, idleProgress());

      const result = runForge(cwd, ["handoff:get"]);
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("# Forge Handoff");
      expect(result.stdout).toMatch(/Status:\s+idle/);
      expect(result.stdout).toContain("Resume command: /resume");
    });
  });

  test("when neither handoff.md nor progress.json exists, exits non-zero with JSON error", () => {
    withTempProject((cwd) => {
      // No config, no progress, no handoff
      const result = runForge(cwd, ["handoff:get"]);
      expect(result.status).toBe(1);
      // Error path uses JSON envelope (matches existing CLI conventions)
      const parsed = JSON.parse(result.stdout);
      expect(parsed.ok).toBe(false);
      expect(parsed.error).toBeTruthy();
    });
  });
});
