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

function parseStdout(result: ReturnType<typeof runForge>): unknown {
  expect(result.stderr).toBe("");
  return JSON.parse(result.stdout);
}

function setupProject(cwd: string): void {
  mkdirSync(join(cwd, ".forge"), { recursive: true });

  const config = {
    version: "2.0",
    forge_cli_version: "0.2.0",
    memory_file: "AGENTS.md",
    project_type: "existing",
    test_profiles: {
      default: {
        framework: "vitest",
        command: "echo 'tests pass'",
        working_dir: ".",
      },
    },
    test_coverage: { unit: 80, integration: 60 },
    guards: {
      "batch-review": {
        enabled: true,
        every_n_tasks: 3,
        actions: ["spec-compliance-review"],
      },
      "security-scan": {
        enabled: true,
        trigger: "keyword",
        keywords: ["auth", "token"],
        severity_threshold: "HIGH",
        actions: ["security-audit"],
      },
      "dependency-audit": {
        enabled: true,
        trigger: "new-dependency",
        actions: ["dependency-check"],
        license_allowlist: ["MIT", "Apache-2.0", "ISC"],
      },
      "coverage-gate": {
        enabled: true,
        trigger: "phase-complete",
        actions: ["coverage-check"],
      },
    },
  };

  const progress = {
    version: "1.0",
    feature: "auth-module",
    status: "executing",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    spec_path: "spec.md",
    plan_path: "plan.md",
    total_tasks: 3,
    completed_tasks: 2,
    phase_complete_attempts: 0,
    tasks: [
      { id: 1, title: "Setup", status: "done" },
      { id: 2, title: "Add database", status: "done" },
      { id: 3, title: "Add auth token endpoint", status: "pending" },
    ],
    guard_history: [],
    verification: {
      status: "pending",
      attempts: 0,
      last_run: null,
      report_path: null,
    },
  };

  writeFileSync(
    join(cwd, ".forge", "config.json"),
    `${JSON.stringify(config, null, 2)}\n`,
    "utf8",
  );

  writeFileSync(
    join(cwd, ".forge", "progress.json"),
    `${JSON.stringify(progress, null, 2)}\n`,
    "utf8",
  );
}

