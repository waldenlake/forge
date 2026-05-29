import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Command } from "commander";
import {
  detectMemoryFile,
  detectMonorepoProfiles,
  detectOptionalTool,
  detectProjectType,
  detectTestProfiles,
} from "../lib/detect.js";
import { gitNexusBaseline, isGitNexusInstalled } from "../lib/gitnexus.js";
import { FORGE_CLI_VERSION } from "../lib/version.js";
import { defaultConfig, writeConfig } from "../state/config.js";
import { idleProgress, progressPath, writeProgress } from "../state/progress.js";

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
    .option("--monorepo", "detect monorepo workspace profiles")
    .option(
      "--superpowers-available <value>",
      "whether superpowers are available",
    )
    .action((options: { autoDetect?: boolean; monorepo?: boolean; superpowersAvailable?: string }) => {
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

      const monorepoResult = options.monorepo
        ? detectMonorepoProfiles(cwd)
        : null;

      let testProfiles = detectTestProfiles(cwd);
      if (monorepoResult?.monorepo && monorepoResult.detected_profiles.length > 0) {
        testProfiles = Object.fromEntries(
          monorepoResult.detected_profiles.map((p) => [
            p.name,
            {
              framework: p.framework,
              command: p.command,
              working_dir: p.working_dir,
              ...(p.coverage_command ? { coverage_command: p.coverage_command } : {}),
            },
          ]),
        );
      }

      const detected = {
        project_type: detectProjectType(cwd),
        memory_file: detectMemoryFile(cwd),
        test_profiles: testProfiles,
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

      // GitNexus baseline index: non-blocking. Failure is a warning, not a
      // hard error, because init must succeed for the project to be usable.
      let gitnexus_baseline: { ok: boolean; error?: string } = { ok: false, error: "not installed" };
      if (isGitNexusInstalled()) {
        const baselineResult = gitNexusBaseline(cwd);
        gitnexus_baseline = baselineResult.ok
          ? { ok: true }
          : { ok: false, error: baselineResult.stderr.slice(0, 300) };
      }

      writeJson({
        ok: true,
        detected,
        created,
        forge_cli_version: FORGE_CLI_VERSION,
        gitnexus_baseline,
        ...(monorepoResult?.monorepo ? { monorepo: true } : {}),
      });
    });
}
