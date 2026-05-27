import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";

import type { ForgeConfig } from "../src/state/config.js";
import { defaultConfig } from "../src/state/config.js";
import type { ForgeProgress } from "../src/state/progress.js";
import { idleProgress } from "../src/state/progress.js";

const repoRoot = resolve(import.meta.dirname, "../..");
const forgeBin = resolve(repoRoot, "cli/dist/index.js");

function withTempProject(run: (cwd: string) => void): void {
  const cwd = mkdtempSync(join(tmpdir(), "forge-cli-test-verify-"));

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

function runForgeWithEnv(cwd: string, args: string[], env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [forgeBin, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      ...env,
      CLAUDE_PLUGIN_ROOT: "",
      GEMINI_CLI: "",
    },
  });
}

function parseStdout(result: ReturnType<typeof runForge>): any {
  expect(result.stderr).toBe("");
  return JSON.parse(result.stdout);
}

function nodeCommand(script: string): string {
  return `${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}`;
}

function markerCommand(fileName: string, content: string, exitCode = 0): string {
  return nodeCommand(
    `require("node:fs").writeFileSync(${JSON.stringify(fileName)}, ${JSON.stringify(
      content,
    )}); process.exit(${exitCode});`,
  );
}

function npmMarkerCommand(fileName: string, content: string): string {
  return `node -e ${JSON.stringify(
    `require("node:fs").writeFileSync(${JSON.stringify(fileName)}, ${JSON.stringify(
      content,
    )});`,
  )}`;
}

function readProgress(cwd: string): ForgeProgress {
  return JSON.parse(
    readFileSync(join(cwd, ".forge", "progress.json"), "utf8"),
  ) as ForgeProgress;
}

function writeProgress(cwd: string, progress: ForgeProgress): void {
  writeFileSync(
    join(cwd, ".forge", "progress.json"),
    `${JSON.stringify(progress, null, 2)}\n`,
    "utf8",
  );
}

function writeConfig(cwd: string, config: ForgeConfig): void {
  writeFileSync(
    join(cwd, ".forge", "config.json"),
    `${JSON.stringify(config, null, 2)}\n`,
    "utf8",
  );
}

function configWithProfiles(
  profiles: ForgeConfig["test_profiles"],
): ForgeConfig {
  return defaultConfig({ test_profiles: profiles });
}

function executingProgress(
  overrides: Partial<ForgeProgress> = {},
): ForgeProgress {
  return {
    ...idleProgress(),
    feature: "runtime",
    status: "executing",
    created_at: "2026-05-26T00:00:00.000Z",
    updated_at: "2026-05-26T00:00:00.000Z",
    spec_path: "docs/spec.md",
    plan_path: "docs/plan.md",
    total_tasks: 1,
    completed_tasks: 0,
    tasks: [{ id: 1, title: "Implement verifier", status: "in_progress" }],
    ...overrides,
  };
}

function verificationReports(cwd: string): string[] {
  return readdirSync(join(cwd, ".forge")).filter((name) =>
    /^verification-.+\.json$/.test(name),
  );
}

function prependPathEnv(binDir: string): NodeJS.ProcessEnv {
  return {
    PATH: `${binDir}${process.platform === "win32" ? ";" : ":"}${process.env.PATH ?? ""}`,
    Path: `${binDir}${process.platform === "win32" ? ";" : ":"}${process.env.Path ?? ""}`,
  };
}

function writeFakeTool(cwd: string, name: string): string {
  const binDir = join(cwd, "fake-bin");
  mkdirSync(binDir, { recursive: true });

  if (process.platform === "win32") {
    writeFileSync(
      join(binDir, `${name}.cmd`),
      `@echo off\r\necho %* > "%CD%\\${name}-args.txt"\r\nexit /b 0\r\n`,
      "utf8",
    );
  } else {
    const toolPath = join(binDir, name);
    writeFileSync(
      toolPath,
      `#!/bin/sh\nprintf '%s\\n' "$*" > "$PWD/${name}-args.txt"\nexit 0\n`,
      "utf8",
    );
    spawnSync("chmod", ["755", toolPath]);
  }

  return binDir;
}

