import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Command } from "commander";
import { readProgress } from "../state/progress.js";

function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function fail(error: string): void {
  process.exitCode = 1;
  writeJson({ ok: false, error });
}

function unsupported(feature: "scenarios:export" | "scenarios:import"): void {
  process.exitCode = 1;
  writeJson({
    ok: false,
    unsupported: true,
    feature,
    message:
      "scenario import/export interfaces exist; implementation is not part of v2 core runtime",
  });
}

function safeFeatureSlug(feature: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(feature);
}

export function registerScenariosCommand(program: Command): void {
  program.command("scenarios:export").action(() => {
    unsupported("scenarios:export");
  });

  program.command("scenarios:import").action(() => {
    unsupported("scenarios:import");
  });

  program.command("scenarios:archive").action(() => {
    const cwd = process.cwd();
    const progress = readProgress(cwd);
    if (!progress.feature) {
      fail("progress.feature is required to archive scenarios");
      return;
    }

    if (!safeFeatureSlug(progress.feature)) {
      fail("progress.feature must be a safe feature slug");
      return;
    }

    const sourcePath = join(cwd, ".forge", "scenarios.json");
    if (!existsSync(sourcePath)) {
      fail(".forge/scenarios.json does not exist");
      return;
    }

    const archiveDir = join(cwd, ".forge", "specs");
    const archivePath = `.forge/specs/${progress.feature}-scenarios.json`;
    mkdirSync(archiveDir, { recursive: true });
    copyFileSync(sourcePath, join(cwd, archivePath));

    writeJson({
      ok: true,
      archived_to: archivePath,
    });
  });
}
