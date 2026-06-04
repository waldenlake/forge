import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";

import { idleProgress, type ForgeProgress } from "../src/state/progress.js";

const repoRoot = resolve(import.meta.dirname, "../..");
const forgeBin = resolve(repoRoot, "cli/dist/index.js");

function withTempGitRepo(run: (cwd: string) => void): void {
  const cwd = mkdtempSync(join(tmpdir(), "forge-audit-handoff-"));
  try {
    mkdirSync(join(cwd, ".forge"), { recursive: true });
    writeFileSync(join(cwd, ".gitconfig"), "", "utf8");
    spawnSync("git", ["init"], { cwd, env: gitEnv(cwd) });
    spawnSync("git", ["config", "user.email", "forge@example.test"], {
      cwd,
      env: gitEnv(cwd),
    });
    spawnSync("git", ["config", "user.name", "Forge Test"], {
      cwd,
      env: gitEnv(cwd),
    });
    run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

function gitEnv(cwd: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: join(cwd, ".gitconfig"),
  };
}

function runForge(cwd: string, args: string[]) {
  return spawnSync(process.execPath, [forgeBin, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...gitEnv(cwd), CLAUDE_PLUGIN_ROOT: "", GEMINI_CLI: "" },
  });
}

function parseStdout(result: ReturnType<typeof runForge>): any {
  expect(result.stderr).toBe("");
  return JSON.parse(result.stdout);
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
    feature: "drift-test",
    status: "executing",
    spec_path: "docs/spec.md",
    plan_path: "docs/plan.md",
    total_tasks: 3,
    completed_tasks: 1,
    tasks: [
      { id: 1, title: "First", status: "done" },
      { id: 2, title: "Pending second", status: "pending" },
      { id: 3, title: "Pending third", status: "pending" },
    ],
  };
}

describe("forge audit handoff/progress drift", () => {
  test("reports no drift when handoff.md matches progress.json", () => {
    withTempGitRepo((cwd) => {
      writeProgress(cwd, executingProgress());

      // Generate a faithful handoff.md from progress.json
      const get = runForge(cwd, ["handoff:get"]);
      expect(get.status).toBe(0);

      const audit = runForge(cwd, ["audit"]);
      expect(audit.status).toBe(0);
      const out = parseStdout(audit);

      const drifts = out.inconsistencies.filter(
        (i: any) => i.type === "handoff_drift",
      );
      expect(drifts).toEqual([]);
    });
  });

  test("reports no drift when handoff.md is missing (handoff is optional)", () => {
    withTempGitRepo((cwd) => {
      writeProgress(cwd, executingProgress());
      // Do NOT create handoff.md
      const audit = runForge(cwd, ["audit"]);
      expect(audit.status).toBe(0);
      const out = parseStdout(audit);

      const drifts = out.inconsistencies.filter(
        (i: any) => i.type === "handoff_drift",
      );
      expect(drifts).toEqual([]);
    });
  });

  test("reports handoff_drift when handoff.md feature differs from progress.json", () => {
    withTempGitRepo((cwd) => {
      writeProgress(cwd, executingProgress());

      // Write a stale handoff.md with the wrong feature name
      writeFileSync(
        join(cwd, ".forge", "handoff.md"),
        [
          "# Forge Handoff",
          "<!-- stale -->",
          "",
          "Feature:    OLD-FEATURE",
          "Status:     executing",
          "Tasks:      1/3 done (deferred: 0)",
          "Last task:  1 — First",
          "Last commit: —",
          "",
          "Next task:",
          "  id:    2",
          "  title: Pending second",
          "  scenarios: —",
          "  spec:  docs/spec.md",
          "  plan:  docs/plan.md",
          "",
          "generated_at: 2026-06-04T00:00:00.000Z",
          "",
          "Resume command: /resume",
          "",
        ].join("\n"),
        "utf8",
      );

      const audit = runForge(cwd, ["audit"]);
      expect(audit.status).toBe(0);
      const out = parseStdout(audit);

      const drifts = out.inconsistencies.filter(
        (i: any) => i.type === "handoff_drift",
      );
      expect(drifts.length).toBeGreaterThan(0);
      // The drift must point at the recovery command for users
      expect(drifts[0]).toHaveProperty("recovery");
      expect(drifts[0].recovery).toMatch(/handoff/);

      // Drift entry must say which field disagrees
      const fields = drifts.map((d: any) => d.field);
      expect(fields).toContain("feature");
    });
  });

  test("reports handoff_drift when handoff.md tasks counter differs", () => {
    withTempGitRepo((cwd) => {
      writeProgress(cwd, executingProgress());

      // Wrong tasks ratio in handoff
      writeFileSync(
        join(cwd, ".forge", "handoff.md"),
        [
          "# Forge Handoff",
          "",
          "Feature:    drift-test",
          "Status:     executing",
          "Tasks:      99/3 done (deferred: 0)",
          "Last task:  1 — First",
          "Last commit: —",
          "",
          "Next task:",
          "  id:    2",
          "  title: Pending second",
          "  scenarios: —",
          "  spec:  docs/spec.md",
          "  plan:  docs/plan.md",
          "",
          "generated_at: 2026-06-04T00:00:00.000Z",
          "",
          "Resume command: /resume",
          "",
        ].join("\n"),
        "utf8",
      );

      const audit = runForge(cwd, ["audit"]);
      const out = parseStdout(audit);
      const drifts = out.inconsistencies.filter(
        (i: any) => i.type === "handoff_drift",
      );
      expect(drifts.length).toBeGreaterThan(0);
      const fields = drifts.map((d: any) => d.field);
      expect(fields).toContain("tasks");
    });
  });

  test("reports handoff_drift when handoff.md status differs", () => {
    withTempGitRepo((cwd) => {
      writeProgress(cwd, executingProgress());

      writeFileSync(
        join(cwd, ".forge", "handoff.md"),
        [
          "# Forge Handoff",
          "",
          "Feature:    drift-test",
          "Status:     planning",
          "Tasks:      1/3 done (deferred: 0)",
          "Last task:  1 — First",
          "Last commit: —",
          "",
          "Next task:",
          "  id:    2",
          "  title: Pending second",
          "  scenarios: —",
          "  spec:  docs/spec.md",
          "  plan:  docs/plan.md",
          "",
          "generated_at: 2026-06-04T00:00:00.000Z",
          "",
          "Resume command: /resume",
          "",
        ].join("\n"),
        "utf8",
      );

      const audit = runForge(cwd, ["audit"]);
      const out = parseStdout(audit);
      const drifts = out.inconsistencies.filter(
        (i: any) => i.type === "handoff_drift",
      );
      const fields = drifts.map((d: any) => d.field);
      expect(fields).toContain("status");
    });
  });
});
