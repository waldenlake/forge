import { git, isGitRepo } from "./git.js";

export type WorkingTreeCheck =
  | { ok: true; clean: true }
  | { ok: true; clean: false; dirty_paths: string[] }
  | { ok: false; error: string };

/**
 * Returns whether the worktree at `cwd` is clean.
 *
 * - Outside a git repo: returns ok:true clean:true (we cannot enforce a
 *   working-tree invariant where there is no working tree).
 * - In-repo with no diff: clean:true.
 * - In-repo with uncommitted changes: clean:false + dirty_paths capped at 50
 *   entries so the JSON payload stays bounded.
 * - git invocation failure: ok:false (treat as a hard verification error).
 *
 * Used by `phase:complete` to enforce the gate "no uncommitted changes" before
 * promoting to execution_complete.
 */
export function isWorkingTreeClean(cwd: string): WorkingTreeCheck {
  if (!isGitRepo(cwd)) {
    return { ok: true, clean: true };
  }

  const result = git(cwd, ["status", "--porcelain"]);
  if (!result.ok) {
    return {
      ok: false,
      error: result.stderr.trim() || "git status failed",
    };
  }

  const lines = result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return { ok: true, clean: true };
  }

  // Strip the 2-char status prefix to surface the path in dirty_paths.
  const dirtyPaths = lines.map((line) => line.slice(3).trim());
  const capped = dirtyPaths.slice(0, 50);

  return { ok: true, clean: false, dirty_paths: capped };
}