describe("round 2 integration tests", () => {
  test("full guard workflow: preview → security-scan → record → history", () => {
    const cwd = mkdtempSync(join(tmpdir(), "forge-round2-guard-"));
    try {
      setupProject(cwd);

      // Step 1: guard:preview for the auth token task
      const previewResult = runForge(cwd, [
        "guard:preview",
        "--next-task-id",
        "3",
        "--next-task-title",
        "Add auth token endpoint",
      ]);
      expect(previewResult.status).toBe(0);
      const preview = parseStdout(previewResult) as Record<string, unknown>;
      expect(preview.ok).toBe(true);
      expect(preview.guard_triggered).toBe(true);
      const guards = preview.guards as Array<Record<string, unknown>>;
      expect(guards.some((g) => g["type"] === "security-scan")).toBe(true);

      // Step 2: Write a file with a detectable secret pattern and run security-scan
      // Using an obviously fake value that matches the jwt-secret rule pattern
      writeFileSync(
        join(cwd, "auth.ts"),
        `// Auth module\nconst jwt_secret = "test-value-here";\n`,
        "utf8",
      );

      const scanResult = runForge(cwd, [
        "guard:security-scan",
        "--files",
        "auth.ts",
      ]);
      expect(scanResult.status).toBe(1);
      const scan = parseStdout(scanResult) as Record<string, unknown>;
      expect(scan.ok).toBe(false);
      const findings = scan.findings as unknown[];
      expect(findings.length).toBeGreaterThan(0);

      // Step 3: Record the guard result
      const recordResult = runForge(cwd, [
        "guard:record",
        "--type",
        "security-scan",
        "--status",
        "failed",
        "--tasks",
        "3",
        "--notes",
        "Found hardcoded secret",
      ]);
      expect(recordResult.status).toBe(0);
      const record = parseStdout(recordResult) as Record<string, unknown>;
      expect(record.ok).toBe(true);

      // Step 4: Verify history
      const historyResult = runForge(cwd, ["guard:history"]);
      expect(historyResult.status).toBe(0);
      const history = parseStdout(historyResult) as Record<string, unknown>;
      expect(history.ok).toBe(true);
      const historyGuards = history.guards as Array<Record<string, unknown>>;
      expect(historyGuards.length).toBe(1);
      expect(historyGuards[0]["type"]).toBe("security-scan");
      expect(historyGuards[0]["status"]).toBe("failed");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("coverage-gate checks real Istanbul report", () => {
    const cwd = mkdtempSync(join(tmpdir(), "forge-round2-coverage-"));
    try {
      setupProject(cwd);

      // Write an Istanbul coverage-summary.json with 90% lines, 80% branches
      mkdirSync(join(cwd, "coverage"), { recursive: true });
      const coverageSummary = {
        total: {
          lines: { pct: 90 },
          statements: { pct: 88 },
          functions: { pct: 85 },
          branches: { pct: 80 },
        },
      };
      writeFileSync(
        join(cwd, "coverage", "coverage-summary.json"),
        `${JSON.stringify(coverageSummary, null, 2)}\n`,
        "utf8",
      );

      const result = runForge(cwd, ["guard:coverage-check"]);
      expect(result.status).toBe(0);
      const payload = parseStdout(result) as Record<string, unknown>;
      expect(payload.ok).toBe(true);

      const coverage = payload.coverage as Record<
        string,
        { value: number; target: number; ok: boolean }
      >;
      // unit coverage = lines pct (90), target = 80
      expect(coverage.unit.value).toBe(90);
      expect(coverage.unit.target).toBe(80);
      expect(coverage.unit.ok).toBe(true);
      // integration coverage = branches pct (80), target = 60
      expect(coverage.integration.value).toBe(80);
      expect(coverage.integration.target).toBe(60);
      expect(coverage.integration.ok).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("scenarios export/import round-trip", () => {
    const cwd = mkdtempSync(join(tmpdir(), "forge-round2-scenarios-"));
    try {
      setupProject(cwd);

      // Write initial scenarios.json with 2 scenarios
      const initialScenarios = {
        scenarios: [
          { id: "sc-1", name: "happy path login", type: "positive" },
          { id: "sc-2", name: "invalid credentials", type: "negative" },
        ],
      };
      writeFileSync(
        join(cwd, ".forge", "scenarios.json"),
        `${JSON.stringify(initialScenarios, null, 2)}\n`,
        "utf8",
      );

      // Export to a template
      const exportResult = runForge(cwd, [
        "scenarios:export",
        "--feature",
        "auth-module",
        "--template",
        "auth-base",
      ]);
      expect(exportResult.status).toBe(0);
      const exportPayload = parseStdout(exportResult) as Record<
        string,
        unknown
      >;
      expect(exportPayload.ok).toBe(true);

      // Clear scenarios.json to empty array
      writeFileSync(
        join(cwd, ".forge", "scenarios.json"),
        `${JSON.stringify({ scenarios: [] }, null, 2)}\n`,
        "utf8",
      );

      // Import from template
      const importResult = runForge(cwd, [
        "scenarios:import",
        "--template",
        "auth-base",
      ]);
      expect(importResult.status).toBe(0);
      const importPayload = parseStdout(importResult) as Record<
        string,
        unknown
      >;
      expect(importPayload.ok).toBe(true);
      expect(importPayload.imported).toBe(2);

      // Verify scenarios.json now has 2 scenarios
      const restored = JSON.parse(
        readFileSync(join(cwd, ".forge", "scenarios.json"), "utf8"),
      ) as { scenarios: unknown[] };
      expect(restored.scenarios).toHaveLength(2);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("status shows guard preview with countdown", () => {
    const cwd = mkdtempSync(join(tmpdir(), "forge-round2-status-"));
    try {
      setupProject(cwd);

      const result = runForge(cwd, ["status"]);
      expect(result.status).toBe(0);
      const payload = parseStdout(result) as Record<string, unknown>;
      expect(payload.ok).toBe(true);

      // Guard preview should be present since status is 'executing' with a pending task
      expect(payload.guard).toBeDefined();
      const guard = payload.guard as Record<string, unknown>;
      const preview = guard.preview as Record<string, boolean>;
      // The next task title contains "auth" which is in keywords → security_scan_will_trigger=true
      expect(preview.security_scan_will_trigger).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
