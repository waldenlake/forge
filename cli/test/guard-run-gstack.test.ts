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

describe("guard:run gstack action dispatch", () => {
  test("expands gstack-e2e action inline and runs runGstack when gstack_installed=true", () => {
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

      // Playwright is not installed in test env, so the e2e action will fail.
      // What we are asserting: it WAS executed (not just delegated), and
      // spec-compliance-review is delegated separately.
      const payload = parseStdout(result) as Record<string, unknown>;
      expect(payload.type).toBe("batch-review");
      expect(payload.delegated_actions).toEqual(["spec-compliance-review"]);

      const executed = payload.executed as Array<Record<string, unknown>>;
      expect(executed).toHaveLength(1);
      expect(executed[0]?.action).toBe("gstack-e2e");
      expect(executed[0]?.type).toBe("e2e");
      // Either ok:false (no playwright) or ok:true if somehow installed —
      // both are acceptable; the contract is that it ran, not that it
      // succeeded.
      expect(typeof executed[0]?.ok).toBe("boolean");
    });
  });

  test("returns ok:false and unavailable when gstack action present but gstack_installed=false", () => {
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

      expect(result.status).toBe(1);
      const payload = parseStdout(result) as Record<string, unknown>;
      expect(payload.ok).toBe(false);
      const executed = payload.executed as Array<Record<string, unknown>>;
      expect(executed).toHaveLength(1);
      expect(executed[0]?.action).toBe("gstack-visual");
      expect(executed[0]?.unavailable).toBe(true);
    });
  });

  test("delegates non-gstack actions only when no gstack actions configured", () => {
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
