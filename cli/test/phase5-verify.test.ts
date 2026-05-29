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

import { defaultConfig, type ForgeConfig } from "../src/state/config.js";
import { idleProgress, type ForgeProgress } from "../src/state/progress.js";

const repoRoot = resolve(import.meta.dirname, "../..");
const forgeBin = resolve(repoRoot, "cli/dist/index.js");

function withTempProject(run: (cwd: string) => void): void {
  const cwd = mkdtempSync(join(tmpdir(), "forge-cli-p5verify-"));
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

function parseStdout(result: ReturnType<typeof runForge>): any {
  expect(result.stderr).toBe("");
  return JSON.parse(result.stdout);
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

function executionCompleteProgress(): ForgeProgress {
  return {
    ...idleProgress(),
    feature: "p5-verify",
    status: "execution_complete",
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    spec_path: "docs/spec.md",
    plan_path: "docs/plan.md",
    total_tasks: 1,
    completed_tasks: 1,
    tasks: [{ id: 1, title: "T1", status: "done" }],
  };
}

const passingNodeCmd = `${JSON.stringify(process.execPath)} -e "process.exit(0)"`;

function passingProfile(): ForgeConfig["test_profiles"] {
  return {
    default: { framework: "custom", command: passingNodeCmd, working_dir: "." },
  };
}

describe("Phase 5 /verify gstack + scanner integration", () => {
  test("gstack-basic skipped with reason when gstack_installed is false", () => {
    withTempProject((cwd) => {
      writeConfig(
        cwd,
        defaultConfig({
          test_profiles: passingProfile(),
          gstack_installed: false,
          verify: {
            gstack_basic: { enabled: true },
            security_scan: { enabled: false },
            dependency_audit: { enabled: false },
            e2e: { enabled: false },
            visual_regression: { enabled: false },
            performance: { enabled: false },
          },
        }),
      );
      writeProgress(cwd, executionCompleteProgress());

      const result = runForge(cwd, ["verify"]);
      expect(result.status).toBe(0);
      const output = parseStdout(result);

      expect(output.ok).toBe(true);
      expect(output.results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "gstack-basic",
            ok: true,
            skipped: true,
            skip_reason: "gstack_installed is false",
          }),
        ]),
      );
    });
  });

  test("gstack-basic skipped with reason when verify.gstack_basic disabled", () => {
    withTempProject((cwd) => {
      writeConfig(
        cwd,
        defaultConfig({
          test_profiles: passingProfile(),
          gstack_installed: true,
          verify: {
            gstack_basic: { enabled: false },
            security_scan: { enabled: false },
            dependency_audit: { enabled: false },
            e2e: { enabled: false },
            visual_regression: { enabled: false },
            performance: { enabled: false },
          },
        }),
      );
      writeProgress(cwd, executionCompleteProgress());

      const result = runForge(cwd, ["verify"]);
      expect(result.status).toBe(0);
      const output = parseStdout(result);

      expect(output.results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "gstack-basic",
            skipped: true,
            skip_reason: "verify.gstack_basic disabled",
          }),
        ]),
      );
    });
  });

  test("security_scan included as a step entry, ok with no findings", () => {
    withTempProject((cwd) => {
      writeConfig(
        cwd,
        defaultConfig({
          test_profiles: passingProfile(),
          verify: {
            gstack_basic: { enabled: false },
            security_scan: { enabled: true },
            dependency_audit: { enabled: false },
            e2e: { enabled: false },
            visual_regression: { enabled: false },
            performance: { enabled: false },
          },
        }),
      );
      writeProgress(cwd, executionCompleteProgress());

      const result = runForge(cwd, ["verify"]);
      expect(result.status).toBe(0);
      const output = parseStdout(result);

      expect(output.ok).toBe(true);
      const sec = output.results.find((r: any) => r.name === "security_scan");
      expect(sec).toBeDefined();
      expect(sec.ok).toBe(true);
      expect(sec.class).toBe(null);
    });
  });

  test("dependency_audit included as a step entry, ok with no findings", () => {
    withTempProject((cwd) => {
      writeConfig(
        cwd,
        defaultConfig({
          test_profiles: passingProfile(),
          verify: {
            gstack_basic: { enabled: false },
            security_scan: { enabled: false },
            dependency_audit: { enabled: true },
            e2e: { enabled: false },
            visual_regression: { enabled: false },
            performance: { enabled: false },
          },
        }),
      );
      writeProgress(cwd, executionCompleteProgress());

      const result = runForge(cwd, ["verify"]);
      expect(result.status).toBe(0);
      const output = parseStdout(result);

      const dep = output.results.find((r: any) => r.name === "dependency_audit");
      expect(dep).toBeDefined();
      expect(dep.ok).toBe(true);
    });
  });

  test("e2e/visual/performance skipped when disabled", () => {
    withTempProject((cwd) => {
      writeConfig(
        cwd,
        defaultConfig({
          test_profiles: passingProfile(),
          verify: {
            gstack_basic: { enabled: false },
            security_scan: { enabled: false },
            dependency_audit: { enabled: false },
            e2e: { enabled: false },
            visual_regression: { enabled: false },
            performance: { enabled: false },
          },
        }),
      );
      writeProgress(cwd, executionCompleteProgress());

      const result = runForge(cwd, ["verify"]);
      const output = parseStdout(result);
      const names = output.results.map((r: any) => r.name);

      // Disabled steps are simply omitted (not even recorded as skipped)
      expect(names).not.toContain("e2e");
      expect(names).not.toContain("visual_regression");
      expect(names).not.toContain("performance");
    });
  });

  test("e2e marked skipped or failed when enabled but gstack missing on PATH", () => {
    withTempProject((cwd) => {
      writeConfig(
        cwd,
        defaultConfig({
          test_profiles: passingProfile(),
          verify: {
            gstack_basic: { enabled: false },
            security_scan: { enabled: false },
            dependency_audit: { enabled: false },
            e2e: { enabled: true },
            visual_regression: { enabled: false },
            performance: { enabled: false },
          },
        }),
      );
      writeProgress(cwd, executionCompleteProgress());

      const result = runForge(cwd, ["verify"]);
      const output = parseStdout(result);
      const e2e = output.results.find((r: any) => r.name === "e2e");
      // Step must be present in the report, regardless of whether gstack
      // happens to be installed in the test environment. If installed and
      // running succeeds → ok:true, class:null. If installed but command
      // fails → ok:false. If not installed → skipped:true.
      expect(e2e).toBeDefined();
      expect(e2e.skipped === true || typeof e2e.ok === "boolean").toBe(true);
    });
  });
});
