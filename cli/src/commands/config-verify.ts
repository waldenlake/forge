import type { Command } from "commander";
import { readConfig, writeConfig, type ForgeConfig } from "../state/config.js";

const VERIFY_KEYS = [
  "gstack_basic",
  "security_scan",
  "dependency_audit",
  "e2e",
  "visual_regression",
  "performance",
] as const;

type VerifyKey = (typeof VERIFY_KEYS)[number];

const SECURITY_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
type SecuritySeverity = (typeof SECURITY_SEVERITIES)[number];

type ConfigVerifyOptions = {
  show?: boolean;
  enable?: string;
  disable?: string;
  coverageUnit?: string;
  coverageIntegration?: string;
  coverageE2e?: string;
  securitySeverity?: string;
  licenseAllowlist?: string;
};

function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function fail(error: string): void {
  process.exitCode = 1;
  writeJson({ ok: false, error });
}

function parseList(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function parseCoverage(value: string): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    return null;
  }
  return n;
}

function parseVerifyKeys(value: string): VerifyKey[] | string {
  const items = parseList(value);
  const invalid = items.filter((v) => !VERIFY_KEYS.includes(v as VerifyKey));
  if (invalid.length > 0) {
    return `unknown verify key(s): ${invalid.join(", ")} (valid: ${VERIFY_KEYS.join(", ")})`;
  }
  return items as VerifyKey[];
}

function summarize(config: ForgeConfig): Record<string, unknown> {
  const verify = config.verify ?? {};
  return {
    verify: {
      gstack_basic: verify.gstack_basic?.enabled ?? true,
      security_scan: verify.security_scan?.enabled ?? true,
      dependency_audit: verify.dependency_audit?.enabled ?? true,
      e2e: verify.e2e?.enabled ?? false,
      visual_regression: verify.visual_regression?.enabled ?? false,
      performance: verify.performance?.enabled ?? false,
    },
    coverage: {
      unit: config.test_coverage?.unit ?? null,
      integration: config.test_coverage?.integration ?? null,
      e2e: config.test_coverage?.e2e ?? null,
    },
    security: {
      severity_threshold:
        config.guards["security-scan"]?.severity_threshold ?? "HIGH",
    },
    dependency: {
      license_allowlist:
        config.guards["dependency-audit"]?.license_allowlist ?? [
          "MIT",
          "Apache-2.0",
          "ISC",
        ],
    },
  };
}

export function registerConfigVerifyCommand(program: Command): void {
  program
    .command("config:verify")
    .description("inspect or modify verify-phase configuration")
    .option("--show", "print current verify config without modifying it")
    .option("--enable <names>", "comma-separated verify keys to enable")
    .option("--disable <names>", "comma-separated verify keys to disable")
    .option("--coverage-unit <pct>", "unit-test coverage threshold (0-100)")
    .option("--coverage-integration <pct>", "integration-test coverage threshold (0-100)")
    .option("--coverage-e2e <level>", "e2e coverage level (P0 | P0+P1 | all)")
    .option("--security-severity <level>", "security threshold (LOW|MEDIUM|HIGH|CRITICAL)")
    .option("--license-allowlist <list>", "comma-separated SPDX license identifiers")
    .action((options: ConfigVerifyOptions) => {
      const cwd = process.cwd();
      let config: ForgeConfig;

      try {
        config = readConfig(cwd);
      } catch (e) {
        fail(`config.json read error: ${(e as Error).message}`);
        return;
      }

      // --show is read-only; print and exit.
      if (options.show) {
        writeJson({ ok: true, config: summarize(config) });
        return;
      }

      // Mutating path: validate all inputs, then build a new config object.
      const next: ForgeConfig = JSON.parse(JSON.stringify(config));
      next.verify = next.verify ?? {};

      // --enable
      if (options.enable) {
        const parsed = parseVerifyKeys(options.enable);
        if (typeof parsed === "string") {
          fail(parsed);
          return;
        }
        for (const key of parsed) {
          next.verify[key] = { enabled: true };
        }
      }

      // --disable
      if (options.disable) {
        const parsed = parseVerifyKeys(options.disable);
        if (typeof parsed === "string") {
          fail(parsed);
          return;
        }
        for (const key of parsed) {
          next.verify[key] = { enabled: false };
        }
      }

      // --coverage-unit / --coverage-integration
      if (options.coverageUnit !== undefined) {
        const n = parseCoverage(options.coverageUnit);
        if (n === null) {
          fail(`invalid coverage-unit: ${options.coverageUnit} (must be 0-100)`);
          return;
        }
        next.test_coverage = { ...(next.test_coverage ?? {}), unit: n };
      }
      if (options.coverageIntegration !== undefined) {
        const n = parseCoverage(options.coverageIntegration);
        if (n === null) {
          fail(`invalid coverage-integration: ${options.coverageIntegration} (must be 0-100)`);
          return;
        }
        next.test_coverage = { ...(next.test_coverage ?? {}), integration: n };
      }
      if (options.coverageE2e !== undefined) {
        const v = options.coverageE2e;
        if (v !== "P0" && v !== "P0+P1" && v !== "all") {
          fail(`invalid coverage-e2e: ${v} (must be P0 | P0+P1 | all)`);
          return;
        }
        next.test_coverage = { ...(next.test_coverage ?? {}), e2e: v };
      }

      // --security-severity
      if (options.securitySeverity !== undefined) {
        const v = options.securitySeverity.toUpperCase() as SecuritySeverity;
        if (!SECURITY_SEVERITIES.includes(v)) {
          fail(
            `invalid security-severity: ${options.securitySeverity} (must be ${SECURITY_SEVERITIES.join("|")})`,
          );
          return;
        }
        const guard = next.guards["security-scan"] ?? {
          enabled: true,
          actions: ["security-audit"],
        };
        next.guards["security-scan"] = {
          ...guard,
          severity_threshold: v,
        };
      }

      // --license-allowlist
      if (options.licenseAllowlist !== undefined) {
        const list = parseList(options.licenseAllowlist);
        if (list.length === 0) {
          fail("license-allowlist must contain at least one SPDX identifier");
          return;
        }
        const guard = next.guards["dependency-audit"] ?? {
          enabled: true,
          actions: ["dependency-check"],
        };
        next.guards["dependency-audit"] = {
          ...guard,
          license_allowlist: list,
        };
      }

      // Persist (assertConfig validates against the schema)
      try {
        writeConfig(cwd, next);
      } catch (e) {
        fail(`config.json write error: ${(e as Error).message}`);
        return;
      }

      writeJson({ ok: true, config: summarize(next) });
    });
}
