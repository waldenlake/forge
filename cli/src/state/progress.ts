import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateJsonFile } from "../lib/schema.js";

export type ProgressStatus =
  | "idle"
  | "planning"
  | "executing"
  | "execution_complete"
  | "verified";

export type TaskStatus =
  | "pending"
  | "in_progress"
  | "done"
  | "failed"
  | "deferred";

export type VerificationStatus = "pending" | "in_progress" | "passed" | "failed";

export type ForgeTask = {
  id: number;
  title: string;
  status: TaskStatus;
  commit?: string;
  started_at?: string;
  completed_at?: string;
  tags?: string[];
  requires_human_review?: boolean;
  failure_reason?: string;
  defer_reason?: string;
  reset_reason?: string;
};

export type ForgeProgress = {
  version: "1.0";
  feature: string | null;
  status: ProgressStatus;
  created_at: string | null;
  updated_at: string;
  spec_path: string | null;
  plan_path: string | null;
  total_tasks: number;
  completed_tasks: number;
  phase_complete_attempts: number;
  tasks: ForgeTask[];
  guard_history: Array<{
    id: string;
    type: string;
    triggered_at: string;
    task_range?: [number, number];
    status: "passed" | "failed" | "skipped";
    notes?: string;
  }>;
  verification: {
    status: VerificationStatus;
    attempts: number;
    last_run: string | null;
    report_path: string | null;
  };
};

const __dirname = dirname(fileURLToPath(import.meta.url));

function progressSchemaPath(cwd: string): string {
  const projectSchemaPath = join(cwd, "schemas", "progress.schema.json");

  if (existsSync(projectSchemaPath)) {
    return projectSchemaPath;
  }

  return resolve(__dirname, "../../../schemas/progress.schema.json");
}

function validationError(name: string, errors: string[]): Error {
  return new Error(`Invalid ${name}: ${errors.join("; ")}`);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function idleProgress(): ForgeProgress {
  return {
    version: "1.0",
    feature: null,
    status: "idle",
    created_at: null,
    updated_at: nowIso(),
    spec_path: null,
    plan_path: null,
    total_tasks: 0,
    completed_tasks: 0,
    phase_complete_attempts: 0,
    tasks: [],
    guard_history: [],
    verification: {
      status: "pending",
      attempts: 0,
      last_run: null,
      report_path: null,
    },
  };
}

export function progressPath(cwd: string): string {
  return join(cwd, ".forge", "progress.json");
}

export function reportsPath(cwd: string): string {
  return join(cwd, ".forge", "reports");
}

export function assertProgress(
  cwd: string,
  value: unknown,
): asserts value is ForgeProgress {
  const result = validateJsonFile(progressSchemaPath(cwd), value);

  if (!result.ok) {
    throw validationError("progress.json", result.errors);
  }
}

export function readProgress(cwd: string): ForgeProgress {
  const value = JSON.parse(readFileSync(progressPath(cwd), "utf8")) as unknown;
  assertProgress(cwd, value);

  return value;
}

export function writeProgress(cwd: string, progress: unknown): void {
  assertProgress(cwd, progress);

  const targetPath = progressPath(cwd);
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, `${JSON.stringify(progress, null, 2)}\n`, "utf8");
}
