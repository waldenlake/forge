import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

const CLI_BIN = join(import.meta.dirname, "../dist/index.js");

const CONFIG = {
  version: "2.0",
  forge_cli_version: "0.2.0",
  memory_file: "AGENTS.md",
  test_mode: "normal",
  project_type: "existing",
  test_profiles: {
    default: {
      framework: "vitest",
      command: "npx vitest run",
      working_dir: ".",
    },
  },
  guards: {
    "batch-review": {
      enabled: true,
      every_n_tasks: 3,
      actions: ["spec-compliance-review"],
    },
    "security-scan": {
      enabled: true,
      trigger: "keyword",
      keywords: ["token", "auth"],
      severity_threshold: "HIGH",
      actions: ["security-audit"],
    },
  },
};

const PROGRESS_EXECUTING = {
  version: "1.0",
  feature: "user-auth",
  status: "executing",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  spec_path: "spec.md",
  plan_path: "plan.md",
  total_tasks: 6,
  completed_tasks: 2,
  tasks: [
    { id: 1, title: "Setup project", status: "done" },
    { id: 2, title: "Add database", status: "done" },
    { id: 3, title: "Add token refresh", status: "pending" },
    { id: 4, title: "Add UI", status: "pending" },
    { id: 5, title: "Add tests", status: "pending" },
    { id: 6, title: "Final review", status: "pending" },
  ],
  guard_history: [],
  verification: { status: "pending", test_mode: "normal", last_run: null, report_path: null },
};

const PROGRESS_IDLE = {
  version: "1.0",
  feature: null,
  status: "idle",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  spec_path: null,
  plan_path: null,
  total_tasks: 0,
  completed_tasks: 0,
  tasks: [],
  guard_history: [],
  verification: { status: "pending", test_mode: "normal", last_run: null, report_path: null },
};

function runStatus(cwd: string): Record<string, unknown> {
  const result = spawnSync(process.execPath, [CLI_BIN, "status"], {
    cwd,
    encoding: "utf8",
  });
  if (result.error) {
    throw result.error;
  }
  return JSON.parse(result.stdout.trim()) as Record<string, unknown>;
}

function setupForge(tmpDir: string, progress: object): void {
  const forgeDir = join(tmpDir, ".forge");
  mkdirSync(forgeDir, { recursive: true });
  writeFileSync(join(forgeDir, "config.json"), JSON.stringify(CONFIG));
  writeFileSync(join(forgeDir, "progress.json"), JSON.stringify(progress));
}

describe("forge status guard preview", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "forge-status-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("includes guard field when status is executing", () => {
    setupForge(tmpDir, PROGRESS_EXECUTING);
    const output = runStatus(tmpDir);

    expect(output.guard).toBeDefined();
    const guard = output.guard as Record<string, unknown>;
    expect(guard.next_guard_type).toBeDefined();
    expect(typeof guard.tasks_until_guard).toBe("number");
    expect(guard.tasks_until_guard as number).toBeGreaterThanOrEqual(0);
  });

  it("guard.preview.security_scan_will_trigger is true for 'Add token refresh'", () => {
    setupForge(tmpDir, PROGRESS_EXECUTING);
    const output = runStatus(tmpDir);

    const guard = output.guard as Record<string, unknown>;
    const preview = guard.preview as Record<string, unknown>;
    expect(preview.security_scan_will_trigger).toBe(true);
  });

  it("batch-review countdown: every_n_tasks=3, completed=2 → tasks_until_guard=1, due_at_task=3", () => {
    setupForge(tmpDir, PROGRESS_EXECUTING);
    const output = runStatus(tmpDir);

    const guard = output.guard as Record<string, unknown>;
    expect(guard.tasks_until_guard).toBe(1);
    expect(guard.due_at_task).toBe(3);
  });

  it("guard is undefined when status is idle", () => {
    setupForge(tmpDir, PROGRESS_IDLE);
    const output = runStatus(tmpDir);

    expect(output.guard).toBeUndefined();
  });
});
