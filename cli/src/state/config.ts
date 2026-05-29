import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateJsonFile } from "../lib/schema.js";
import { FORGE_CLI_VERSION } from "../lib/version.js";

export type MemoryFile = "CLAUDE.md" | "AGENTS.md" | "GEMINI.md";
export type ProjectType = "new" | "existing";

export type TestProfile = {
  framework: string;
  command: string;
  working_dir: string;
  coverage_command?: string;
};

export type VerifyConfig = {
  gstack_basic?: { enabled: boolean };
  security_scan?: { enabled: boolean };
  dependency_audit?: { enabled: boolean };
  e2e?: { enabled: boolean };
  visual_regression?: { enabled: boolean };
  performance?: { enabled: boolean };
};

export type ForgeConfig = {
  version: "2.0";
  forge_cli_version: string;
  memory_file: MemoryFile;
  gstack_installed?: boolean;
  test_coverage?: {
    unit?: number;
    integration?: number;
    e2e?: "P0" | "P0+P1" | "all";
  };
  project_type: ProjectType;
  test_profiles: Record<string, TestProfile>;
  guards: Record<
    string,
    {
      enabled: boolean;
      every_n_tasks?: number;
      trigger?: string;
      keywords?: string[];
      severity_threshold?: string;
      license_allowlist?: string[];
      budgets?: Record<string, number>;
      actions: string[];
    }
  >;
  verify?: VerifyConfig;
};

type DefaultConfigInput = Partial<
  Omit<ForgeConfig, "version" | "forge_cli_version" | "guards" | "verify">
> & {
  guards?: ForgeConfig["guards"];
  verify?: VerifyConfig;
};

const __dirname = dirname(fileURLToPath(import.meta.url));

function configSchemaPath(cwd: string): string {
  const projectSchemaPath = join(cwd, "schemas", "config.schema.json");

  if (existsSync(projectSchemaPath)) {
    return projectSchemaPath;
  }

  return resolve(__dirname, "../../../schemas/config.schema.json");
}

function validationError(name: string, errors: string[]): Error {
  return new Error(`Invalid ${name}: ${errors.join("; ")}`);
}

export function defaultConfig(input: DefaultConfigInput = {}): ForgeConfig {
  return {
    version: "2.0",
    forge_cli_version: FORGE_CLI_VERSION,
    memory_file: input.memory_file ?? "AGENTS.md",
    gstack_installed: input.gstack_installed,
    test_coverage: input.test_coverage,
    project_type: input.project_type ?? "existing",
    test_profiles: input.test_profiles ?? {
      default: {
        framework: "vitest",
        command: "npm test",
        working_dir: ".",
      },
    },
    guards: input.guards ?? {
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
    },
    verify: input.verify ?? {
      gstack_basic: { enabled: true },
      security_scan: { enabled: true },
      dependency_audit: { enabled: true },
      e2e: { enabled: false },
      visual_regression: { enabled: false },
      performance: { enabled: false },
    },
  };
}

export function configPath(cwd: string): string {
  return join(cwd, ".forge", "config.json");
}

export function assertConfig(
  cwd: string,
  value: unknown,
): asserts value is ForgeConfig {
  const result = validateJsonFile(configSchemaPath(cwd), value);

  if (!result.ok) {
    throw validationError("config.json", result.errors);
  }
}

export function readConfig(cwd: string): ForgeConfig {
  const value = JSON.parse(readFileSync(configPath(cwd), "utf8")) as unknown;
  assertConfig(cwd, value);

  return value;
}

export function writeConfig(cwd: string, config: unknown): void {
  assertConfig(cwd, config);

  const targetPath = configPath(cwd);
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}
