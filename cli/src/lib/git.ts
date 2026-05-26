import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

export type GitResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  status: number;
};

export type TaskCommit = {
  hash: string;
  message: string;
  at: string;
};

const dependencyFiles = [
  "package.json",
  "package-lock.json",
  "npm-shrinkwrap.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lock",
  "bun.lockb",
  "Cargo.toml",
  "Cargo.lock",
  "pyproject.toml",
  "poetry.lock",
  "requirements.txt",
  "go.mod",
  "go.sum",
  "Gemfile",
  "Gemfile.lock",
  "composer.json",
  "composer.lock",
];

export function git(cwd: string, args: string[]): GitResult {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
  });
  const status = result.status ?? 1;

  return {
    ok: status === 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr || result.error?.message || "",
    status,
  };
}

export function isGitRepo(cwd: string): boolean {
  const result = git(cwd, ["rev-parse", "--is-inside-work-tree"]);

  return result.ok && result.stdout.trim() === "true";
}

export function gitTopLevel(cwd: string): string | null {
  const result = git(cwd, ["rev-parse", "--show-toplevel"]);
  if (!result.ok) {
    return null;
  }

  return resolve(cwd, result.stdout.trim());
}

export function commitAll(
  cwd: string,
  message: string,
): { ok: true; hash: string; message: string } | { ok: false; error: string } {
  const staged = git(cwd, ["diff", "--cached", "--quiet", "--exit-code"]);
  if (staged.status === 0) {
    return { ok: false, error: "nothing to commit" };
  }

  if (staged.status !== 1) {
    return {
      ok: false,
      error: staged.stderr.trim() || "git diff --cached failed",
    };
  }

  const commit = git(cwd, ["commit", "-m", message]);
  const output = `${commit.stdout}\n${commit.stderr}`;

  if (!commit.ok) {
    return { ok: false, error: output.trim() || "git commit failed" };
  }

  const hash = git(cwd, ["rev-parse", "HEAD"]);
  if (!hash.ok) {
    return { ok: false, error: hash.stderr.trim() || "git rev-parse failed" };
  }

  return { ok: true, hash: hash.stdout.trim(), message };
}

export function findTaskCommit(cwd: string, taskId: number): TaskCommit | null {
  const result = git(cwd, ["log", "--format=%H%x1f%cI%x1f%s"]);
  if (!result.ok) {
    return null;
  }

  const tag = `[forge task-${taskId}]`;
  for (const line of result.stdout.split("\n")) {
    if (!line.includes(tag)) {
      continue;
    }

    const [hash, at, message] = line.split("\x1f");
    if (hash && at && message) {
      return { hash, at, message };
    }
  }

  return null;
}

export function changedDependencyFiles(cwd: string): string[] {
  const result = git(cwd, ["status", "--porcelain", "--", ...dependencyFiles]);
  if (!result.ok) {
    return [];
  }

  const paths = result.stdout
    .split("\n")
    .map((line) => line.slice(3).trim())
    .filter((path) => path.length > 0)
    .map((path) => {
      const renameMarker = " -> ";
      const renameIndex = path.indexOf(renameMarker);

      return renameIndex === -1
        ? path
        : path.slice(renameIndex + renameMarker.length);
    });

  return [...new Set(paths)].sort();
}
