import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";

import { defaultConfig } from "../src/state/config.js";

const repoRoot = resolve(import.meta.dirname, "../..");
const forgeBin = resolve(repoRoot, "cli/dist/index.js");
const fixturesDir = resolve(import.meta.dirname, "fixtures");

function withTempProject(run: (cwd: string) => void): void {
  const cwd = mkdtempSync(join(tmpdir(), "forge-guard-scanners-"));

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
    env: {
      ...process.env,
      CLAUDE_PLUGIN_ROOT: "",
      GEMINI_CLI: "",
    },
  });
}

function writeConfig(
  cwd: string,
  overrides: Record<string, unknown> = {},
): void {
  const config = {
    ...defaultConfig(),
    guards: {
      ...defaultConfig().guards,
      "security-scan": {
        enabled: true,
        trigger: "keyword",
        keywords: ["auth"],
        severity_threshold: "HIGH",
        actions: ["security-audit"],
      },
      "dependency-audit": {
        enabled: true,
        trigger: "new-dependency",
        actions: ["dependency-check"],
        license_allowlist: ["MIT", "Apache-2.0", "ISC"],
      },
      "coverage-gate": {
        enabled: true,
        trigger: "phase-complete",
        actions: ["coverage-check"],
      },
    },
    test_coverage: { unit: 80, integration: 60 },
    ...overrides,
  };
  writeFileSync(
    join(cwd, ".forge", "config.json"),
    `${JSON.stringify(config, null, 2)}\n`,
    "utf8",
  );
}

describe("guard:security-scan", () => {
  test("returns ok=false with findings for a file containing a hardcoded password", () => {
    withTempProject((cwd) => {
      writeConfig(cwd);
      writeFileSync(
        join(cwd, "secrets.ts"),
        'const password = "hunter2";\n',
        "utf8",
      );

      const result = runForge(cwd, [
        "guard:security-scan",
        "--files",
        "secrets.ts",
      ]);

      expect(result.status).toBe(1);
      const output = JSON.parse(result.stdout);
      expect(output.ok).toBe(false);
      expect(Array.isArray(output.findings)).toBe(true);
      expect(output.findings.length).toBeGreaterThan(0);
    });
  });

  test("returns ok=true for a clean file", () => {
    withTempProject((cwd) => {
      writeConfig(cwd);
      writeFileSync(
        join(cwd, "clean.ts"),
        'export function greet(name: string): string { return `Hello, ${name}`; }\n',
        "utf8",
      );

      const result = runForge(cwd, [
        "guard:security-scan",
        "--files",
        "clean.ts",
      ]);

      expect(result.status).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.ok).toBe(true);
    });
  });
});

describe("guard:dependency-audit", () => {
  test("returns ok=true and license_ok=true for lodash (MIT) when MIT is in allowlist", () => {
    withTempProject((cwd) => {
      writeConfig(cwd);

      // Create a minimal node_modules/lodash/package.json with MIT license
      mkdirSync(join(cwd, "node_modules", "lodash"), { recursive: true });
      writeFileSync(
        join(cwd, "node_modules", "lodash", "package.json"),
        JSON.stringify({ name: "lodash", version: "4.17.21", license: "MIT" }),
        "utf8",
      );
      writeFileSync(
        join(cwd, "package.json"),
        JSON.stringify({ name: "test-project", dependencies: { lodash: "^4.17.21" } }),
        "utf8",
      );

      const result = runForge(cwd, [
        "guard:dependency-audit",
        "--new-packages",
        "lodash",
      ]);

      expect(result.status).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.ok).toBe(true);
      expect(Array.isArray(output.packages)).toBe(true);
      expect(output.packages[0].license_ok).toBe(true);
    });
  });
});

describe("guard:coverage-check", () => {
  test("returns ok=true when istanbul report meets unit target of 80%", () => {
    withTempProject((cwd) => {
      writeConfig(cwd);

      // Copy the istanbul-summary fixture into coverage/coverage-summary.json
      mkdirSync(join(cwd, "coverage"), { recursive: true });
      cpSync(
        join(fixturesDir, "istanbul-summary.json"),
        join(cwd, "coverage", "coverage-summary.json"),
      );

      const result = runForge(cwd, ["guard:coverage-check"]);

      expect(result.status).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.ok).toBe(true);
      expect(output.coverage?.unit?.ok).toBe(true);
    });
  });
});

describe("guard:run", () => {
  test("security-scan type returns ok=false when changed files contain a JWT secret", () => {
    withTempProject((cwd) => {
      writeConfig(cwd);

      // Create a file with a JWT secret in the cwd — guard:run uses git diff to detect files,
      // but falls back to empty array when not in a git repo. We need a real git repo here.
      // Initialize a bare git repo so HEAD~1 resolves.
      spawnSync("git", ["init"], { cwd, encoding: "utf8" });
      spawnSync("git", ["config", "user.email", "test@forge.test"], { cwd, encoding: "utf8" });
      spawnSync("git", ["config", "user.name", "Forge Test"], { cwd, encoding: "utf8" });

      // First commit: baseline
      writeFileSync(join(cwd, "index.ts"), "export {};\n", "utf8");
      spawnSync("git", ["add", "."], { cwd, encoding: "utf8" });
      spawnSync("git", ["commit", "-m", "initial"], { cwd, encoding: "utf8" });

      // Second commit: add a file with a JWT secret
      writeFileSync(
        join(cwd, "auth.ts"),
        'const jwt_secret = "super-secret-value-1234";\n',
        "utf8",
      );
      spawnSync("git", ["add", "auth.ts"], { cwd, encoding: "utf8" });
      spawnSync("git", ["commit", "-m", "add auth"], { cwd, encoding: "utf8" });

      const result = runForge(cwd, [
        "guard:run",
        "--type",
        "security-scan",
        "--task-id",
        "2",
      ]);

      // ok=false because JWT secret found; findings should be defined
      const output = JSON.parse(result.stdout);
      expect(result.status).toBe(1);
      expect(output.ok).toBe(false);
      expect(Array.isArray(output.findings)).toBe(true);
    });
  });
});
