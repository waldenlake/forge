import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { Command } from "commander";
import {
  idleProgress,
  nowIso,
  progressPath,
  reportsPath,
  writeProgress,
} from "../state/progress.js";

type ResetOptions = {
  backup?: boolean;
};

function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function fail(error: string): void {
  process.exitCode = 1;
  writeJson({ ok: false, error });
}

function backupName(): string {
  return `progress-${nowIso().replace(/[:.]/g, "-")}.json`;
}

function reportsBackupDirName(): string {
  return `reports-${nowIso().replace(/[:.]/g, "-")}`;
}

/**
 * Recursively copy `src` directory contents into `dest`. Creates `dest` if missing.
 * Skips silently if `src` does not exist.
 */
function copyDirRecursive(src: string, dest: string): void {
  if (!existsSync(src)) return;
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const srcEntry = join(src, entry);
    const destEntry = join(dest, entry);
    const stat = statSync(srcEntry);
    if (stat.isDirectory()) {
      copyDirRecursive(srcEntry, destEntry);
    } else if (stat.isFile()) {
      copyFileSync(srcEntry, destEntry);
    }
  }
}

export function registerResetCommand(program: Command): void {
  program.command("reset").option("--backup", "backup progress before reset").action(
    (options: ResetOptions) => {
      const cwd = process.cwd();
      const sourcePath = progressPath(cwd);
      const reportsDir = reportsPath(cwd);
      let backupPath: string | undefined;
      let reportsBackupDir: string | undefined;

      if (!existsSync(sourcePath)) {
        fail("forge project state not found");
        return;
      }

      if (options.backup && existsSync(sourcePath)) {
        backupPath = join(".forge", "backups", backupName()).replace(/\\/g, "/");
        const targetPath = join(cwd, backupPath);
        mkdirSync(dirname(targetPath), { recursive: true });
        copyFileSync(sourcePath, targetPath);

        // Archive .forge/reports/ contents into the backup, then clear the dir.
        // Reports are diagnostic artifacts: tests / verify / scanner outputs.
        if (existsSync(reportsDir) && readdirSync(reportsDir).length > 0) {
          const reportsBackupDirName_ = reportsBackupDirName();
          const reportsBackupAbsDir = join(
            cwd,
            ".forge",
            "backups",
            reportsBackupDirName_,
          );
          copyDirRecursive(reportsDir, reportsBackupAbsDir);
          // Remove the original reports directory after archiving
          rmSync(reportsDir, { recursive: true, force: true });
          reportsBackupDir = reportsBackupDirName_;
        }
      }

      writeProgress(cwd, idleProgress());
      writeJson({
        ok: true,
        ...(backupPath ? { backup_path: backupPath } : {}),
        ...(reportsBackupDir ? { reports_backup_dir: reportsBackupDir } : {}),
        status: "idle",
      });
    },
  );
}
