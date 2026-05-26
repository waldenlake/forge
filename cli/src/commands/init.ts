import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Command } from "commander";
import {
  detectMemoryFile,
  detectOptionalTool,
  detectProjectType,
  detectTestProfiles,
} from "../lib/detect.js";
import { defaultConfig, writeConfig } from "../state/config.js";
import { idleProgress, progressPath, writeProgress } from "../state/progress.js";

const FORGE_CLI_VERSION = "0.2.0";

function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function ensureDirectory(path: string, created: string[]): void {
  if (!existsSync(path)) {
    created.push(path);
  }

  mkdirSync(path, { recursive: true });
}

function existingConfigError(cwd: string): string | null {
  const targetPath = join(cwd, ".forge", "config.json");

  if (!existsSync(targetPath)) {
    return null;
  }

  try {
    const config = JSON.parse(readFileSync(targetPath, "utf8")) as {
      version?: unknown;
    };

    if (config.version === "1.0") {
      return "config.json already exists; run migrate";
    }
  } catch {
    return "config.json already exists; run status or migrate";
  }

  return "config.json already exists; run status or migrate";
}

function ensureForgeSection(
  cwd: string,
  memoryFile: string,
  created: string[],
): void {
  const targetPath = join(cwd, memoryFile);
  const section = "## Forge\n\nForge project instructions live in `.forge/`.\n";

  if (!existsSync(targetPath)) {
    writeFileSync(targetPath, `# Project Instructions\n\n${section}`, "utf8");
    created.push(targetPath);
    return;
  }

  const existing = readFileSync(targetPath, "utf8");
  if (!/^## Forge$/m.test(existing)) {
    const separator = existing.endsWith("\n") ? "\n" : "\n\n";
    writeFileSync(targetPath, `${existing}${separator}${section}`, "utf8");
  }
}

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .option("--auto-detect", "detect project defaults")
    .option(
      "--superpowers-available <value>",
      "whether superpowers are available",
    )
    .action((options: { autoDetect?: boolean; superpowersAvailable?: string }) => {
      const cwd = process.cwd();
      const created: string[] = [];
      const forgeDir = join(cwd, ".forge");
      const error = existingConfigError(cwd);

      if (error) {
        process.exitCode = 1;
        writeJson({
          ok: false,
          error,
        });
        return;
      }

      ensureDirectory(forgeDir, created);
      ensureDirectory(join(forgeDir, "specs"), created);
      ensureDirectory(join(forgeDir, "bin"), created);
      ensureDirectory(join(forgeDir, "backups"), created);

      const detected = {
        project_type: detectProjectType(cwd),
        memory_file: detectMemoryFile(cwd),
        test_profiles: detectTestProfiles(cwd),
        gstack_installed: detectOptionalTool("gstack"),
      };

      const config = defaultConfig({
        memory_file: detected.memory_file,
        project_type: detected.project_type,
        test_profiles: detected.test_profiles,
        gstack_installed: detected.gstack_installed,
      });

      writeConfig(cwd, config);

      if (!existsSync(progressPath(cwd))) {
        writeProgress(cwd, idleProgress());
        created.push(progressPath(cwd));
      }

      ensureForgeSection(cwd, detected.memory_file, created);

      writeJson({
        ok: true,
        detected,
        created,
        forge_cli_version: FORGE_CLI_VERSION,
      });
    });
}
