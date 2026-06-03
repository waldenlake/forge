import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

const CLI_BIN = join(import.meta.dirname, "../dist/index.js");

function runForge(cwd: string, args: string[]) {
  const result = spawnSync(process.execPath, [CLI_BIN, ...args], {
    cwd,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  return {
    output: JSON.parse(result.stdout.trim()) as Record<string, unknown>,
    exitCode: result.status ?? 0,
  };
}

function setupProject(tmpDir: string) {
  spawnSync("git", ["init", "-q"], { cwd: tmpDir });
  spawnSync("git", ["config", "user.email", "t@t.com"], { cwd: tmpDir });
  spawnSync("git", ["config", "user.name", "T"], { cwd: tmpDir });
  const init = spawnSync(process.execPath, [CLI_BIN, "init", "--auto-detect"], {
    cwd: tmpDir,
    encoding: "utf8",
  });
  if (init.status !== 0) {
    throw new Error(`init failed: ${init.stderr}`);
  }
}

describe("forge verify --plan", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "forge-verify-plan-"));
    setupProject(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns ok:true with plan structure", () => {
    const { output, exitCode } = runForge(tmpDir, ["verify", "--plan"]);
    expect(exitCode).toBe(0);
    expect(output.ok).toBe(true);
    expect(output.plan).toBeDefined();
    const plan = output.plan as Record<string, unknown>;
    expect(Array.isArray(plan.will_run)).toBe(true);
    expect(Array.isArray(plan.will_skip)).toBe(true);
    expect(plan.thresholds).toBeDefined();
  });

  it("includes tests in will_run by default", () => {
    const { output } = runForge(tmpDir, ["verify", "--plan"]);
    const plan = output.plan as { will_run: Array<{ name: string }> };
    expect(plan.will_run.some((e) => e.name === "tests")).toBe(true);
  });

  it("opt-in steps appear in will_skip with reason by default", () => {
    const { output } = runForge(tmpDir, ["verify", "--plan"]);
    const plan = output.plan as { will_skip: Array<{ name: string; reason?: string }> };
    const e2e = plan.will_skip.find((e) => e.name === "e2e");
    const visual = plan.will_skip.find((e) => e.name === "visual_regression");
    const perf = plan.will_skip.find((e) => e.name === "performance");
    expect(e2e?.reason).toContain("disabled");
    expect(visual?.reason).toContain("disabled");
    expect(perf?.reason).toContain("disabled");
  });

  it("--plan does NOT execute or change state", () => {
    const before = readFileSync(join(tmpDir, ".forge", "config.json"), "utf8");
    runForge(tmpDir, ["verify", "--plan"]);
    runForge(tmpDir, ["verify", "--plan"]);
    const after = readFileSync(join(tmpDir, ".forge", "config.json"), "utf8");
    expect(after).toBe(before);
  });

  it("--plan does NOT require execution_complete state", () => {
    // Project is freshly initialized (status=idle); --plan should still work.
    const { output, exitCode } = runForge(tmpDir, ["verify", "--plan"]);
    expect(exitCode).toBe(0);
    expect(output.ok).toBe(true);
  });

  it("plan reflects config changes from config:verify", () => {
    runForge(tmpDir, ["config:verify", "--enable", "e2e"]);
    const { output } = runForge(tmpDir, ["verify", "--plan"]);
    const plan = output.plan as {
      will_run: Array<{ name: string }>;
      will_skip: Array<{ name: string; reason?: string }>;
    };
    // e2e should be in will_skip with "gstack not on PATH" since gstack isn't installed
    // OR in will_run if gstack is present. Either way it's no longer "disabled".
    const e2eSkip = plan.will_skip.find((e) => e.name === "e2e");
    if (e2eSkip) {
      expect(e2eSkip.reason).not.toContain("disabled (opt-in)");
    } else {
      expect(plan.will_run.some((e) => e.name === "e2e")).toBe(true);
    }
  });
});

