import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
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
 * Scan common monorepo subdirectories for a buildable package.json.
 * Returns the first match, preferring well-known frontend dirs.
 */
function monorepoPackageBuild(root: string): BuildCommand | null {
  const candidates = [
    "frontend", "client", "web", "app", "apps/web", "apps/frontend",
    "packages/ui", "packages/app",
  ];

  for (const dir of candidates) {
    const pkgPath = join(root, dir, "package.json");
    if (!existsSync(pkgPath)) continue;
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
        scripts?: Record<string, unknown>;
      };
      if (typeof pkg.scripts?.build === "string") {
        return { command: "npm run build", working_dir: dir };
      }
    } catch {
      // Skip malformed
    }
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
 * Detect a build command for the project root. Checks config.build_command
 * first (user-configured), then falls back to auto-detection from
 * package.json / go.mod / Cargo.toml, including monorepo subdirectories.
 */
export function detectBuildCommand(root: string, config?: ForgeConfig): BuildCommand | null {
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

  // Monorepo: scan common frontend subdirectories
  const monoBuild = monorepoPackageBuild(root);
  if (monoBuild) return monoBuild;

  return null;
}
