import { accessSync, constants, existsSync, readFileSync } from "node:fs";
import { delimiter, join } from "node:path";
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

  return {
    default: {
      framework: "unknown",
      command: 'echo "No test command detected"',
      working_dir: ".",
    },
  };
}

export function detectOptionalTool(name: string): boolean {
  const pathValue = process.env.PATH ?? "";
  const extensions = process.platform === "win32" ? ["", ".cmd", ".exe"] : [""];

  for (const directory of pathValue.split(delimiter)) {
    for (const extension of extensions) {
      try {
        accessSync(join(directory, `${name}${extension}`), constants.X_OK);
        return true;
      } catch {
        // Continue checking the rest of PATH.
      }
    }
  }

  return false;
}
