import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const configSchemaPath = resolve(repoRoot, "schemas/config.schema.json");
const progressSchemaPath = resolve(repoRoot, "schemas/progress.schema.json");

const validV2Config = {
  version: "2.0",
  forge_cli_version: "0.2.0",
  memory_file: "AGENTS.md",
  gstack_installed: false,
  project_type: "existing",
  test_profiles: {
    default: {
      framework: "vitest",
      command: "npm test",
      working_dir: "cli",
    },
  },
  guards: {
    review: {
      enabled: true,
      actions: ["request-code-review"],
    },
  },
};

const validProgress = {
  version: "1.0",
  feature: "schema validation",
  status: "executing",
  created_at: "2026-05-25T08:00:00.000Z",
  updated_at: "2026-05-25T09:00:00.000Z",
  spec_path: null,
  plan_path: null,
  total_tasks: 1,
  completed_tasks: 0,
  phase_complete_attempts: 0,
  tasks: [
    {
      id: 1,
      title: "Upgrade schemas",
      status: "in_progress",
    },
  ],
  guard_history: [],
  verification: {
    status: "pending",
    last_run: null,
    report_path: null,
  },
};

describe("schema validation", () => {
  test("accepts a complete v2 config object", async () => {
    const { validateJsonFile } = await import("../src/lib/schema.js");

    const result = validateJsonFile(configSchemaPath, validV2Config);

    expect(result).toEqual({ ok: true, errors: [] });
  });

  test("accepts v2 config when gstack_installed is omitted", async () => {
    const { validateJsonFile } = await import("../src/lib/schema.js");
    const { gstack_installed: _gstackInstalled, ...configWithoutGstack } =
      validV2Config;

    const result = validateJsonFile(configSchemaPath, configWithoutGstack);

    expect(result).toEqual({ ok: true, errors: [] });
  });

  test("rejects v1 config fields instead of accepting legacy test settings", async () => {
    const { validateJsonFile } = await import("../src/lib/schema.js");

    const result = validateJsonFile(configSchemaPath, {
      version: "1.0",
      memory_file: "AGENTS.md",
      project_type: "existing",
      test_command: "npm test",
      test_framework: "vitest",
      guards: {},
    });

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(
      /version|additional propert(?:y|ies)|test_command|test_framework/i,
    );
    expect(result.errors.join("\n")).toContain("test_command");
    expect(result.errors.join("\n")).toContain("test_framework");
  });

  test("rejects unknown test_coverage fields", async () => {
    const { validateJsonFile } = await import("../src/lib/schema.js");

    const result = validateJsonFile(configSchemaPath, {
      ...validV2Config,
      test_coverage: {
        unit: 80,
        branch: 70,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(/additional propert/i);
  });

  test("rejects guard fields with known but invalid types", async () => {
    const { validateJsonFile } = await import("../src/lib/schema.js");

    const result = validateJsonFile(configSchemaPath, {
      ...validV2Config,
      guards: {
        review: {
          enabled: true,
          actions: ["request-code-review"],
          keywords: "auth",
        },
      },
    });

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(/keywords.*array/i);
  });

  test("schema:validate fails when the file does not match the explicitly provided schema", () => {
    const result = spawnSync(
      process.execPath,
      [
        "cli/dist/index.js",
        "schema:validate",
        "--file",
        "schemas/config.schema.json",
        "--schema",
        "schemas/config.schema.json",
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      file: "schemas/config.schema.json",
    });
    expect(JSON.parse(result.stdout).errors.length).toBeGreaterThan(0);
  });

  test("schema:validate infers repo schemas when invoked from the cli directory", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "forge-schema-"));
    const configPath = join(tempDir, "config.json");

    try {
      writeFileSync(configPath, JSON.stringify(validV2Config), "utf8");

      const result = spawnSync(
        process.execPath,
        ["dist/index.js", "schema:validate", "--file", configPath],
        { cwd: join(repoRoot, "cli"), encoding: "utf8" },
      );

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toEqual({
        ok: true,
        file: configPath,
        errors: [],
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("rejects progress with invalid date-time values", async () => {
    const { validateJsonFile } = await import("../src/lib/schema.js");

    const result = validateJsonFile(progressSchemaPath, {
      ...validProgress,
      updated_at: "not-a-date",
    });

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(/date-time|format/i);
  });

  test("rejects progress missing state contract fields", async () => {
    const { validateJsonFile } = await import("../src/lib/schema.js");

    const result = validateJsonFile(progressSchemaPath, {
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
    });

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(/updated_at|required/i);
  });

  test("rejects progress with incomplete verification state", async () => {
    const { validateJsonFile } = await import("../src/lib/schema.js");

    const result = validateJsonFile(progressSchemaPath, {
      ...validProgress,
      verification: {},
    });

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(/status|attempts|required/i);
  });

  test("schema:validate rejects invalid progress date-time without stderr warnings", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "forge-schema-"));
    const progressPath = join(tempDir, "progress.json");

    try {
      writeFileSync(
        progressPath,
        JSON.stringify({
          ...validProgress,
          updated_at: "not-a-date",
        }),
        "utf8",
      );

      const result = spawnSync(
        process.execPath,
        ["cli/dist/index.js", "schema:validate", "--file", progressPath],
        { cwd: repoRoot, encoding: "utf8" },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toMatchObject({
        ok: false,
        file: progressPath,
      });
      expect(JSON.parse(result.stdout).errors.join("\n")).toMatch(
        /date-time|format/i,
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
