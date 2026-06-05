import { spawnSync } from "node:child_process";
import {
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

const repoRoot = resolve(import.meta.dirname, "../..");
const forgeBin = resolve(repoRoot, "cli/dist/index.js");

function withTempProject(run: (cwd: string) => void): void {
  const cwd = mkdtempSync(join(tmpdir(), "forge-config-context-"));
  try {
    mkdirSync(join(cwd, ".forge"), { recursive: true });
    writeFileSync(
      join(cwd, ".forge", "config.json"),
      JSON.stringify(defaultConfig({}), null, 2),
      "utf8",
    );
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

function readConfigFile(cwd: string): ForgeConfig {
  return JSON.parse(readFileSync(join(cwd, ".forge", "config.json"), "utf8"));
}

describe("forge config:context", () => {
  test("--show returns null when section is absent", () => {
    withTempProject((cwd) => {
      const result = runForge(cwd, ["config:context", "--show"]);
      expect(result.status).toBe(0);
      const out = parseStdout(result);
      expect(out.ok).toBe(true);
      expect(out.context_management).toBeNull();
    });
  });

  test("--enable bootstraps the section with sensible defaults", () => {
    withTempProject((cwd) => {
      const result = runForge(cwd, ["config:context", "--enable"]);
      expect(result.status).toBe(0);
      const out = parseStdout(result);

      expect(out.ok).toBe(true);
      expect(out.context_management.enabled).toBe(true);
      expect(out.context_management.threshold_pct).toBe(0.5);
      expect(out.context_management.strategy).toBe("in-place-restart");
      expect(out.context_management.fallback).toBe("prompt-compact");
      expect(out.context_management.min_tasks_between_handoff).toBe(1);

      // Persisted to disk
      const config = readConfigFile(cwd);
      expect(config.context_management?.enabled).toBe(true);
    });
  });

  test("--disable preserves other fields, only flips enabled", () => {
    withTempProject((cwd) => {
      runForge(cwd, ["config:context", "--enable", "--threshold", "0.7"]);
      const beforeDisable = readConfigFile(cwd).context_management;
      expect(beforeDisable?.threshold_pct).toBe(0.7);

      const result = runForge(cwd, ["config:context", "--disable"]);
      expect(result.status).toBe(0);
      const after = readConfigFile(cwd).context_management;

      expect(after?.enabled).toBe(false);
      // Other fields preserved
      expect(after?.threshold_pct).toBe(0.7);
      expect(after?.strategy).toBe("in-place-restart");
    });
  });

  test("--threshold updates threshold_pct", () => {
    withTempProject((cwd) => {
      runForge(cwd, ["config:context", "--enable"]);
      runForge(cwd, ["config:context", "--threshold", "0.65"]);
      expect(readConfigFile(cwd).context_management?.threshold_pct).toBe(0.65);
    });
  });

  test("--threshold rejects out-of-range values", () => {
    withTempProject((cwd) => {
      const result = runForge(cwd, ["config:context", "--threshold", "1.5"]);
      expect(result.status).toBe(1);
      const out = parseStdout(result);
      expect(out.ok).toBe(false);
      expect(out.error).toContain("0-1");
    });
  });

  test("--strategy validates against allowed enum", () => {
    withTempProject((cwd) => {
      const ok = runForge(cwd, [
        "config:context",
        "--enable",
        "--strategy",
        "prompt-compact",
      ]);
      expect(ok.status).toBe(0);
      expect(readConfigFile(cwd).context_management?.strategy).toBe("prompt-compact");

      const bad = runForge(cwd, ["config:context", "--strategy", "bogus"]);
      expect(bad.status).toBe(1);
    });
  });

  test("--enable + --disable mutually exclusive", () => {
    withTempProject((cwd) => {
      const result = runForge(cwd, [
        "config:context",
        "--enable",
        "--disable",
      ]);
      expect(result.status).toBe(1);
      expect(parseStdout(result).error).toContain("mutually exclusive");
    });
  });

  test("--min-tasks rejects non-positive integers", () => {
    withTempProject((cwd) => {
      const result = runForge(cwd, ["config:context", "--min-tasks", "0"]);
      expect(result.status).toBe(1);
    });
  });

  test("can hot-toggle multiple times mid-flow without losing other fields", () => {
    withTempProject((cwd) => {
      runForge(cwd, ["config:context", "--enable", "--threshold", "0.6"]);
      runForge(cwd, ["config:context", "--disable"]);
      runForge(cwd, ["config:context", "--enable"]);
      const final = readConfigFile(cwd).context_management;
      expect(final?.enabled).toBe(true);
      expect(final?.threshold_pct).toBe(0.6); // preserved through disable cycle
    });
  });

  test("no flags behaves like --show", () => {
    withTempProject((cwd) => {
      runForge(cwd, ["config:context", "--enable"]);
      const result = runForge(cwd, ["config:context"]);
      expect(result.status).toBe(0);
      const out = parseStdout(result);
      expect(out.context_management.enabled).toBe(true);
    });
  });
});

describe("forge init auto-enables context_management on supported platforms", () => {
  function withFreshProject(envOverrides: Record<string, string>, run: (cwd: string) => void): void {
    const cwd = mkdtempSync(join(tmpdir(), "forge-init-ctx-"));
    try {
      run(cwd);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }

  function runInit(cwd: string, env: Record<string, string>) {
    return spawnSync(process.execPath, [forgeBin, "init"], {
      cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        CLAUDE_PLUGIN_ROOT: "",
        OPENCODE_HOME: "",
        OPENCODE_SESSION_ID: "",
        CODEX_CLI: "",
        CODEX_HOME: "",
        ...env,
      },
    });
  }

  test("auto-enables on opencode platform", () => {
    withFreshProject({}, (cwd) => {
      const result = runInit(cwd, { OPENCODE_HOME: "/some/path" });
      expect(result.status).toBe(0);
      const config = readConfigFile(cwd);
      expect(config.context_management?.enabled).toBe(true);
      expect(config.context_management?.threshold_pct).toBe(0.5);
    });
  });

  test("auto-enables on claude-code platform", () => {
    withFreshProject({}, (cwd) => {
      const result = runInit(cwd, { CLAUDE_PLUGIN_ROOT: "/some/path" });
      expect(result.status).toBe(0);
      const config = readConfigFile(cwd);
      expect(config.context_management?.enabled).toBe(true);
    });
  });

  test("does NOT auto-enable on codex (unsupported reader)", () => {
    withFreshProject({}, (cwd) => {
      const result = runInit(cwd, { CODEX_CLI: "1" });
      expect(result.status).toBe(0);
      const config = readConfigFile(cwd);
      expect(config.context_management).toBeUndefined();
    });
  });

  test("does NOT auto-enable on unknown platform", () => {
    withFreshProject({}, (cwd) => {
      const result = runInit(cwd, {});
      expect(result.status).toBe(0);
      const config = readConfigFile(cwd);
      expect(config.context_management).toBeUndefined();
    });
  });
});
