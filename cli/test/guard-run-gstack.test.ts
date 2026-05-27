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

import { defaultConfig } from "../src/state/config.js";
import type { ForgeConfig } from "../src/state/config.js";

const repoRoot = resolve(import.meta.dirname, "../..");
const forgeBin = resolve(repoRoot, "cli/dist/index.js");

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

function parseStdout(result: ReturnType<typeof runForge>): any {
  expect(result.stderr).toBe("");
  return JSON.parse(result.stdout);
}

function withTempProject(run: (cwd: string) => void): void {
  const cwd = mkdtempSync(join(tmpdir(), "forge-guard-run-gstack-"));
  try {
    mkdirSync(join(cwd, ".forge"), { recursive: true });
    run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

function writeConfig(cwd: string, config: ForgeConfig): void {
  writeFileSync(
    join(cwd, ".forge", "config.json"),
    `${JSON.stringify(config, null, 2)}\n`,
    "utf8",
  );
}

describe("guard:run action dispatch", () => {
  test("gstack actions are returned as delegated_actions, not executed inline", () => {
    withTempProject((cwd) => {
      writeConfig(
        cwd,
        defaultConfig({
          gstack_installed: true,
          guards: {
            "batch-review": {
              enabled: true,
              every_n_tasks: 3,
              actions: ["spec-compliance-review", "gstack-e2e"],
            },
          },
        }),
      );

      const result = runForge(cwd, [
        "guard:run",
        "--type",
        "batch-review",
        "--task-id",
        "3",
      ]);

      expect(result.status).toBe(0);
      const payload = parseStdout(result) as Record<string, unknown>;
      expect(payload.ok).toBe(true);
      expect(payload.type).toBe("batch-review");
      // All actions are delegated — gstack is handled by the skill layer
      expect(payload.delegated_actions).toEqual(["spec-compliance-review", "gstack-e2e"]);
      expect(payload.executed).toEqual([]);
    });
  });

  test("gstack actions are delegated even when gstack_installed=false", () => {
    withTempProject((cwd) => {
      writeConfig(
        cwd,
        defaultConfig({
          gstack_installed: false,
          guards: {
            "batch-review": {
              enabled: true,
              every_n_tasks: 3,
              actions: ["gstack-visual"],
            },
          },
        }),
      );

      const result = runForge(cwd, [
        "guard:run",
        "--type",
        "batch-review",
        "--task-id",
        "3",
      ]);

      // Delegated — the skill layer is responsible for checking gstack availability
      expect(result.status).toBe(0);
      const payload = parseStdout(result) as Record<string, unknown>;
      expect(payload.ok).toBe(true);
      expect(payload.delegated_actions).toEqual(["gstack-visual"]);
      expect(payload.executed).toEqual([]);
    });
  });

  test("non-gstack actions are returned as delegated_actions", () => {
    withTempProject((cwd) => {
      writeConfig(
        cwd,
        defaultConfig({
          guards: {
            "batch-review": {
              enabled: true,
              every_n_tasks: 3,
              actions: ["spec-compliance-review"],
            },
          },
        }),
      );

      const result = runForge(cwd, [
        "guard:run",
        "--type",
        "batch-review",
        "--task-id",
        "5",
      ]);

      expect(result.status).toBe(0);
      const payload = parseStdout(result) as Record<string, unknown>;
      expect(payload.ok).toBe(true);
      expect(payload.type).toBe("batch-review");
      expect(payload.delegated_actions).toEqual(["spec-compliance-review"]);
      expect(payload.executed).toEqual([]);
    });
  });
});
