import { spawnSync } from "node:child_process";
import { accessSync, constants, existsSync, readFileSync, readdirSync } from "node:fs";
import { delimiter, join, relative, sep } from "node:path";
import { parse as parseYaml } from "yaml";
import type { MemoryFile, ProjectType, TestProfile } from "../state/config.js";

type PackageJson = {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function readPackageJson(cwd: string): PackageJson | null {
  const packagePath = join(cwd, "package.json");

  if (!existsSync(packagePath)) {
    return null;
  }

  return JSON.parse(readFileSync(packagePath, "utf8")) as PackageJson;
}

function hasDependency(packageJson: PackageJson, name: string): boolean {
  return Boolean(
    packageJson.dependencies?.[name] ?? packageJson.devDependencies?.[name],
  );
}

function frameworkFromScript(script: string): string {
  if (/\bvitest\b/.test(script)) {
    return "vitest";
  }

  if (/\bjest\b/.test(script)) {
    return "jest";
  }

  if (/\bpytest\b/.test(script)) {
    return "pytest";
  }

  return "npm";
}

export function detectProjectType(cwd: string): ProjectType {
  return existsSync(join(cwd, ".git")) ? "existing" : "new";
}

export function detectMemoryFile(cwd: string): MemoryFile {
  for (const name of ["CLAUDE.md", "AGENTS.md", "GEMINI.md"] as const) {
    if (existsSync(join(cwd, name))) {
      return name;
    }
  }

  if (process.env.CLAUDE_PLUGIN_ROOT) {
    return "CLAUDE.md";
  }

  if (process.env.GEMINI_CLI) {
    return "GEMINI.md";
  }

  return "AGENTS.md";
}

export function detectTestProfiles(cwd: string): Record<string, TestProfile> {
  const packageJson = readPackageJson(cwd);

  if (packageJson) {
    if (hasDependency(packageJson, "vitest")) {
      return {
        default: {
          framework: "vitest",
          command: "npx vitest run",
          working_dir: ".",
          coverage_command: "npx vitest run --coverage",
        },
      };
    }

    if (hasDependency(packageJson, "jest")) {
      return {
        default: {
          framework: "jest",
          command: "npx jest",
          working_dir: ".",
        },
      };
    }

    if (packageJson.scripts?.test) {
      return {
        default: {
          framework: frameworkFromScript(packageJson.scripts.test),
          command: "npm test",
          working_dir: ".",
        },
      };
    }
  }

  if (existsSync(join(cwd, "go.mod"))) {
    return {
      default: {
        framework: "go",
        command: "go test ./...",
        working_dir: ".",
      },
    };
  }

  if (existsSync(join(cwd, "Cargo.toml"))) {
    return {
      default: {
        framework: "cargo",
        command: "cargo test",
        working_dir: ".",
      },
    };
  }

  if (existsSync(join(cwd, "pyproject.toml")) || existsSync(join(cwd, "pytest.ini"))) {
    return {
      default: {
        framework: "pytest",
        command: "pytest",
        working_dir: ".",
      },
    };
  }

  // Nested Python project (e.g. backend/, server/, api/, app/, src/) — common
  // monorepo layout where the JS root has no Python markers but a sub-tree
  // is the actual Python project. Walk one level deep looking for pyproject
  // or pytest config + a tests/ directory; if both exist, point pytest at
  // that working_dir instead of returning a useless echo placeholder.
  const pythonHints = ["backend", "server", "api", "app", "src", "python"];
  for (const hint of pythonHints) {
    const dir = join(cwd, hint);
    if (!existsSync(dir)) continue;
    const hasMarker =
      existsSync(join(dir, "pyproject.toml")) ||
      existsSync(join(dir, "pytest.ini")) ||
      existsSync(join(dir, "setup.py")) ||
      existsSync(join(dir, "tests"));
    if (hasMarker) {
      return {
        default: {
          framework: "pytest",
          command: "pytest",
          working_dir: hint,
        },
      };
    }
  }

  return {
    default: {
      framework: "unknown",
      command: 'echo "No test command detected"',
      working_dir: ".",
    },
  };
}

export type MonorepoDetectResult = {
  monorepo: boolean;
  monorepo_type: "pnpm" | "lerna" | "nx" | "turbo" | "yarn" | null;
  detected_profiles: Array<{
    name: string;
    framework: string;
    working_dir: string;
    command: string;
    coverage_command?: string;
    /**
     * Build command for this workspace, detected in the SAME package.json
     * read that produced the test command. Present only when the workspace
     * declares a build (npm scripts.build / go.mod / Cargo.toml). This makes
     * build and test commands share one scan — they cannot drift.
     */
    build_command?: string;
  }>;
};

type WorkspacePackageJson = PackageJson & {
  name?: string;
  workspaces?: string[] | { packages: string[] };
};

function resolveGlobDirs(cwd: string, pattern: string): string[] {
  // Support simple patterns like "packages/*" or "apps/*"
  // Only handles one-level wildcard (the common case for monorepos)
  const normalized = pattern.replace(/\\/g, "/").replace(/\/?$/, "");

  if (normalized.endsWith("/*")) {
    const parentDir = normalized.slice(0, -2);
    const parentPath = join(cwd, parentDir);

    if (!existsSync(parentPath)) {
      return [];
    }

    try {
      return readdirSync(parentPath, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(parentPath, entry.name));
    } catch {
      return [];
    }
  }

  // Exact directory (no wildcard)
  const dirPath = join(cwd, normalized);
  return existsSync(dirPath) ? [dirPath] : [];
}

function detectWorkspaceFramework(
  workspaceDir: string,
): {
  framework: string;
  command: string;
  coverage_command?: string;
  build_command?: string;
} {
  const pkgPath = join(workspaceDir, "package.json");

  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as PackageJson;

    // Build command comes from the SAME package.json read as the test
    // command, so a workspace's build and test detection share one scan.
    const buildField = pkg.scripts?.build;
    const build_command =
      typeof buildField === "string" && buildField.length > 0
        ? "npm run build"
        : undefined;
    const withBuild = build_command ? { build_command } : {};

    if (hasDependency(pkg, "vitest")) {
      return {
        framework: "vitest",
        command: "npx vitest run",
        coverage_command: "npx vitest run --coverage",
        ...withBuild,
      };
    }

    if (hasDependency(pkg, "jest")) {
      return { framework: "jest", command: "npx jest", ...withBuild };
    }

    if (pkg.scripts?.test) {
      return { framework: "unknown", command: "npm test", ...withBuild };
    }

    // package.json present with a build but no test marker: still surface the
    // build command so monorepo build detection isn't lost.
    if (build_command) {
      return { framework: "unknown", command: "npm test", build_command };
    }
  }

  if (existsSync(join(workspaceDir, "go.mod"))) {
    return {
      framework: "go",
      command: "go test ./...",
      build_command: "go build ./...",
    };
  }

  if (existsSync(join(workspaceDir, "Cargo.toml"))) {
    return {
      framework: "cargo",
      command: "cargo test",
      build_command: "cargo build",
    };
  }

  return { framework: "unknown", command: "npm test" };
}

