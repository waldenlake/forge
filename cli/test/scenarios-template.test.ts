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

const repoRoot = resolve(import.meta.dirname, "../..");
const forgeBin = resolve(repoRoot, "cli/dist/index.js");

function withTempProject(run: (cwd: string) => void): void {
  const cwd = mkdtempSync(join(tmpdir(), "forge-scenarios-template-"));
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

function parseStdout(result: ReturnType<typeof runForge>): unknown {
  expect(result.stderr).toBe("");
  return JSON.parse(result.stdout);
}

const TWO_SCENARIOS = [
  { id: "s1", name: "login happy path" },
  { id: "s2", name: "login sad path" },
];

describe("scenarios template export and import", () => {
  test("scenarios:export writes template file and returns scenarios_count", () => {
    withTempProject((cwd) => {
      writeFileSync(
        join(cwd, ".forge", "scenarios.json"),
        `${JSON.stringify({ scenarios: TWO_SCENARIOS }, null, 2)}\n`,
        "utf8",
      );

      const result = runForge(cwd, [
        "scenarios:export",
        "--feature",
        "user-auth",
        "--template",
        "auth-scenarios",
      ]);

      expect(result.status).toBe(0);
      const output = parseStdout(result) as Record<string, unknown>;
      expect(output).toMatchObject({
        ok: true,
        template: "auth-scenarios",
        path: ".forge/templates/auth-scenarios.json",
        scenarios_count: 2,
      });

      const templatePath = join(
        cwd,
        ".forge",
        "templates",
        "auth-scenarios.json",
      );
      expect(existsSync(templatePath)).toBe(true);

      const template = JSON.parse(readFileSync(templatePath, "utf8"));
      expect(template).toMatchObject({
        version: "1.0",
        template: "auth-scenarios",
        description: "Exported from feature: user-auth",
        scenarios: TWO_SCENARIOS,
      });
      expect(typeof template.exported_at).toBe("string");
    });
  });

  test("scenarios:export fails when .forge/scenarios.json is missing", () => {
    withTempProject((cwd) => {
      const result = runForge(cwd, [
        "scenarios:export",
        "--feature",
        "user-auth",
        "--template",
        "auth-scenarios",
      ]);

      expect(result.status).toBe(1);
      const output = parseStdout(result) as Record<string, unknown>;
      expect(output).toMatchObject({ ok: false });
    });
  });

  test("scenarios:import merges template scenarios into scenarios.json", () => {
    withTempProject((cwd) => {
      const templatesDir = join(cwd, ".forge", "templates");
      mkdirSync(templatesDir, { recursive: true });

      const importScenario = { id: "s99", name: "new scenario from template" };
      writeFileSync(
        join(templatesDir, "auth.json"),
        `${JSON.stringify({
          version: "1.0",
          template: "auth",
          description: "Exported from feature: auth",
          exported_at: "2026-01-01T00:00:00.000Z",
          scenarios: [importScenario],
        }, null, 2)}\n`,
        "utf8",
      );

      writeFileSync(
        join(cwd, ".forge", "scenarios.json"),
        `${JSON.stringify({ scenarios: [] }, null, 2)}\n`,
        "utf8",
      );

      const result = runForge(cwd, ["scenarios:import", "--template", "auth"]);

      expect(result.status).toBe(0);
      const output = parseStdout(result) as Record<string, unknown>;
      expect(output).toMatchObject({
        ok: true,
        imported: 1,
        skipped_duplicates: 0,
        template: "auth",
      });

      const updated = JSON.parse(
        readFileSync(join(cwd, ".forge", "scenarios.json"), "utf8"),
      );
      expect(updated.scenarios).toHaveLength(1);
      expect(updated.scenarios[0]).toMatchObject(importScenario);
    });
  });

  test("scenarios:import skips scenarios with duplicate IDs", () => {
    withTempProject((cwd) => {
      const templatesDir = join(cwd, ".forge", "templates");
      mkdirSync(templatesDir, { recursive: true });

      const existingScenario = { id: "dup-1", name: "existing scenario" };
      writeFileSync(
        join(templatesDir, "dup.json"),
        `${JSON.stringify({
          version: "1.0",
          template: "dup",
          description: "Exported from feature: dup",
          exported_at: "2026-01-01T00:00:00.000Z",
          scenarios: [existingScenario],
        }, null, 2)}\n`,
        "utf8",
      );

      writeFileSync(
        join(cwd, ".forge", "scenarios.json"),
        `${JSON.stringify({ scenarios: [existingScenario] }, null, 2)}\n`,
        "utf8",
      );

      const result = runForge(cwd, ["scenarios:import", "--template", "dup"]);

      expect(result.status).toBe(0);
      const output = parseStdout(result) as Record<string, unknown>;
      expect(output).toMatchObject({
        ok: true,
        imported: 0,
        skipped_duplicates: 1,
        template: "dup",
      });

      const updated = JSON.parse(
        readFileSync(join(cwd, ".forge", "scenarios.json"), "utf8"),
      );
      expect(updated.scenarios).toHaveLength(1);
    });
  });

  test("scenarios:import --as-given sets type: given-template on imported scenarios", () => {
    withTempProject((cwd) => {
      const templatesDir = join(cwd, ".forge", "templates");
      mkdirSync(templatesDir, { recursive: true });

      writeFileSync(
        join(templatesDir, "precond.json"),
        `${JSON.stringify({
          version: "1.0",
          template: "precond",
          description: "Exported from feature: precond",
          exported_at: "2026-01-01T00:00:00.000Z",
          scenarios: [{ id: "pre-1", name: "precondition scenario" }],
        }, null, 2)}\n`,
        "utf8",
      );

      writeFileSync(
        join(cwd, ".forge", "scenarios.json"),
        `${JSON.stringify({ scenarios: [] }, null, 2)}\n`,
        "utf8",
      );

      const result = runForge(cwd, [
        "scenarios:import",
        "--template",
        "precond",
        "--as-given",
      ]);

      expect(result.status).toBe(0);
      const output = parseStdout(result) as Record<string, unknown>;
      expect(output).toMatchObject({ ok: true, imported: 1 });

      const updated = JSON.parse(
        readFileSync(join(cwd, ".forge", "scenarios.json"), "utf8"),
      );
      expect(updated.scenarios[0].type).toBe("given-template");
    });
  });

  test("scenarios:import creates scenarios.json when it does not exist", () => {
    withTempProject((cwd) => {
      const templatesDir = join(cwd, ".forge", "templates");
      mkdirSync(templatesDir, { recursive: true });

      writeFileSync(
        join(templatesDir, "fresh.json"),
        `${JSON.stringify({
          version: "1.0",
          template: "fresh",
          description: "Exported from feature: fresh",
          exported_at: "2026-01-01T00:00:00.000Z",
          scenarios: [{ id: "fresh-1", name: "fresh scenario" }],
        }, null, 2)}\n`,
        "utf8",
      );

      const scenariosPath = join(cwd, ".forge", "scenarios.json");
      expect(existsSync(scenariosPath)).toBe(false);

      const result = runForge(cwd, [
        "scenarios:import",
        "--template",
        "fresh",
      ]);

      expect(result.status).toBe(0);
      const output = parseStdout(result) as Record<string, unknown>;
      expect(output).toMatchObject({ ok: true, imported: 1 });

      expect(existsSync(scenariosPath)).toBe(true);
      const created = JSON.parse(readFileSync(scenariosPath, "utf8"));
      expect(created.scenarios).toHaveLength(1);
    });
  });

  test("scenarios:import fails with exit 1 when template file does not exist", () => {
    withTempProject((cwd) => {
      const result = runForge(cwd, [
        "scenarios:import",
        "--template",
        "nonexistent",
      ]);

      expect(result.status).toBe(1);
      const output = parseStdout(result) as Record<string, unknown>;
      expect(output).toMatchObject({ ok: false });
    });
  });
});
