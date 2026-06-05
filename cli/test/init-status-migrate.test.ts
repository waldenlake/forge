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

import { validateJsonFile } from "../src/lib/schema.js";
import { defaultConfig } from "../src/state/config.js";

const repoRoot = resolve(import.meta.dirname, "../..");
const forgeBin = resolve(repoRoot, "cli/dist/index.js");
const configSchemaPath = resolve(repoRoot, "schemas/config.schema.json");

function withTempProject(run: (cwd: string) => void): void {
  const cwd = mkdtempSync(join(tmpdir(), "forge-cli-"));

  try {
    run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

function runForge(
  cwd: string,
  args: string[],
  env: NodeJS.ProcessEnv = {},
) {
  return spawnSync(process.execPath, [forgeBin, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      CLAUDE_PLUGIN_ROOT: "",
      GEMINI_CLI: "",
      ...env,
    },
  });
}

function parseStdout(result: ReturnType<typeof runForge>): unknown {
  expect(result.stderr).toBe("");
  return JSON.parse(result.stdout);
}

function writeV1Config(cwd: string): void {
  mkdirSync(join(cwd, ".forge"), { recursive: true });
  writeFileSync(
    join(cwd, ".forge", "config.json"),
    `${JSON.stringify(
      {
        version: "1.0",
        memory_file: "AGENTS.md",
        gstack_installed: false,
        project_type: "existing",
        test_command: "npm test -- --runInBand",
        test_framework: "jest",
        guards: {
          review: {
            enabled: true,
            actions: ["request-code-review"],
          },
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

function writeV2Config(cwd: string, config = defaultConfig()): void {
  mkdirSync(join(cwd, ".forge"), { recursive: true });
  writeFileSync(
    join(cwd, ".forge", "config.json"),
    `${JSON.stringify(config, null, 2)}\n`,
    "utf8",
  );
}

describe("init, status, doctor, and migration commands", () => {
  test("init auto-detects npm test and writes v2 config with idle progress", () => {
    withTempProject((cwd) => {
      writeFileSync(
        join(cwd, "package.json"),
        JSON.stringify({ scripts: { test: "vitest run" } }),
        "utf8",
      );

      const result = runForge(cwd, [
        "init",
        "--auto-detect",
        "--superpowers-available",
        "true",
      ]);

      expect(result.status).toBe(0);
      const payload = parseStdout(result);
      expect(payload).toMatchObject({
        ok: true,
        forge_cli_version: "0.2.0",
        detected: {
          project_type: "new",
          memory_file: "AGENTS.md",
          test_profiles: {
            default: {
              framework: "vitest",
              command: "npm test",
              working_dir: ".",
            },
          },
        },
      });
      expect(payload).toHaveProperty("created");

      const config = JSON.parse(
        readFileSync(join(cwd, ".forge", "config.json"), "utf8"),
      );
      expect(config.version).toBe("2.0");
      expect(config.test_command).toBeUndefined();
      expect(config.test_profiles.default.command).toBe("npm test");

      const progress = JSON.parse(
        readFileSync(join(cwd, ".forge", "progress.json"), "utf8"),
      );
      expect(progress).toMatchObject({
        version: "1.0",
        feature: null,
        status: "idle",
        spec_path: null,
        plan_path: null,
        total_tasks: 0,
        completed_tasks: 0,
        phase_complete_attempts: 0,
        tasks: [],
        guard_history: [],
        verification: {
          status: "pending",
          last_run: null,
          report_path: null,
        },
      });
    });
  });

  test("init creates Forge directories and ensures a Forge memory section", () => {
    withTempProject((cwd) => {
      const result = runForge(cwd, [
        "init",
        "--auto-detect",
        "--superpowers-available",
        "true",
      ]);

      expect(result.status).toBe(0);
      expect(existsSync(join(cwd, ".forge"))).toBe(true);
      expect(existsSync(join(cwd, ".forge", "specs"))).toBe(true);
      expect(existsSync(join(cwd, ".forge", "bin"))).toBe(true);
      expect(existsSync(join(cwd, ".forge", "backups"))).toBe(true);
      expect(readFileSync(join(cwd, "AGENTS.md"), "utf8")).toContain(
        "## Forge",
      );
    });
  });

  test("init does not use superpowers availability as gstack detection", () => {
    withTempProject((cwd) => {
      const result = runForge(
        cwd,
        ["init", "--auto-detect", "--superpowers-available", "true"],
        { PATH: "" },
      );

      expect(result.status).toBe(0);
      const payload = parseStdout(result);
      expect(payload).toMatchObject({
        ok: true,
        detected: {
          gstack_installed: false,
        },
      });

      const config = JSON.parse(
        readFileSync(join(cwd, ".forge", "config.json"), "utf8"),
      );
      expect(config.gstack_installed).toBe(false);
    });
  });

  test("init classifies unknown npm test scripts as npm", () => {
    withTempProject((cwd) => {
      writeFileSync(
        join(cwd, "package.json"),
        JSON.stringify({ scripts: { test: "node test.js" } }),
        "utf8",
      );

      const result = runForge(cwd, ["init", "--auto-detect"]);

      expect(result.status).toBe(0);
      const payload = parseStdout(result);
      expect(payload).toMatchObject({
        ok: true,
        detected: {
          test_profiles: {
            default: {
              framework: "npm",
              command: "npm test",
            },
          },
        },
      });

      const config = JSON.parse(
        readFileSync(join(cwd, ".forge", "config.json"), "utf8"),
      );
      expect(config.test_profiles.default.framework).toBe("npm");
      expect(config.test_profiles.default.command).toBe("npm test");
    });
  });

  test("init rejects existing v2 config without overwriting it", () => {
    withTempProject((cwd) => {
      const originalConfig = defaultConfig({
        memory_file: "CLAUDE.md",
        test_profiles: {
          default: {
            framework: "custom",
            command: "custom test",
            working_dir: ".",
          },
        },
      });
      writeV2Config(cwd, originalConfig);
      writeFileSync(
        join(cwd, "package.json"),
        JSON.stringify({ scripts: { test: "vitest run" } }),
        "utf8",
      );

      const result = runForge(cwd, ["init", "--auto-detect"]);

      expect(result.status).toBe(1);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toMatchObject({
        ok: false,
        error: expect.stringContaining("config.json already exists"),
      });
      expect(
        JSON.parse(readFileSync(join(cwd, ".forge", "config.json"), "utf8")),
      ).toEqual(originalConfig);
    });
  });

  test("init rejects existing v1 config and leaves legacy fields unchanged", () => {
    withTempProject((cwd) => {
      writeV1Config(cwd);

      const result = runForge(cwd, ["init", "--auto-detect"]);

      expect(result.status).toBe(1);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toMatchObject({
        ok: false,
        error: expect.stringContaining("migrate"),
      });
      expect(
        JSON.parse(readFileSync(join(cwd, ".forge", "config.json"), "utf8")),
      ).toHaveProperty("test_command", "npm test -- --runInBand");
    });
  });

  test("status reports stale_progress when progress.json contains a removed status enum", () => {
    withTempProject((cwd) => {
      // v2 config + a pre-Phase-1 progress.json carrying the now-removed
      // "verification_complete" status. Status must not crash; it must surface
      // a structured stale_progress error pointing the user at `reset --backup`.
      runForge(cwd, [
        "init",
        "--auto-detect",
        "--superpowers-available",
        "true",
      ]);

      writeFileSync(
        join(cwd, ".forge", "progress.json"),
        JSON.stringify({
          version: "1.0",
          feature: "stale-feature",
          status: "verification_complete",
          created_at: "2026-05-26T00:00:00.000Z",
          updated_at: "2026-05-26T00:00:00.000Z",
          spec_path: null,
          plan_path: null,
          total_tasks: 0,
          completed_tasks: 0,
          tasks: [],
          guard_history: [],
          verification: {
            status: "passed",
            test_mode: "normal",
            last_run: null,
            report_path: null,
          },
        }),
        "utf8",
      );

      const result = runForge(cwd, ["status"]);

      expect(result.status).toBe(1);
      const payload = parseStdout(result);
      expect(payload).toMatchObject({
        ok: false,
        stale_progress: true,
        status: "verification_complete",
        recovery: "forge reset --backup",
      });
      expect(typeof payload.error).toBe("string");
    });
  });

  test("status reports v1 config migration_required without migrating", () => {
    withTempProject((cwd) => {
      writeV1Config(cwd);

      const result = runForge(cwd, ["status"]);

      expect(result.status).toBe(0);
      expect(parseStdout(result)).toMatchObject({
        ok: true,
        migration_required: true,
        config_version: "1.0",
        status: "idle",
      });
      expect(
        JSON.parse(readFileSync(join(cwd, ".forge", "config.json"), "utf8")),
      ).toHaveProperty("test_command", "npm test -- --runInBand");
    });
  });

  test("status reports migration_required before validating legacy progress", () => {
    withTempProject((cwd) => {
      writeV1Config(cwd);
      writeFileSync(
        join(cwd, ".forge", "progress.json"),
        JSON.stringify({
          version: "1.0",
          status: "idle",
          phase_complete_attempts: 0,
          tasks: [],
        }),
        "utf8",
      );

      const result = runForge(cwd, ["status"]);

      expect(result.status).toBe(0);
      expect(parseStdout(result)).toMatchObject({
        ok: true,
        migration_required: true,
        config_version: "1.0",
      });
      expect(
        JSON.parse(readFileSync(join(cwd, ".forge", "config.json"), "utf8")),
      ).toHaveProperty("test_command", "npm test -- --runInBand");
    });
  });

  test("status reports idle when progress is missing", () => {
    withTempProject((cwd) => {
      const init = runForge(cwd, [
        "init",
        "--auto-detect",
        "--superpowers-available",
        "true",
      ]);
      expect(init.status).toBe(0);
      rmSync(join(cwd, ".forge", "progress.json"));

      const result = runForge(cwd, ["status"]);

      expect(result.status).toBe(0);
      expect(parseStdout(result)).toMatchObject({
        ok: true,
        migration_required: false,
        status: "idle",
      });
    });
  });

  test("migrate converts v1 test settings to schema-valid v2 test_profiles", () => {
    withTempProject((cwd) => {
      writeV1Config(cwd);

      const result = runForge(cwd, ["migrate", "--from", "1.0", "--to", "2.0"]);

      expect(result.status).toBe(0);
      expect(parseStdout(result)).toEqual({
        ok: true,
        from: "1.0",
        to: "2.0",
      });

      const config = JSON.parse(
        readFileSync(join(cwd, ".forge", "config.json"), "utf8"),
      );
      expect(validateJsonFile(configSchemaPath, config)).toEqual({
        ok: true,
        errors: [],
      });
      expect(config.test_profiles.default).toEqual({
        framework: "jest",
        command: "npm test -- --runInBand",
        working_dir: ".",
      });
      expect(config.test_command).toBeUndefined();
      expect(config.test_framework).toBeUndefined();
    });
  });

  test("migrate falls back to default guards when legacy guards are invalid", () => {
    withTempProject((cwd) => {
      writeV1Config(cwd);
      const configPath = join(cwd, ".forge", "config.json");
      const legacyConfig = JSON.parse(readFileSync(configPath, "utf8"));
      legacyConfig.guards = {
        legacy: {
          enabled: true,
          every_n_tasks: 6,
          note: "old",
        },
      };
      writeFileSync(configPath, JSON.stringify(legacyConfig), "utf8");

      const result = runForge(cwd, ["migrate", "--from", "1.0", "--to", "2.0"]);

      expect(result.status).toBe(0);
      expect(parseStdout(result)).toEqual({
        ok: true,
        from: "1.0",
        to: "2.0",
      });

      const migrated = JSON.parse(readFileSync(configPath, "utf8"));
      expect(validateJsonFile(configSchemaPath, migrated)).toEqual({
        ok: true,
        errors: [],
      });
      expect(migrated.guards).toHaveProperty("batch-review");
      expect(migrated.guards).not.toHaveProperty("legacy");
    });
  });

  test("migrate rejects unsupported target versions with structured JSON", () => {
    withTempProject((cwd) => {
      writeV1Config(cwd);

      const result = runForge(cwd, ["migrate", "--from", "1.0", "--to", "1.1"]);

      expect(result.status).toBe(1);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toMatchObject({
        ok: false,
        error: expect.stringContaining("Unsupported migration 1.0 -> 1.1"),
      });
    });
  });

  test("doctor emits EnvironmentReport JSON outside a Forge project", () => {
    withTempProject((cwd) => {
      const result = runForge(cwd, ["doctor"]);

      const payload = parseStdout(result) as Record<string, unknown>;

      // Top-level structure matches EnvironmentReport
      expect(payload).toHaveProperty("ok");
      expect(payload).toHaveProperty("generated_at");
      expect(payload).toHaveProperty("forge_cli_version");
      expect(payload).toHaveProperty("cwd");
      expect(payload).toHaveProperty("platform");
      expect(payload).toHaveProperty("context");
      expect(payload).toHaveProperty("tools");
      expect(payload).toHaveProperty("project");
      expect(payload).toHaveProperty("issues");
      expect(Array.isArray((payload as { issues: unknown }).issues)).toBe(true);
    });
  });
});
