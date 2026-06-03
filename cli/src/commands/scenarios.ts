import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
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

function safeFeatureSlug(feature: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(feature);
}

export function registerScenariosCommand(program: Command): void {
  program
    .command("scenarios:export")
    .option("--feature <slug>", "feature slug")
    .option("--template <name>", "template name")
    .action((opts: { feature?: string; template?: string }) => {
      const cwd = process.cwd();
      const { feature, template } = opts;

      if (!feature) {
        fail("--feature is required");
        return;
      }

      if (!template) {
        fail("--template is required");
        return;
      }

      if (!safeFeatureSlug(template)) {
        fail("--template must be a safe slug");
        return;
      }

      const scenariosPath = join(cwd, ".forge", "scenarios.json");
      if (!existsSync(scenariosPath)) {
        fail(".forge/scenarios.json does not exist");
        return;
      }

      const scenariosFile = JSON.parse(
        readFileSync(scenariosPath, "utf8"),
      ) as { scenarios?: unknown[] };
      const scenarios = scenariosFile.scenarios ?? [];

      const templatesDir = join(cwd, ".forge", "templates");
      mkdirSync(templatesDir, { recursive: true });

      const templatePath = join(templatesDir, `${template}.json`);
      const templateData = {
        version: "1.0",
        template,
        description: `Exported from feature: ${feature}`,
        exported_at: new Date().toISOString(),
        scenarios,
      };

      writeFileSync(
        templatePath,
        `${JSON.stringify(templateData, null, 2)}\n`,
        "utf8",
      );

      writeJson({
        ok: true,
        template,
        path: `.forge/templates/${template}.json`,
        scenarios_count: scenarios.length,
      });
    });

  program
    .command("scenarios:import")
    .option("--template <name>", "template name")
    .option("--as-given", "set type: given-template on imported scenarios")
    .action((opts: { template?: string; asGiven?: boolean }) => {
      const cwd = process.cwd();
      const { template, asGiven } = opts;

      if (!template) {
        fail("--template is required");
        return;
      }

      const templatePath = join(cwd, ".forge", "templates", `${template}.json`);
      if (!existsSync(templatePath)) {
        fail(`.forge/templates/${template}.json does not exist`);
        return;
      }

      const templateData = JSON.parse(
        readFileSync(templatePath, "utf8"),
      ) as { scenarios?: Array<Record<string, unknown>> };
      const templateScenarios: Array<Record<string, unknown>> =
        templateData.scenarios ?? [];

      const scenariosPath = join(cwd, ".forge", "scenarios.json");
      let existing: { scenarios: Array<Record<string, unknown>> } = {
        scenarios: [],
      };
      if (existsSync(scenariosPath)) {
        const parsed = JSON.parse(readFileSync(scenariosPath, "utf8")) as {
          scenarios?: Array<Record<string, unknown>>;
        };
        existing = {
          scenarios: parsed.scenarios ?? [],
        };
      }

      const existingIds = new Set<string>(
        existing.scenarios
          .map((s) => s["id"])
          .filter((id): id is string => typeof id === "string"),
      );

      let imported = 0;
      let skippedDuplicates = 0;

      for (const scenario of templateScenarios) {
        const id = scenario["id"];
        if (typeof id === "string" && existingIds.has(id)) {
          skippedDuplicates++;
          continue;
        }

        const toImport: Record<string, unknown> = asGiven
          ? { ...scenario, type: "given-template" }
          : { ...scenario };

        existing.scenarios.push(toImport);
        if (typeof id === "string") {
          existingIds.add(id);
        }
        imported++;
      }

      writeFileSync(
        scenariosPath,
        `${JSON.stringify(existing, null, 2)}\n`,
        "utf8",
      );

      writeJson({
        ok: true,
        imported,
        skipped_duplicates: skippedDuplicates,
        template,
      });
    });

  program.command("scenarios:archive")
    .option("--feature <slug>", "feature slug (overrides progress.feature)")
    .action((options: { feature?: string }) => {
    const cwd = process.cwd();
    const feature = options.feature ?? readProgress(cwd).feature;
    if (!feature) {
      fail("feature name is required — pass --feature <slug> or ensure progress.feature is set");
      return;
    }

    if (!safeFeatureSlug(feature)) {
      fail("feature must be a safe feature slug");
      return;
    }

    const sourcePath = join(cwd, ".forge", "scenarios.json");
    if (!existsSync(sourcePath)) {
      fail(".forge/scenarios.json does not exist");
      return;
    }

    const archiveDir = join(cwd, ".forge", "specs");
    const archivePath = `.forge/specs/${feature}-scenarios.json`;
    mkdirSync(archiveDir, { recursive: true });
    copyFileSync(sourcePath, join(cwd, archivePath));

    writeJson({
      ok: true,
      archived_to: archivePath,
    });
  });
}
