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

const repoRoot = resolve(import.meta.dirname, "../..");
const forgeBin = resolve(repoRoot, "cli/dist/index.js");

function withTempProject(run: (cwd: string) => void): void {
  const cwd = mkdtempSync(join(tmpdir(), "forge-ctx-config-"));
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

describe("config context_management schema", () => {
  test("config with context_management passes schema validation", () => {
    withTempProject((cwd) => {
      const config = defaultConfig({
        context_management: {
          enabled: true,
          threshold_pct: 0.50,
          strategy: "in-place-restart",
          fallback: "prompt-compact",
          min_tasks_between_handoff: 1,
        },
      });
      writeConfig(cwd, config);

      // `forge status` triggers readConfig which validates against schema
      const result = runForge(cwd, ["status"]);
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
    });
  });

  test("config without context_management still passes (field is optional)", () => {
    withTempProject((cwd) => {
      const config = defaultConfig({});
      writeConfig(cwd, config);

      const result = runForge(cwd, ["status"]);
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
    });
  });

  test("partial context_management (only enabled) passes schema", () => {
    withTempProject((cwd) => {
      const config = defaultConfig({
        context_management: {
          enabled: false,
        },
      });
      writeConfig(cwd, config);

      const result = runForge(cwd, ["status"]);
      expect(result.status).toBe(0);
    });
  });

  test("invalid strategy value fails schema validation", () => {
    withTempProject((cwd) => {
      const config = {
        ...defaultConfig({}),
        context_management: {
          enabled: true,
          strategy: "invalid-strategy",
        },
      };
      writeConfig(cwd, config as any);

      const result = runForge(cwd, ["status"]);
      expect(result.status).toBe(1);
    });
  });

  test("threshold_pct outside 0-1 fails schema validation", () => {
    withTempProject((cwd) => {
      const config = {
        ...defaultConfig({}),
        context_management: {
          enabled: true,
          threshold_pct: 1.5,
        },
      };
      writeConfig(cwd, config as any);

      const result = runForge(cwd, ["status"]);
      expect(result.status).toBe(1);
    });
  });

  test("defaultConfig includes context_management when provided", () => {
    const config = defaultConfig({
      context_management: {
        enabled: true,
        threshold_pct: 0.60,
        strategy: "prompt-compact",
        fallback: "off",
        min_tasks_between_handoff: 2,
      },
    });

    expect(config.context_management).toEqual({
      enabled: true,
      threshold_pct: 0.60,
      strategy: "prompt-compact",
      fallback: "off",
      min_tasks_between_handoff: 2,
    });
  });

  test("defaultConfig omits context_management when not provided", () => {
    const config = defaultConfig({});
    expect(config.context_management).toBeUndefined();
  });
});
