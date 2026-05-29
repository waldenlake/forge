import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";

import { validateJsonFile } from "../src/lib/schema.js";

const repoRoot = resolve(import.meta.dirname, "../..");
const configSchemaPath = resolve(repoRoot, "schemas/config.schema.json");
const progressSchemaPath = resolve(repoRoot, "schemas/progress.schema.json");

function withTempProject(run: (cwd: string) => void): void {
  const cwd = mkdtempSync(join(tmpdir(), "forge-state-"));

  try {
    run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

describe("state readers and writers", () => {
  test("defaultConfig uses the planned default guards exactly", async () => {
    const { defaultConfig } = await import("../src/state/config.js");

    expect(defaultConfig().guards).toEqual({
      "batch-review": {
        enabled: true,
        every_n_tasks: 6,
        actions: ["spec-compliance-review"],
      },
      "coverage-gate": {
        enabled: false,
        trigger: "phase-complete",
        actions: ["coverage-check"],
      },
      "security-scan": {
        enabled: false,
        trigger: "keyword",
        keywords: [
          "auth",
          "crypto",
          "password",
          "token",
          "permission",
          "jwt",
          "oauth",
        ],
        severity_threshold: "HIGH",
        actions: ["security-audit"],
      },
      "dependency-audit": {
        enabled: false,
        trigger: "new-dependency",
        actions: ["dependency-check"],
        license_allowlist: [
          "MIT",
          "Apache-2.0",
          "BSD-2-Clause",
          "BSD-3-Clause",
          "ISC",
        ],
      },
      "performance-budget": {
        enabled: false,
        trigger: "keyword",
        keywords: ["component", "page", "ui", "frontend"],
        budgets: {
          bundle_size_kb: 500,
          lcp_ms: 2500,
        },
        actions: ["bundle-size-check"],
      },
      "human-review": {
        enabled: false,
        trigger: "manual",
        actions: ["pause-for-human"],
      },
    });
  });

  test("writeConfig creates a schema-valid .forge/config.json that readConfig returns unchanged", async () => {
    const { configPath, defaultConfig, readConfig, writeConfig } = await import(
      "../src/state/config.js"
    );

    withTempProject((cwd) => {
      const config = defaultConfig({
        memory_file: "AGENTS.md",
        project_type: "existing",
        test_profiles: {
          default: {
            framework: "vitest",
            command: "npm test",
            working_dir: "cli",
          },
        },
      });

      writeConfig(cwd, config);

      const writtenPath = configPath(cwd);
      const writtenConfig = JSON.parse(readFileSync(writtenPath, "utf8"));
      expect(validateJsonFile(configSchemaPath, writtenConfig)).toEqual({
        ok: true,
        errors: [],
      });
      expect(readConfig(cwd)).toEqual(config);
    });
  });

  test("writeProgress creates a schema-valid idle .forge/progress.json", async () => {
    const { idleProgress, progressPath, readProgress, writeProgress } =
      await import("../src/state/progress.js");

    withTempProject((cwd) => {
      const progress = idleProgress();
      writeProgress(cwd, progress);

      const writtenPath = progressPath(cwd);
      const writtenProgress = JSON.parse(readFileSync(writtenPath, "utf8"));
      expect(validateJsonFile(progressSchemaPath, writtenProgress)).toEqual({
        ok: true,
        errors: [],
      });
      expect(readProgress(cwd)).toEqual(progress);
    });
  });

  test("writeConfig rejects invalid config without writing invalid state", async () => {
    const { configPath, writeConfig } = await import("../src/state/config.js");

    withTempProject((cwd) => {
      expect(() =>
        writeConfig(cwd, {
          version: "1.0",
          forge_cli_version: "",
        }),
      ).toThrow(/Invalid config\.json/);
      expect(existsSync(configPath(cwd))).toBe(false);
    });
  });

  test("writeProgress rejects invalid progress without writing invalid state", async () => {
    const { progressPath, writeProgress } = await import(
      "../src/state/progress.js"
    );

    withTempProject((cwd) => {
      expect(() =>
        writeProgress(cwd, {
          version: "1.0",
          status: "idle",
          updated_at: "not-a-date",
          phase_complete_attempts: 0,
          tasks: [],
          guard_history: [],
        }),
      ).toThrow(/Invalid progress\.json/);
      expect(existsSync(progressPath(cwd))).toBe(false);
    });
  });

  test("writeProgress keeps existing valid progress when a later write is invalid", async () => {
    const { idleProgress, progressPath, writeProgress } = await import(
      "../src/state/progress.js"
    );

    withTempProject((cwd) => {
      const originalProgress = idleProgress();
      writeProgress(cwd, originalProgress);

      expect(() =>
        writeProgress(cwd, {
          version: "1.0",
          feature: null,
          status: "idle",
          phase_complete_attempts: 0,
          tasks: [],
          guard_history: [],
          verification: {
            status: "pending",
            last_run: null,
            report_path: null,
          },
        }),
      ).toThrow(/Invalid progress\.json/);

      expect(JSON.parse(readFileSync(progressPath(cwd), "utf8"))).toEqual(
        originalProgress,
      );
    });
  });
});
