import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { detectMonorepoProfiles, type MonorepoDetectResult } from "./detect.js";
import type { ForgeConfig } from "../state/config.js";

export type BuildCommand = {
  command: string;
  working_dir: string;
};

function packageBuildCommand(root: string): BuildCommand | null {
  const packageJsonPath = join(root, "package.json");
  if (!existsSync(packageJsonPath)) {
    return null;
  }

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      scripts?: Record<string, unknown>;
    };

    if (typeof packageJson.scripts?.build === "string") {
      return { command: "npm run build", working_dir: "." };
    }
  } catch {
    // Malformed package.json
  }

  return null;
}

/**
 * Detect Go build targets. `go build ./...` builds everything, but also
 * check for common cmd/ directories that indicate specific build targets.
 */
function goBuildCommand(root: string): BuildCommand | null {
  if (!existsSync(join(root, "go.mod"))) return null;

  // Check for cmd/ directory with main packages
  const cmdDir = join(root, "cmd");
  if (existsSync(cmdDir)) {
    try {
      const entries = readdirSync(cmdDir, { withFileTypes: true });
      const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
      if (dirs.length === 1) {
        return { command: `go build ./cmd/${dirs[0]}/`, working_dir: "." };
      }
    } catch {
      // Fall through to generic
    }
  }

  return { command: "go build ./...", working_dir: "." };
}

/**
 * Detect a build command for the project root. Resolution order:
 *   1. config.build_command (user-configured override)
 *   2. root-level auto-detection (package.json / go.mod / Cargo.toml)
 *   3. monorepo workspace build — sourced from detectMonorepoProfiles, the
 *      SINGLE authority for monorepo structure. No static candidate table.
 *
 * The optional `monorepo` argument lets callers that already have a workspace
 * scan (e.g. the snapshot layer) reuse it instead of scanning again:
 *   - undefined → this function scans once via detectMonorepoProfiles(root)
 *   - null      → caller asserts "not a monorepo"; skip the workspace probe
 *   - object    → reuse the caller's result
 */
export function detectBuildCommand(
  root: string,
  config?: ForgeConfig,
  monorepo?: MonorepoDetectResult | null,
): BuildCommand | null {
  if (config?.build_command) {
    return config.build_command;
  }

  const npmBuild = packageBuildCommand(root);
  if (npmBuild) return npmBuild;

  const goBuild = goBuildCommand(root);
  if (goBuild) return goBuild;

  if (existsSync(join(root, "Cargo.toml"))) {
    return { command: "cargo build", working_dir: "." };
  }

  // Monorepo build: use the authoritative workspace scan as the single source
  // of truth. Each profile already carries the build command detected in the
  // same package.json read that produced its test command, so build and test
  // cannot drift.
  const mono = monorepo === undefined ? detectMonorepoProfiles(root) : monorepo;
  if (mono?.monorepo) {
    for (const profile of mono.detected_profiles) {
      if (profile.build_command) {
        return { command: profile.build_command, working_dir: profile.working_dir };
      }
    }
  }

  return null;
}
