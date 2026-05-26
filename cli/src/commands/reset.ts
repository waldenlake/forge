import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Command } from "commander";
import {
  idleProgress,
  nowIso,
  progressPath,
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

export function registerResetCommand(program: Command): void {
  program.command("reset").option("--backup", "backup progress before reset").action(
    (options: ResetOptions) => {
      const cwd = process.cwd();
      const sourcePath = progressPath(cwd);
      let backupPath: string | undefined;

      if (!existsSync(sourcePath)) {
        fail("forge project state not found");
        return;
      }

      if (options.backup && existsSync(sourcePath)) {
        backupPath = join(".forge", "backups", backupName()).replace(/\\/g, "/");
        const targetPath = join(cwd, backupPath);
        mkdirSync(dirname(targetPath), { recursive: true });
        copyFileSync(sourcePath, targetPath);
      }

      writeProgress(cwd, idleProgress());
      writeJson({
        ok: true,
        ...(backupPath ? { backup_path: backupPath } : {}),
        status: "idle",
      });
    },
  );
}
