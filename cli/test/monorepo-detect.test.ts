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

import { detectMonorepoProfiles } from "../src/lib/detect.js";

const repoRoot = resolve(import.meta.dirname, "../..");
const forgeBin = resolve(repoRoot, "cli/dist/index.js");

function withTempDir(run: (cwd: string) => void): void {
  const cwd = mkdtempSync(join(tmpdir(), "forge-monorepo-"));
  try {
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

describe("detectMonorepoProfiles", () => {
  test("detects pnpm workspace with vitest and jest packages", () => {
    withTempDir((cwd) => {
      writeFileSync(
        join(cwd, "pnpm-workspace.yaml"),
        'packages:\n  - "packages/*"\n',
        "utf8",
      );

      mkdirSync(join(cwd, "packages", "frontend"), { recursive: true });
      writeFileSync(
        join(cwd, "packages", "frontend", "package.json"),
        JSON.stringify({
          name: "frontend",
          devDependencies: { vitest: "^1.0.0" },
        }),
        "utf8",
      );

      mkdirSync(join(cwd, "packages", "backend"), { recursive: true });
      writeFileSync(
        join(cwd, "packages", "backend", "package.json"),
        JSON.stringify({
          name: "backend",
          devDependencies: { jest: "^29.0.0" },
        }),
        "utf8",
      );

      const result = detectMonorepoProfiles(cwd);

      expect(result.monorepo).toBe(true);
      expect(result.monorepo_type).toBe("pnpm");
      expect(result.detected_profiles).toHaveLength(2);

      const frontend = result.detected_profiles.find(
        (p) => p.name === "frontend",
      );
      expect(frontend).toMatchObject({
        name: "frontend",
        framework: "vitest",
        working_dir: "packages/frontend",
        command: "npx vitest run",
        coverage_command: "npx vitest run --coverage",
      });

      const backend = result.detected_profiles.find(
        (p) => p.name === "backend",
      );
      expect(backend).toMatchObject({
        name: "backend",
        framework: "jest",
        working_dir: "packages/backend",
        command: "npx jest",
      });
    });
  });

  test("detects npm/yarn workspaces from package.json workspaces field", () => {
    withTempDir((cwd) => {
      writeFileSync(
        join(cwd, "package.json"),
        JSON.stringify({
          name: "my-monorepo",
          workspaces: ["apps/*"],
        }),
        "utf8",
      );

      mkdirSync(join(cwd, "apps", "web"), { recursive: true });
      writeFileSync(
        join(cwd, "apps", "web", "package.json"),
        JSON.stringify({ name: "web", scripts: { test: "npm test" } }),
        "utf8",
      );

      const result = detectMonorepoProfiles(cwd);

      expect(result.monorepo).toBe(true);
      expect(result.monorepo_type).toBe("yarn");
      expect(result.detected_profiles.length).toBeGreaterThanOrEqual(1);
    });
  });

  test("detects turbo.json as turbo monorepo type", () => {
    withTempDir((cwd) => {
      writeFileSync(join(cwd, "turbo.json"), JSON.stringify({}), "utf8");

      const result = detectMonorepoProfiles(cwd);

      expect(result.monorepo).toBe(true);
      expect(result.monorepo_type).toBe("turbo");
    });
  });

  test("detects nx.json as nx monorepo type", () => {
    withTempDir((cwd) => {
      writeFileSync(join(cwd, "nx.json"), JSON.stringify({}), "utf8");

      const result = detectMonorepoProfiles(cwd);

      expect(result.monorepo).toBe(true);
      expect(result.monorepo_type).toBe("nx");
    });
  });

  test("returns monorepo=false for plain package.json without workspaces", () => {
    withTempDir((cwd) => {
      writeFileSync(
        join(cwd, "package.json"),
        JSON.stringify({
          name: "my-app",
          devDependencies: { vitest: "^1.0.0" },
        }),
        "utf8",
      );

      const result = detectMonorepoProfiles(cwd);

      expect(result.monorepo).toBe(false);
      expect(result.monorepo_type).toBeNull();
      expect(result.detected_profiles).toEqual([]);
    });
  });

  test("returns monorepo=false for empty directory", () => {
    withTempDir((cwd) => {
      const result = detectMonorepoProfiles(cwd);

      expect(result.monorepo).toBe(false);
      expect(result.monorepo_type).toBeNull();
      expect(result.detected_profiles).toEqual([]);
    });
  });
});

describe("init --monorepo CLI flag", () => {
  test("init --auto-detect --monorepo outputs ok=true and monorepo=true for pnpm workspace", () => {
    withTempDir((cwd) => {
      writeFileSync(
        join(cwd, "pnpm-workspace.yaml"),
        'packages:\n  - "packages/*"\n',
        "utf8",
      );

      mkdirSync(join(cwd, "packages", "app"), { recursive: true });
      writeFileSync(
        join(cwd, "packages", "app", "package.json"),
        JSON.stringify({ name: "app", devDependencies: { vitest: "^1.0.0" } }),
        "utf8",
      );

      const result = runForge(cwd, ["init", "--auto-detect", "--monorepo"]);

      expect(result.status).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.ok).toBe(true);
      expect(output.monorepo).toBe(true);
    });
  });
});
