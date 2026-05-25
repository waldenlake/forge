import type { Command } from "commander";
import { readFileSync } from "node:fs";
import { dirname, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateJsonFile } from "../lib/schema.js";

type SchemaValidateOptions = {
  file: string;
  schema?: string;
};

type SchemaValidateJson = {
  ok: boolean;
  file: string;
  errors: string[];
};

const inferredSchemas: Record<string, string> = {
  "config.json": "config.schema.json",
  "progress.json": "progress.schema.json",
  "scenarios.json": "scenarios.schema.json",
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");

function writeJson(payload: SchemaValidateJson): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function inferSchema(filePath: string): string {
  const schemaName = inferredSchemas[basename(filePath)];
  if (!schemaName) {
    throw new Error(`Cannot infer schema for ${filePath}`);
  }

  return resolve(repoRoot, "schemas", schemaName);
}

export function registerSchemaValidateCommand(program: Command): void {
  program
    .command("schema:validate")
    .description("validate a JSON file against a Forge schema")
    .requiredOption("--file <path>", "JSON file to validate")
    .option("--schema <path>", "schema file to validate against")
    .action((options: SchemaValidateOptions) => {
      const filePath = options.file;

      try {
        const schemaPath = options.schema ?? inferSchema(filePath);
        const value = readJson(filePath);
        const result = validateJsonFile(schemaPath, value);

        writeJson({
          ok: result.ok,
          file: filePath,
          errors: result.errors,
        });

        if (!result.ok) {
          process.exitCode = 1;
        }
      } catch (error: unknown) {
        process.exitCode = 1;
        writeJson({
          ok: false,
          file: filePath,
          errors: [
            error instanceof Error && error.message.length > 0
              ? error.message
              : "Unknown schema validation error",
          ],
        });
      }
    });
}
