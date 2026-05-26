import {
  assertConfig,
  defaultConfig,
  type ForgeConfig,
  type MemoryFile,
  type ProjectType,
} from "../state/config.js";

type LegacyConfig = {
  memory_file?: unknown;
  test_mode?: unknown;
  gstack_installed?: unknown;
  project_type?: unknown;
  test_command?: unknown;
  test_framework?: unknown;
  guards?: unknown;
};

function validMemoryFile(value: unknown): value is MemoryFile {
  return value === "CLAUDE.md" || value === "AGENTS.md" || value === "GEMINI.md";
}

function validProjectType(value: unknown): value is ProjectType {
  return value === "new" || value === "existing";
}

function validTestMode(value: unknown): value is ForgeConfig["test_mode"] {
  return value === "normal" || value === "enhanced";
}

function legacyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isIntegerRecord(value: unknown): value is Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every(
    (item) => Number.isInteger(item) && item >= 0,
  );
}

function isV2Guard(value: unknown): value is ForgeConfig["guards"][string] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const guard = value as Record<string, unknown>;
  const allowedKeys = new Set([
    "enabled",
    "every_n_tasks",
    "trigger",
    "keywords",
    "severity_threshold",
    "license_allowlist",
    "budgets",
    "actions",
  ]);

  if (Object.keys(guard).some((key) => !allowedKeys.has(key))) {
    return false;
  }

  if (typeof guard.enabled !== "boolean" || !isStringArray(guard.actions)) {
    return false;
  }

  if (
    guard.every_n_tasks !== undefined &&
    (typeof guard.every_n_tasks !== "number" ||
      !Number.isInteger(guard.every_n_tasks) ||
      guard.every_n_tasks < 1)
  ) {
    return false;
  }

  if (guard.trigger !== undefined && typeof guard.trigger !== "string") {
    return false;
  }

  if (guard.keywords !== undefined && !isStringArray(guard.keywords)) {
    return false;
  }

  if (
    guard.severity_threshold !== undefined &&
    typeof guard.severity_threshold !== "string"
  ) {
    return false;
  }

  if (
    guard.license_allowlist !== undefined &&
    !isStringArray(guard.license_allowlist)
  ) {
    return false;
  }

  if (guard.budgets !== undefined && !isIntegerRecord(guard.budgets)) {
    return false;
  }

  return true;
}

function legacyGuards(value: unknown): ForgeConfig["guards"] | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const guards = value as Record<string, unknown>;
  if (Object.values(guards).every(isV2Guard)) {
    return guards as ForgeConfig["guards"];
  }

  return undefined;
}

export function migrateConfig1To2(cwd: string, value: unknown): ForgeConfig {
  const legacy = (value ?? {}) as LegacyConfig;
  const defaults = defaultConfig();

  const nextConfig = defaultConfig({
    memory_file: validMemoryFile(legacy.memory_file)
      ? legacy.memory_file
      : defaults.memory_file,
    test_mode: validTestMode(legacy.test_mode)
      ? legacy.test_mode
      : defaults.test_mode,
    gstack_installed:
      typeof legacy.gstack_installed === "boolean"
        ? legacy.gstack_installed
        : defaults.gstack_installed,
    project_type: validProjectType(legacy.project_type)
      ? legacy.project_type
      : defaults.project_type,
    test_profiles: {
      default: {
        framework:
          legacyString(legacy.test_framework) ??
          defaults.test_profiles.default.framework,
        command:
          legacyString(legacy.test_command) ??
          defaults.test_profiles.default.command,
        working_dir: ".",
      },
    },
    guards: legacyGuards(legacy.guards) ?? defaults.guards,
  });

  assertConfig(cwd, nextConfig);
  return nextConfig;
}
