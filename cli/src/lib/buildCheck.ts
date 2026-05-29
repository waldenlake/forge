import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type BuildCommand = {
  command: string;
  working_dir: string;
};

function packageBuildCommand(root: string): BuildCommand | null {
  const packageJsonPath = join(root, "package.json");
  if (!existsSync(packageJsonPath)) {
    return null;
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
    scripts?: Record<string, unknown>;
  };

  if (typeof packageJson.scripts?.build === "string") {
    return { command: "npm run build", working_dir: "." };
  }

  return null;
}

/**
 * Detect a build command for the project root by inspecting package.json /
 * go.mod / Cargo.toml in priority order. Returns null when no buildable
 * project marker is present (the caller may treat absence as a soft skip).
 *
 * Used by both `forge verify` and `phase:complete` so the build invariant is
 * applied identically on both entry and exit of the executing phase.
 */
export function detectBuildCommand(root: string): BuildCommand | null {
  const npmBuild = packageBuildCommand(root);
  if (npmBuild) {
    return npmBuild;
  }

  if (existsSync(join(root, "go.mod"))) {
    return { command: "go build ./...", working_dir: "." };
  }

  if (existsSync(join(root, "Cargo.toml"))) {
    return { command: "cargo build", working_dir: "." };
  }

  return null;
}
