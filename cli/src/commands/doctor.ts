import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Command } from "commander";
import { detectOptionalTool } from "../lib/detect.js";
import { isGitNexusInstalled } from "../lib/gitnexus.js";
import { configPath, readConfig } from "../state/config.js";
import { progressPath, readProgress } from "../state/progress.js";

type Check = {
  name: string;
  ok: boolean;
  critical: boolean;
  message?: string;
};

function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function check(name: string, critical: boolean, run: () => string | null): Check {
  try {
    const message = run();
    return {
      name,
      ok: message === null,
      critical,
      ...(message === null ? {} : { message }),
    };
  } catch (error) {
    return {
      name,
      ok: false,
      critical,
      message: error instanceof Error ? error.message : "Unknown check error",
    };
  }
}

export function registerDoctorCommand(program: Command): void {
  program.command("doctor").action(() => {
    const cwd = process.cwd();
    const checks: Check[] = [
      check("cli", true, () => null),
      check("node", true, () =>
        Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10) >= 18
          ? null
          : "Node.js 18 or newer is required",
      ),
      check("config", true, () => {
        if (!existsSync(configPath(cwd))) {
          return ".forge/config.json not found";
        }

        readConfig(cwd);
        return null;
      }),
      check("progress", false, () => {
        if (!existsSync(progressPath(cwd))) {
          return ".forge/progress.json not found";
        }

        readProgress(cwd);
        return null;
      }),
      check("git", false, () =>
        existsSync(join(cwd, ".git")) || detectOptionalTool("git")
          ? null
          : "git not found",
      ),
      check("gitnexus", true, () =>
        isGitNexusInstalled()
          ? null
          : "gitnexus not installed — install with: npm install -g gitnexus",
      ),
    ];

    const ok = checks.filter((item) => item.critical).every((item) => item.ok);

    if (!ok) {
      process.exitCode = 1;
    }

    writeJson({
      ok,
      checks,
    });
  });
}