describe("forge config:verify", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "forge-config-verify-"));
    setupProject(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("--show returns config without modifying it", () => {
    const before = readFileSync(join(tmpDir, ".forge", "config.json"), "utf8");
    const { output, exitCode } = runForge(tmpDir, ["config:verify", "--show"]);
    expect(exitCode).toBe(0);
    expect(output.ok).toBe(true);
    expect((output.config as Record<string, unknown>).verify).toBeDefined();
    const after = readFileSync(join(tmpDir, ".forge", "config.json"), "utf8");
    expect(after).toBe(before);
  });

  it("--enable flips verify keys to true", () => {
    const { output } = runForge(tmpDir, ["config:verify", "--enable", "e2e,visual_regression"]);
    const cfg = output.config as { verify: Record<string, boolean> };
    expect(cfg.verify.e2e).toBe(true);
    expect(cfg.verify.visual_regression).toBe(true);
    expect(cfg.verify.performance).toBe(false);
  });

  it("--disable flips verify keys to false", () => {
    runForge(tmpDir, ["config:verify", "--enable", "e2e"]);
    const { output } = runForge(tmpDir, ["config:verify", "--disable", "e2e,security_scan"]);
    const cfg = output.config as { verify: Record<string, boolean> };
    expect(cfg.verify.e2e).toBe(false);
    expect(cfg.verify.security_scan).toBe(false);
  });

  it("rejects unknown verify keys", () => {
    const { output, exitCode } = runForge(tmpDir, ["config:verify", "--enable", "bogus"]);
    expect(exitCode).toBe(1);
    expect(output.ok).toBe(false);
    expect(output.error).toContain("unknown verify key");
  });

  it("--coverage-unit sets the threshold", () => {
    const { output } = runForge(tmpDir, ["config:verify", "--coverage-unit", "75"]);
    const cfg = output.config as { coverage: { unit: number } };
    expect(cfg.coverage.unit).toBe(75);
  });

  it("rejects coverage values outside 0-100", () => {
    const { output, exitCode } = runForge(tmpDir, ["config:verify", "--coverage-unit", "150"]);
    expect(exitCode).toBe(1);
    expect(output.ok).toBe(false);
    expect(output.error).toContain("invalid coverage-unit");
  });

  it("--security-severity normalises case and validates value", () => {
    const { output } = runForge(tmpDir, ["config:verify", "--security-severity", "medium"]);
    const cfg = output.config as { security: { severity_threshold: string } };
    expect(cfg.security.severity_threshold).toBe("MEDIUM");

    const bad = runForge(tmpDir, ["config:verify", "--security-severity", "ULTRA"]);
    expect(bad.exitCode).toBe(1);
    expect(bad.output.ok).toBe(false);
  });

  it("--license-allowlist replaces the list", () => {
    const { output } = runForge(tmpDir, [
      "config:verify",
      "--license-allowlist",
      "MIT,Apache-2.0,BSD-3-Clause",
    ]);
    const cfg = output.config as { dependency: { license_allowlist: string[] } };
    expect(cfg.dependency.license_allowlist).toEqual([
      "MIT",
      "Apache-2.0",
      "BSD-3-Clause",
    ]);
  });

  it("rejects empty license-allowlist", () => {
    const { output, exitCode } = runForge(tmpDir, [
      "config:verify",
      "--license-allowlist",
      ",",
    ]);
    expect(exitCode).toBe(1);
    expect(output.ok).toBe(false);
  });

  it("changes are persisted across invocations", () => {
    runForge(tmpDir, ["config:verify", "--enable", "e2e"]);
    runForge(tmpDir, ["config:verify", "--coverage-unit", "90"]);
    const { output } = runForge(tmpDir, ["config:verify", "--show"]);
    const cfg = output.config as {
      verify: Record<string, boolean>;
      coverage: { unit: number };
    };
    expect(cfg.verify.e2e).toBe(true);
    expect(cfg.coverage.unit).toBe(90);
  });

  it("multiple flags applied in one call", () => {
    const { output } = runForge(tmpDir, [
      "config:verify",
      "--enable", "e2e",
      "--coverage-unit", "70",
      "--security-severity", "MEDIUM",
    ]);
    const cfg = output.config as {
      verify: Record<string, boolean>;
      coverage: { unit: number };
      security: { severity_threshold: string };
    };
    expect(cfg.verify.e2e).toBe(true);
    expect(cfg.coverage.unit).toBe(70);
    expect(cfg.security.severity_threshold).toBe("MEDIUM");
  });
});