function toForwardSlash(p: string): string {
  return p.split(sep).join("/");
}

export function detectMonorepoProfiles(cwd: string): MonorepoDetectResult {
  const none: MonorepoDetectResult = {
    monorepo: false,
    monorepo_type: null,
    detected_profiles: [],
  };

  // pnpm
  const pnpmWorkspacePath = join(cwd, "pnpm-workspace.yaml");
  if (existsSync(pnpmWorkspacePath)) {
    const raw = readFileSync(pnpmWorkspacePath, "utf8");
    const parsed = parseYaml(raw) as { packages?: string[] } | null;
    const patterns: string[] = parsed?.packages ?? [];
    const dirs = patterns.flatMap((p) => resolveGlobDirs(cwd, p));
    const profiles = dirs.map((dir) => {
      const fw = detectWorkspaceFramework(dir);
      const relPath = toForwardSlash(relative(cwd, dir));
      const name = relPath.split("/").pop() ?? relPath;
      return { name, working_dir: relPath, ...fw };
    });
    return { monorepo: true, monorepo_type: "pnpm", detected_profiles: profiles };
  }

  // turbo
  if (existsSync(join(cwd, "turbo.json"))) {
    return { monorepo: true, monorepo_type: "turbo", detected_profiles: [] };
  }

  // nx
  if (existsSync(join(cwd, "nx.json"))) {
    return { monorepo: true, monorepo_type: "nx", detected_profiles: [] };
  }

  // lerna
  const lernaPath = join(cwd, "lerna.json");
  if (existsSync(lernaPath)) {
    const parsed = JSON.parse(readFileSync(lernaPath, "utf8")) as {
      packages?: string[];
    };
    const patterns: string[] = parsed.packages ?? ["packages/*"];
    const dirs = patterns.flatMap((p) => resolveGlobDirs(cwd, p));
    const profiles = dirs.map((dir) => {
      const fw = detectWorkspaceFramework(dir);
      const relPath = toForwardSlash(relative(cwd, dir));
      const name = relPath.split("/").pop() ?? relPath;
      return { name, working_dir: relPath, ...fw };
    });
    return { monorepo: true, monorepo_type: "lerna", detected_profiles: profiles };
  }

  // yarn / npm workspaces in package.json
  const pkgPath = join(cwd, "package.json");
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as WorkspacePackageJson;

    if (pkg.workspaces) {
      const patterns: string[] = Array.isArray(pkg.workspaces)
        ? pkg.workspaces
        : pkg.workspaces.packages;
      const dirs = patterns.flatMap((p) => resolveGlobDirs(cwd, p));
      const profiles = dirs.map((dir) => {
        const fw = detectWorkspaceFramework(dir);
        const relPath = toForwardSlash(relative(cwd, dir));
        const name = relPath.split("/").pop() ?? relPath;
        return { name, working_dir: relPath, ...fw };
      });
      return { monorepo: true, monorepo_type: "yarn", detected_profiles: profiles };
    }
  }

  return none;
}

export function detectOptionalTool(name: string): boolean {
  // Strategy 1: scan PATH directories (fast, no subprocess)
  const pathValue = process.env.PATH ?? "";
  const extensions = process.platform === "win32" ? ["", ".cmd", ".exe", ".bat"] : [""];

  for (const directory of pathValue.split(delimiter)) {
    for (const extension of extensions) {
      try {
        accessSync(join(directory, `${name}${extension}`), constants.R_OK);
        return true;
      } catch {
        // Continue checking the rest of PATH.
      }
    }
  }

  // Strategy 2: try spawning the command directly (catches tools installed
  // in locations not on the current PATH, e.g. when OpenCode or other
  // platforms launch subprocesses with a restricted PATH)
  try {
    const result = spawnSync(name, ["--version"], {
      encoding: "utf8",
      timeout: 5_000,
      stdio: "pipe",
      windowsHide: true,
      shell: true,
    });
    if (result.status === 0) return true;
  } catch {
    // Not found
  }

  return false;
}