describe("test and verification commands", () => {
  test("forge test --profile default runs configured default profile command", () => {
    withTempProject((cwd) => {
      writeConfig(
        cwd,
        configWithProfiles({
          default: {
            framework: "vitest",
            command: markerCommand("ran-default.txt", "default"),
            working_dir: ".",
          },
        }),
      );

      const result = runForge(cwd, ["test", "--profile", "default"]);

      expect(result.status).toBe(0);
      expect(parseStdout(result)).toMatchObject({
        ok: true,
        passed: ["default"],
        failed: [],
        profiles: [{ name: "default", ok: true }],
      });
      expect(readFileSync(join(cwd, "ran-default.txt"), "utf8")).toBe(
        "default",
      );
    });
  });

  test("forge test --all-profiles runs every profile and fails if any profile fails", () => {
    withTempProject((cwd) => {
      writeConfig(
        cwd,
        configWithProfiles({
          unit: {
            framework: "vitest",
            command: markerCommand("ran-unit.txt", "unit"),
            working_dir: ".",
          },
          e2e: {
            framework: "playwright",
            command: markerCommand("ran-e2e.txt", "e2e", 7),
            working_dir: ".",
          },
        }),
      );

      const result = runForge(cwd, ["test", "--all-profiles"]);

      expect(result.status).toBe(1);
      expect(parseStdout(result)).toMatchObject({
        ok: false,
        passed: ["unit"],
        failed: ["e2e"],
        profiles: [
          { name: "unit", ok: true },
          { name: "e2e", ok: false, status: 7 },
        ],
      });
      expect(readFileSync(join(cwd, "ran-unit.txt"), "utf8")).toBe("unit");
      expect(readFileSync(join(cwd, "ran-e2e.txt"), "utf8")).toBe("e2e");
    });
  });

  test("forge test --coverage uses coverage_command when a profile provides one", () => {
    withTempProject((cwd) => {
      writeConfig(
        cwd,
        configWithProfiles({
          default: {
            framework: "vitest",
            command: markerCommand("ran-normal.txt", "normal"),
            coverage_command: markerCommand("ran-coverage.txt", "coverage"),
            working_dir: ".",
          },
        }),
      );

      const result = runForge(cwd, ["test", "--coverage"]);

      expect(result.status).toBe(0);
      expect(parseStdout(result)).toMatchObject({
        ok: true,
        passed: ["default"],
        failed: [],
        profiles: [{ name: "default", ok: true }],
      });
      expect(existsSync(join(cwd, "ran-normal.txt"))).toBe(false);
      expect(readFileSync(join(cwd, "ran-coverage.txt"), "utf8")).toBe(
        "coverage",
      );
    });
  });

  test("forge test does not modify progress", () => {
    withTempProject((cwd) => {
      writeConfig(
        cwd,
        configWithProfiles({
          default: {
            framework: "vitest",
            command: markerCommand("ran-default.txt", "default"),
            working_dir: ".",
          },
        }),
      );
      const originalProgress = executingProgress();
      writeProgress(cwd, originalProgress);

      const result = runForge(cwd, ["test"]);

      expect(result.status).toBe(0);
      expect(parseStdout(result)).toMatchObject({ ok: true });
      expect(readProgress(cwd)).toEqual(originalProgress);
    });
  });

  test("forge test fails for an unknown profile without running configured commands", () => {
    withTempProject((cwd) => {
      writeConfig(
        cwd,
        configWithProfiles({
          default: {
            framework: "vitest",
            command: markerCommand("ran-default.txt", "default"),
            working_dir: ".",
          },
        }),
      );

      const result = runForge(cwd, ["test", "--profile", "missing"]);

      expect(result.status).toBe(1);
      expect(parseStdout(result)).toEqual({
        ok: false,
        error: "unknown test profile: missing",
      });
      expect(existsSync(join(cwd, "ran-default.txt"))).toBe(false);
    });
  });

  test("forge verify --coverage runs tests and package build then records passed verification", () => {
    withTempProject((cwd) => {
      writeConfig(
        cwd,
        configWithProfiles({
          default: {
            framework: "vitest",
            command: markerCommand("ran-normal.txt", "normal"),
            coverage_command: markerCommand("ran-coverage.txt", "coverage"),
            working_dir: ".",
          },
        }),
      );
      writeProgress(cwd, executingProgress());
      writeFileSync(
        join(cwd, "package.json"),
        `${JSON.stringify({
          scripts: { build: npmMarkerCommand("ran-build.txt", "build") },
        })}\n`,
        "utf8",
      );

      const result = runForge(cwd, ["verify", "--coverage"]);
      const output = parseStdout(result);

      expect(result.status, JSON.stringify(output, null, 2)).toBe(0);
      expect(output).toMatchObject({
        ok: true,
        status: "passed",
        tests: { ok: true, passed: ["default"], failed: [] },
        build: { ok: true, command: "npm run build" },
      });
      expect(readFileSync(join(cwd, "ran-coverage.txt"), "utf8")).toBe(
        "coverage",
      );
      expect(readFileSync(join(cwd, "ran-build.txt"), "utf8")).toBe("build");

      const progress = readProgress(cwd);
      expect(progress.verification.status).toBe("passed");
      expect(new Date(progress.verification.last_run ?? "").toISOString()).toBe(
        progress.verification.last_run,
      );
      expect(progress.verification.report_path).toMatch(
        /^\.forge\/verification-.+\.json$/,
      );
      const reportPath = join(cwd, progress.verification.report_path!);
      const report = JSON.parse(readFileSync(reportPath, "utf8")) as any;
      expect(report).toMatchObject({
        ok: true,
        status: "passed",
        tests: { ok: true },
        build: { ok: true, command: "npm run build" },
      });
    });
  });

  test("forge verify writes failed verification when a test command fails", () => {
    withTempProject((cwd) => {
      writeConfig(
        cwd,
        configWithProfiles({
          default: {
            framework: "vitest",
            command: markerCommand("ran-default.txt", "default", 9),
            working_dir: ".",
          },
        }),
      );
      writeProgress(cwd, executingProgress());

      const result = runForge(cwd, ["verify"]);

      expect(result.status).toBe(1);
      expect(parseStdout(result)).toMatchObject({
        ok: false,
        status: "failed",
        tests: { ok: false, passed: [], failed: ["default"] },
        build: null,
      });

      const progress = readProgress(cwd);
      expect(progress.verification.status).toBe("failed");
      expect(progress.verification.report_path).toMatch(
        /^\.forge\/verification-.+\.json$/,
      );
      expect(verificationReports(cwd)).toHaveLength(1);
    });
  });

  test("forge verify detects go.mod and runs go build ./...", () => {
    withTempProject((cwd) => {
      writeConfig(
        cwd,
        configWithProfiles({
          default: {
            framework: "vitest",
            command: markerCommand("ran-default.txt", "default"),
            working_dir: ".",
          },
        }),
      );
      writeProgress(cwd, executingProgress());
      writeFileSync(join(cwd, "go.mod"), "module example.com/forge\n", "utf8");
      const binDir = writeFakeTool(cwd, "go");

      const result = runForgeWithEnv(cwd, ["verify"], prependPathEnv(binDir));
      const output = parseStdout(result);

      expect(result.status, JSON.stringify(output, null, 2)).toBe(0);
      expect(output).toMatchObject({
        ok: true,
        status: "passed",
        build: { ok: true, command: "go build ./..." },
      });
      expect(readFileSync(join(cwd, "go-args.txt"), "utf8").trim()).toBe(
        "build ./...",
      );
    });
  });

  test("forge verify detects Cargo.toml and runs cargo build", () => {
    withTempProject((cwd) => {
      writeConfig(
        cwd,
        configWithProfiles({
          default: {
            framework: "vitest",
            command: markerCommand("ran-default.txt", "default"),
            working_dir: ".",
          },
        }),
      );
      writeProgress(cwd, executingProgress());
      writeFileSync(
        join(cwd, "Cargo.toml"),
        "[package]\nname = \"forge-fixture\"\nversion = \"0.1.0\"\n",
        "utf8",
      );
      const binDir = writeFakeTool(cwd, "cargo");

      const result = runForgeWithEnv(cwd, ["verify"], prependPathEnv(binDir));
      const output = parseStdout(result);

      expect(result.status, JSON.stringify(output, null, 2)).toBe(0);
      expect(output).toMatchObject({
        ok: true,
        status: "passed",
        build: { ok: true, command: "cargo build" },
      });
      expect(readFileSync(join(cwd, "cargo-args.txt"), "utf8").trim()).toBe(
        "build",
      );
    });
  });

  test("forge verify runs all configured test_profiles, not only 'default'", () => {
    withTempProject((cwd) => {
      writeConfig(
        cwd,
        configWithProfiles({
          unit: {
            framework: "vitest",
            command: markerCommand("ran-unit.txt", "unit"),
            working_dir: ".",
          },
          integration: {
            framework: "vitest",
            command: markerCommand("ran-integration.txt", "integration"),
            working_dir: ".",
          },
        }),
      );
      writeProgress(cwd, executingProgress());

      const result = runForge(cwd, ["verify"]);
      const output = parseStdout(result);

      expect(result.status, JSON.stringify(output, null, 2)).toBe(0);
      expect(output.tests.passed).toEqual(
        expect.arrayContaining(["unit", "integration"]),
      );
      expect(readFileSync(join(cwd, "ran-unit.txt"), "utf8")).toBe("unit");
      expect(readFileSync(join(cwd, "ran-integration.txt"), "utf8")).toBe(
        "integration",
      );
    });
  });

  test("forge verify fails if any non-default profile fails", () => {
    withTempProject((cwd) => {
      writeConfig(
        cwd,
        configWithProfiles({
          unit: {
            framework: "vitest",
            command: markerCommand("ran-unit.txt", "unit"),
            working_dir: ".",
          },
          integration: {
            framework: "vitest",
            command: markerCommand("ran-integration.txt", "integration", 5),
            working_dir: ".",
          },
        }),
      );
      writeProgress(cwd, executingProgress());

      const result = runForge(cwd, ["verify"]);

      expect(result.status).toBe(1);
      expect(parseStdout(result)).toMatchObject({
        ok: false,
        status: "failed",
        tests: { ok: false },
      });
    });
  });
});
