import type { Command } from "commander";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  commitAll,
  findTaskCommit,
  git,
  gitTopLevel,
  isGitRepo,
} from "../lib/git.js";

type CommitOptions = {
  message: string;
  tag: string;
};

type CommitCheckOptions = {
  taskIds: string;
};

function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function fail(error: string): void {
  process.exitCode = 1;
  writeJson({ ok: false, error });
}

function parseTaskIds(value: string): number[] | null {
  const ids = value.split(",").map((part) => Number(part.trim()));

  if (
    ids.length === 0 ||
    ids.some((id) => !Number.isInteger(id) || id < 1)
  ) {
    return null;
  }

  return ids;
}

function taggedMessage(message: string, tag: string): string {
  const suffix = `[${tag}]`;

  return message.includes(suffix) ? message : `${message} ${suffix}`;
}

function requireGitRepo(cwd: string): boolean {
  if (isGitRepo(cwd)) {
    return true;
  }

  fail("not a git repository");
  return false;
}

function samePath(left: string, right: string): boolean {
  return resolve(left).toLowerCase() === resolve(right).toLowerCase();
}

function hasForgeState(cwd: string): boolean {
  return (
    existsSync(resolve(cwd, ".forge", "config.json")) ||
    existsSync(resolve(cwd, ".forge", "progress.json"))
  );
}

function requireCommitRoot(cwd: string): boolean {
  if (!requireGitRepo(cwd)) {
    return false;
  }

  const topLevel = gitTopLevel(cwd);
  if (!topLevel || !samePath(cwd, topLevel)) {
    fail("forge commit must run from git root");
    return false;
  }

  if (!hasForgeState(cwd)) {
    fail("forge project state not found");
    return false;
  }

  return true;
}

export function registerCommitCommand(program: Command): void {
  program
    .command("commit")
    .requiredOption("--message <message>", "commit message")
    .requiredOption("--tag <tag>", "forge task tag")
    .action((options: CommitOptions) => {
      const cwd = process.cwd();
      if (!requireCommitRoot(cwd)) {
        return;
      }

      const add = git(cwd, ["add", "-A"]);
      if (!add.ok) {
        fail(add.stderr.trim() || "git add failed");
        return;
      }

      const result = commitAll(cwd, taggedMessage(options.message, options.tag));
      if (!result.ok) {
        fail(result.error);
        return;
      }

      writeJson(result);
    });

  program
    .command("commit:check")
    .requiredOption("--task-ids <ids>", "comma-separated task ids")
    .action((options: CommitCheckOptions) => {
      const cwd = process.cwd();
      if (!requireGitRepo(cwd)) {
        return;
      }

      const ids = parseTaskIds(options.taskIds);
      if (!ids) {
        fail(`invalid task ids: ${options.taskIds}`);
        return;
      }

      const tasks = ids.map((id) => {
        const commit = findTaskCommit(cwd, id);

        return commit
          ? { id, status: "found", commit }
          : { id, status: "missing", commit: null };
      });
      const missing = tasks
        .filter((task) => task.status === "missing")
        .map((task) => task.id);

      if (missing.length > 0) {
        process.exitCode = 1;
      }

      writeJson({
        ok: missing.length === 0,
        tasks,
        missing,
      });
    });
}
