import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
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
  const cwd = mkdtempSync(join(tmpdir(), "forge-cli-phase2-stubs-"));

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

function parseStdout(result: ReturnType<typeof runForge>): any {
  expect(result.stderr).toBe("");
  return JSON.parse(result.stdout);
}

function writeConfig(cwd: string, config: ForgeConfig = defaultConfig()): void {
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
    total_tasks: 5,
    completed_tasks: 4,
    tasks: [
      { id: 1, title: "Task 1", status: "done" },
      { id: 2, title: "Task 2", status: "done" },
      { id: 3, title: "Task 3", status: "done" },
      { id: 4, title: "Task 4", status: "done" },
      { id: 5, title: "Add token refresh", status: "pending" },
    ],
    ...overrides,
  };
}

describe("phase 2 stub interfaces", () => {
  test("guard:preview returns security preview for a synthetic next task", () => {
    withTempProject((cwd) => {
      writeConfig(
        cwd,
        defaultConfig({
          guards: {
            ...defaultConfig().guards,
            "security-scan": {
              enabled: true,
              trigger: "keyword",
              keywords: ["token"],
              actions: ["security-audit"],
            },
          },
        }),
      );
      writeProgress(cwd, executingProgress());

      const result = runForge(cwd, [
        "guard:preview",
        "--next-task-id",
        "5",
        "--next-task-title",
        "Add token refresh",
      ]);

      expect(result.status).toBe(0);
      expect(parseStdout(result)).toMatchObject({
        ok: true,
        guard_triggered: true,
        guard_type: "security-scan",
        guards: [{ type: "security-scan", actions: ["security-audit"] }],
      });
    });
  });

  test("guard:preview simulates completing the next task before checking batch-review", () => {
    withTempProject((cwd) => {
      writeConfig(
        cwd,
        defaultConfig({
          guards: {
            ...defaultConfig().guards,
            "batch-review": {
              enabled: true,
              every_n_tasks: 6,
              actions: ["spec-compliance-review"],
            },
          },
        }),
      );
      writeProgress(
        cwd,
        executingProgress({
          total_tasks: 6,
          completed_tasks: 5,
          tasks: [
            { id: 1, title: "Task 1", status: "done" },
            { id: 2, title: "Task 2", status: "done" },
            { id: 3, title: "Task 3", status: "done" },
            { id: 4, title: "Task 4", status: "done" },
            { id: 5, title: "Task 5", status: "done" },
            { id: 6, title: "Review runtime", status: "pending" },
          ],
        }),
      );

      const result = runForge(cwd, [
        "guard:preview",
        "--next-task-id",
        "6",
        "--next-task-title",
        "Review runtime",
      ]);

      expect(result.status).toBe(0);
      expect(parseStdout(result)).toMatchObject({
        ok: true,
        guard_triggered: true,
        guard_type: "batch-review",
        guards: [
          {
            type: "batch-review",
            actions: ["spec-compliance-review"],
            task_range: [1, 6],
          },
        ],
      });
    });
  });

  test("guard:run rejects non-scanner (delegated) types with ok=false", () => {
    withTempProject((cwd) => {
      writeConfig(cwd);

      const result = runForge(cwd, [
        "guard:run",
        "--type",
        "batch-review",
        "--task-id",
        "5",
      ]);

      expect(result.status).toBe(1);
      expect(parseStdout(result)).toMatchObject({
        ok: false,
        delegated: true,
        type: "batch-review",
      });
    });
  });

  test("guard:coverage-check returns ok=false when no coverage report exists", () => {
    withTempProject((cwd) => {
      writeConfig(cwd);

      const result = runForge(cwd, ["guard:coverage-check"]);

      expect(result.status).toBe(1);
      expect(parseStdout(result)).toMatchObject({
        ok: false,
        report_path: null,
      });
    });
  });

  test("scenarios:export fails with ok=false when --template is missing", () => {
    withTempProject((cwd) => {
      const result = runForge(cwd, ["scenarios:export", "--feature", "auth"]);

      expect(result.status).toBe(1);
      expect(parseStdout(result)).toMatchObject({ ok: false });
    });
  });

  test("scenarios:import fails with ok=false when --template is missing", () => {
    withTempProject((cwd) => {
      const result = runForge(cwd, ["scenarios:import"]);

      expect(result.status).toBe(1);
      expect(parseStdout(result)).toMatchObject({ ok: false });
    });
  });

  test("scenarios:archive copies scenarios into the feature specs archive", () => {
    withTempProject((cwd) => {
      writeProgress(cwd, executingProgress({ feature: "runtime" }));
      writeFileSync(
        join(cwd, ".forge", "scenarios.json"),
        `${JSON.stringify({ scenarios: [{ name: "happy path" }] })}\n`,
        "utf8",
      );

      const result = runForge(cwd, ["scenarios:archive"]);

      expect(result.status).toBe(0);
      expect(parseStdout(result)).toEqual({
        ok: true,
        archived_to: ".forge/specs/runtime-scenarios.json",
      });
      expect(
        JSON.parse(
          readFileSync(
            join(cwd, ".forge", "specs", "runtime-scenarios.json"),
            "utf8",
          ),
        ),
      ).toEqual({ scenarios: [{ name: "happy path" }] });
    });
  });

  test("scenarios:archive fails when progress has no feature", () => {
    withTempProject((cwd) => {
      writeProgress(cwd, executingProgress({ feature: null }));
      writeFileSync(join(cwd, ".forge", "scenarios.json"), "{}\n", "utf8");

      const result = runForge(cwd, ["scenarios:archive"]);

      expect(result.status).toBe(1);
      expect(parseStdout(result)).toEqual({
        ok: false,
        error: "feature name is required — pass --feature <slug> or ensure progress.feature is set",
      });
    });
  });

  test("scenarios:archive rejects unsafe feature slugs", () => {
    withTempProject((cwd) => {
      writeProgress(cwd, executingProgress({ feature: "bad:name" }));
      writeFileSync(join(cwd, ".forge", "scenarios.json"), "{}\n", "utf8");

      const result = runForge(cwd, ["scenarios:archive"]);

      expect(result.status).toBe(1);
      expect(parseStdout(result)).toEqual({
        ok: false,
        error: "feature must be a safe feature slug",
      });
      expect(existsSync(join(cwd, ".forge", "specs"))).toBe(false);
    });
  });

  test("scenarios:archive fails when scenarios file is missing", () => {
    withTempProject((cwd) => {
      writeProgress(cwd, executingProgress({ feature: "runtime" }));

      const result = runForge(cwd, ["scenarios:archive"]);

      expect(result.status).toBe(1);
      expect(parseStdout(result)).toEqual({
        ok: false,
        error: ".forge/scenarios.json does not exist",
      });
      expect(existsSync(join(cwd, ".forge", "specs"))).toBe(false);
    });
  });
});
