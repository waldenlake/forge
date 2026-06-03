import type { Command } from "commander";
import {
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { detectBuildCommand } from "../lib/buildCheck.js";
import { git, isGitRepo } from "../lib/git.js";
import {
  gstackContract,
  gstackE2E,
  gstackPerformance,
  gstackSmoke,
  gstackVisual,
  isGstackInstalled,
  type GstackResult,
} from "../lib/gstack.js";
import { runShellCommand, type ShellCommandResult } from "../lib/runner.js";
import { runDependencyAudit } from "../lib/scanners/dependency.js";
import { scanFiles } from "../lib/scanners/security.js";
import type { Severity } from "../lib/scanners/security.js";
import { readConfig, type ForgeConfig } from "../state/config.js";
import {
  type ForgeProgress,
  nowIso,
  readProgress,
  writeProgress,
} from "../state/progress.js";
import {
  runTestProfiles,
  unknownProfile,
  type TestRunResult,
} from "./test.js";

type VerifyCommandOptions = {
  coverage?: boolean;
  plan?: boolean;
};

type FailureClass = "implementation" | "security" | "infra" | null;

type VerifyResultEntry = {
  name: string;
  ok: boolean;
  class: FailureClass;
  skipped?: boolean;
  skip_reason?: string;
  detail?: ShellCommandResult | TestRunResult | GstackResult | unknown;
};

type VerificationReport = {
  ok: boolean;
  status: "passed" | "failed";
  /** Aggregated test profile run (REQUIRED step). */
  tests: TestRunResult;
  /** Build command output (REQUIRED step when a build command is detected). */
  build: ShellCommandResult | null;
  /**
   * Per-step results with failure classification. /verify failure routing in
   * the skill layer:
   *  - any entry with class:"implementation"  → user must fix code (subagent
   *    re-entry path; attempts++).
   *  - any entry with class:"security"        → CVE / discrete bug; route to
   *    /bugfix.
   *  - any entry with class:"infra"           → environment / build tooling
   *    issue, surface verbatim and STOP.
   *  - skipped:true                           → step intentionally not run
   *    (e.g. gstack not installed); does not affect ok.
   *  - class:null                             → step passed.
   */
  results: VerifyResultEntry[];
  /**
   * Highest-priority failure class for the run. The skill consumes this to
   * decide whether to re-enter subagent (implementation), surface to /bugfix
   * (security), STOP (infra), or proceed to phase:verify-pass (null).
   * Priority: security > infra > implementation > null.
   */
  failure_class: FailureClass;
  attempts: number;
  report_path: string;
  duration_ms: number;
};

function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function reportTimestamp(value: string): string {
  return value.replace(/[:.]/g, "-");
}

function verificationProgress(
  progress: ForgeProgress,
  status: ForgeProgress["verification"]["status"],
  update: Partial<ForgeProgress["verification"]> = {},
): ForgeProgress {
  return {
    ...progress,
    updated_at: nowIso(),
    verification: {
      ...progress.verification,
      status,
      ...update,
    },
  };
}

function block(reason: string, extra: Record<string, unknown> = {}): void {
  process.exitCode = 1;
  writeJson({ ok: false, blocked_by: reason, ...extra });
}

const VERIFY_RETRY_LIMIT = 3;

/**
 * Reduce a list of result entries to the highest-priority failure class.
 * Priority: security > infra > implementation > null.
 */
function aggregateFailureClass(results: VerifyResultEntry[]): FailureClass {
  if (results.some((r) => r.class === "security")) return "security";
  if (results.some((r) => r.class === "infra")) return "infra";
  if (results.some((r) => r.class === "implementation")) return "implementation";
  return null;
}

/** Wrap a GstackResult into a VerifyResultEntry tagged with implementation class on failure. */
function gstackResultEntry(name: string, run: GstackResult): VerifyResultEntry {
  return {
    name,
    ok: run.ok,
    class: run.ok ? null : "implementation",
    detail: run,
  };
}

/** Skipped step entry — used when a check is config-disabled or tool missing. */
function skippedEntry(name: string, reason: string): VerifyResultEntry {
  return { name, ok: true, class: null, skipped: true, skip_reason: reason };
}

function verifyConfig(config: ForgeConfig): NonNullable<ForgeConfig["verify"]> {
  return config.verify ?? {};
}

function isEnabled(
  cfg: NonNullable<ForgeConfig["verify"]>,
  key: keyof NonNullable<ForgeConfig["verify"]>,
  defaultValue: boolean,
): boolean {
  const entry = cfg[key];
  if (!entry) return defaultValue;
  return entry.enabled;
}

/**
 * Enumerate scannable source files under cwd. Prefers git ls-files (fast,
 * respects .gitignore); falls back to an empty list outside a git repo so
 * scanFiles is a no-op rather than scanning random binaries.
 */
function listScanTargets(cwd: string): string[] {
  if (!isGitRepo(cwd)) {
    return [];
  }
  const result = git(cwd, ["ls-files"]);
  if (!result.ok) return [];
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((rel) => join(cwd, rel));
}

type VerifyPlanEntry = { name: string; reason?: string };

type VerifyPlan = {
  ok: true;
  plan: {
    will_run: VerifyPlanEntry[];
    will_skip: VerifyPlanEntry[];
    thresholds: {
      coverage_unit: number | null;
      coverage_integration: number | null;
      coverage_e2e: string | null;
      security_severity: string;
      license_allowlist: string[];
      verify_retry_limit: number;
    };
  };
};

/**
 * Compute the verification plan without executing any step. This is a pure
 * read-only inspection of config + environment so users (and the /planning
 * checkpoint) can see exactly what /verify will do before it runs.
 */
function computeVerifyPlan(cwd: string, config: ForgeConfig): VerifyPlan {
  const verifyCfg = verifyConfig(config);
  const willRun: VerifyPlanEntry[] = [];
  const willSkip: VerifyPlanEntry[] = [];

  // Required steps: tests + build always run.
  willRun.push({ name: "tests" });
  const buildCommand = detectBuildCommand(cwd, config);
  if (buildCommand) {
    willRun.push({ name: "build" });
  } else {
    willSkip.push({ name: "build", reason: "no build command detected" });
  }

  // gstack-basic
  if (isEnabled(verifyCfg, "gstack_basic", true)) {
    if (!config.gstack_installed) {
      willSkip.push({ name: "gstack-basic", reason: "gstack_installed is false" });
    } else if (!isGstackInstalled()) {
      willSkip.push({ name: "gstack-basic", reason: "gstack not on PATH" });
    } else {
      willRun.push({ name: "gstack-basic" });
    }
  } else {
    willSkip.push({ name: "gstack-basic", reason: "verify.gstack_basic disabled" });
  }

  // security_scan
  if (isEnabled(verifyCfg, "security_scan", true)) {
    willRun.push({ name: "security_scan" });
  } else {
    willSkip.push({ name: "security_scan", reason: "verify.security_scan disabled" });
  }

  // dependency_audit
  if (isEnabled(verifyCfg, "dependency_audit", true)) {
    willRun.push({ name: "dependency_audit" });
  } else {
    willSkip.push({ name: "dependency_audit", reason: "verify.dependency_audit disabled" });
  }

  // Optional gstack steps (opt-in)
  const optionalGstack: Array<[
    keyof NonNullable<ForgeConfig["verify"]>,
    string,
  ]> = [
    ["e2e", "e2e"],
    ["visual_regression", "visual_regression"],
    ["performance", "performance"],
  ];
  for (const [key, name] of optionalGstack) {
    if (!isEnabled(verifyCfg, key, false)) {
      willSkip.push({ name, reason: `verify.${key} disabled (opt-in)` });
      continue;
    }
    if (!isGstackInstalled()) {
      willSkip.push({ name, reason: "gstack not on PATH" });
      continue;
    }
    willRun.push({ name });
  }

  return {
    ok: true,
    plan: {
      will_run: willRun,
      will_skip: willSkip,
      thresholds: {
        coverage_unit: config.test_coverage?.unit ?? null,
        coverage_integration: config.test_coverage?.integration ?? null,
        coverage_e2e: config.test_coverage?.e2e ?? null,
        security_severity:
          config.guards["security-scan"]?.severity_threshold ?? "HIGH",
        license_allowlist:
          config.guards["dependency-audit"]?.license_allowlist ?? [
            "MIT",
            "Apache-2.0",
            "ISC",
          ],
        verify_retry_limit: VERIFY_RETRY_LIMIT,
      },
    },
  };
}

export function registerVerifyCommand(program: Command): void {
  program
    .command("verify")
    .option("--coverage", "run coverage command when configured")
    .option("--plan", "print verification plan without executing")
    .action((options: VerifyCommandOptions) => {
      const cwd = process.cwd();
      const config = readConfig(cwd);

      // Dry-run: show plan and exit. Does not require execution_complete state.
      if (options.plan) {
        writeJson(computeVerifyPlan(cwd, config));
        return;
      }

      const startedAt = Date.now();
      const progress = readProgress(cwd);
      const profileNames = Object.keys(config.test_profiles);
      const missingProfile = unknownProfile(config, profileNames);

      if (profileNames.length === 0) {
        process.exitCode = 1;
        writeJson({ ok: false, error: "no test profiles configured" });
        return;
      }

      if (missingProfile) {
        process.exitCode = 1;
        writeJson({ ok: false, error: `unknown test profile: ${missingProfile}` });
        return;
      }

      // Entry gate: /verify only runs after /executing has promoted state to
      // execution_complete. Before that, verification is meaningless because
      // the implementation may still be in flight.
      if (progress.status !== "execution_complete") {
        block("status is not execution_complete", {
          from: progress.status,
        });
        return;
      }

      // Retry budget: implementation-class failures should re-enter subagent
      // up to VERIFY_RETRY_LIMIT-1 times. Past that, halt and require human
      // intervention rather than burning resources in a loop.
      const previousAttempts = progress.verification.attempts;
      if (previousAttempts >= VERIFY_RETRY_LIMIT) {
        block("retry_exhausted", {
          attempts: previousAttempts,
          retry_limit: VERIFY_RETRY_LIMIT,
        });
        return;
      }

      writeProgress(
        cwd,
        verificationProgress(progress, "in_progress", {
          last_run: null,
          report_path: null,
        }),
      );

      const verifyCfg = verifyConfig(config);
      const results: VerifyResultEntry[] = [];

      // Step 1: REQUIRED — full test profiles.
      const tests = runTestProfiles(cwd, config, {
        profileNames,
        coverage: options.coverage ?? false,
      });
      results.push({
        name: "tests",
        ok: tests.ok,
        class: tests.ok ? null : "implementation",
        detail: tests,
      });

      // Step 2: REQUIRED — build (when project has a buildable marker).
      const buildCommand = tests.ok ? detectBuildCommand(cwd, config) : null;
      const build = buildCommand
        ? runShellCommand(cwd, buildCommand.working_dir, buildCommand.command)
        : null;
      if (build) {
        results.push({
          name: "build",
          ok: build.ok,
          class: build.ok ? null : "implementation",
          detail: build,
        });
      }

      // Step 3: gstack basic tests (contract + smoke). Default enabled when
      // gstack_installed config flag is true and verify.gstack_basic.enabled
      // is true. If gstack is configured but missing on PATH, mark skipped
      // with a clear reason instead of failing — gstack is recommended but
      // not required.
      if (isEnabled(verifyCfg, "gstack_basic", true) && config.gstack_installed) {
        if (!isGstackInstalled()) {
          results.push(skippedEntry("gstack-contract", "gstack not on PATH"));
          results.push(skippedEntry("gstack-smoke", "gstack not on PATH"));
        } else {
          results.push(gstackResultEntry("gstack-contract", gstackContract(cwd)));
          results.push(gstackResultEntry("gstack-smoke", gstackSmoke(cwd)));
        }
      } else {
        results.push(
          skippedEntry(
            "gstack-basic",
            isEnabled(verifyCfg, "gstack_basic", true)
              ? "gstack_installed is false"
              : "verify.gstack_basic disabled",
          ),
        );
      }

      // Step 4: security scan. Default enabled. Failure → security class.
      // We scan git-tracked files; if not in a git repo, scan a small set of
      // common source patterns under cwd. Empty list → no findings, ok:true.
      if (isEnabled(verifyCfg, "security_scan", true)) {
        const threshold =
          (config.guards["security-scan"]?.severity_threshold ?? "HIGH") as Severity;
        const files = listScanTargets(cwd);
        const scan = scanFiles(files, { severityThreshold: threshold });
        results.push({
          name: "security_scan",
          ok: scan.ok,
          class: scan.ok ? null : "security",
          detail: scan,
        });
      } else {
        results.push(skippedEntry("security_scan", "verify.security_scan disabled"));
      }

      // Step 5: dependency audit. Default enabled. Failure → security class.
      if (isEnabled(verifyCfg, "dependency_audit", true)) {
        const allowlist =
          config.guards["dependency-audit"]?.license_allowlist ?? [
            "MIT",
            "Apache-2.0",
            "ISC",
          ];
        const audit = runDependencyAudit(cwd, [], allowlist);
        results.push({
          name: "dependency_audit",
          ok: audit.ok,
          class: audit.ok ? null : "security",
          detail: audit,
        });
      } else {
        results.push(skippedEntry("dependency_audit", "verify.dependency_audit disabled"));
      }

      // Step 6: gstack E2E / visual / performance — default disabled, opt-in.
      // Each requires gstack installed. If enabled but gstack missing, mark
      // skipped with reason rather than failing.
      const optionalGstack: Array<[
        keyof NonNullable<ForgeConfig["verify"]>,
        string,
        (cwd: string) => GstackResult,
      ]> = [
        ["e2e", "e2e", gstackE2E],
        ["visual_regression", "visual_regression", gstackVisual],
        ["performance", "performance", gstackPerformance],
      ];
      for (const [key, name, fn] of optionalGstack) {
        if (!isEnabled(verifyCfg, key, false)) {
          continue;
        }
        if (!isGstackInstalled()) {
          results.push(skippedEntry(name, "gstack not on PATH"));
          continue;
        }
        results.push(gstackResultEntry(name, fn(cwd)));
      }

      const passed = results.every((r) => r.ok);
      const status = passed ? "passed" : "failed";
      const lastRun = nowIso();
      const reportPath = `.forge/verification-${reportTimestamp(lastRun)}.json`;
      const attempts = passed ? 0 : previousAttempts + 1;
      const failureClass = aggregateFailureClass(results);

      const report: VerificationReport = {
        ok: passed,
        status,
        tests,
        build,
        results,
        failure_class: failureClass,
        attempts,
        report_path: reportPath,
        duration_ms: Date.now() - startedAt,
      };

      mkdirSync(dirname(join(cwd, reportPath)), { recursive: true });
      writeFileSync(
        join(cwd, reportPath),
        `${JSON.stringify(report, null, 2)}\n`,
        "utf8",
      );
      writeProgress(
        cwd,
        verificationProgress(readProgress(cwd), status, {
          attempts,
          last_run: lastRun,
          report_path: reportPath,
        }),
      );

      if (!passed) {
        process.exitCode = 1;
      }
      writeJson(report);
    });
}
