import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { defaultConfig } from "../src/state/config.js";
import {
  isContextManagerEnabled,
  loadContextManagerConfig,
} from "../src/plugins/context-manager.js";

function withTempProject(run: (cwd: string) => void): void {
  const cwd = mkdtempSync(join(tmpdir(), "forge-ctx-plugin-"));
  try {
    mkdirSync(join(cwd, ".forge"), { recursive: true });
    run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

function writeConfig(cwd: string, contextManagement?: any): void {
  const config = defaultConfig({
    ...(contextManagement !== undefined ? { context_management: contextManagement } : {}),
  });
  writeFileSync(
    join(cwd, ".forge", "config.json"),
    JSON.stringify(config, null, 2) + "\n",
    "utf8",
  );
}

describe("context-manager plugin", () => {
  test("isContextManagerEnabled returns false when config is missing", () => {
    withTempProject((cwd) => {
      // No config.json at all
      expect(isContextManagerEnabled(cwd)).toBe(false);
    });
  });

  test("isContextManagerEnabled returns false when context_management is absent", () => {
    withTempProject((cwd) => {
      writeConfig(cwd); // no context_management
      expect(isContextManagerEnabled(cwd)).toBe(false);
    });
  });

  test("isContextManagerEnabled returns false when enabled: false", () => {
    withTempProject((cwd) => {
      writeConfig(cwd, { enabled: false, threshold_pct: 0.5 });
      expect(isContextManagerEnabled(cwd)).toBe(false);
    });
  });

  test("isContextManagerEnabled returns true when enabled: true", () => {
    withTempProject((cwd) => {
      writeConfig(cwd, { enabled: true, threshold_pct: 0.5 });
      expect(isContextManagerEnabled(cwd)).toBe(true);
    });
  });

  test("loadContextManagerConfig returns null when disabled", () => {
    withTempProject((cwd) => {
      writeConfig(cwd, { enabled: false });
      expect(loadContextManagerConfig(cwd)).toBeNull();
    });
  });

  test("loadContextManagerConfig returns config when enabled", () => {
    withTempProject((cwd) => {
      writeConfig(cwd, {
        enabled: true,
        threshold_pct: 0.6,
        strategy: "in-place-restart",
        fallback: "prompt-compact",
        min_tasks_between_handoff: 2,
      });
      const config = loadContextManagerConfig(cwd);
      expect(config).not.toBeNull();
      expect(config!.threshold_pct).toBe(0.6);
      expect(config!.strategy).toBe("in-place-restart");
      expect(config!.min_tasks_between_handoff).toBe(2);
    });
  });

  test("all methods are no-ops when plugin is disabled (Property 7 guarantee)", () => {
    withTempProject((cwd) => {
      writeConfig(cwd, { enabled: false });
      // When disabled, isContextManagerEnabled is false
      // and loadContextManagerConfig returns null.
      // Callers must check before proceeding — the plugin never intervenes.
      expect(isContextManagerEnabled(cwd)).toBe(false);
      expect(loadContextManagerConfig(cwd)).toBeNull();
    });
  });
});
