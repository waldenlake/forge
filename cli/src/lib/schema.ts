import { Ajv, type AnySchema, type ErrorObject } from "ajv";
import type { FormatsPlugin } from "ajv-formats";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const addFormats = require("ajv-formats") as FormatsPlugin;

export type SchemaValidationResult = {
  ok: boolean;
  errors: string[];
};

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function formatError(error: ErrorObject): string {
  const path = error.instancePath || "/";
  const message = error.message ?? "failed validation";

  if (error.keyword === "additionalProperties") {
    const params = error.params as { additionalProperty?: unknown };
    if (typeof params.additionalProperty === "string") {
      return `${path} ${message}: ${params.additionalProperty}`;
    }
  }

  return `${path} ${message}`;
}

export function validateJsonFile(
  schemaPath: string,
  value: unknown,
): SchemaValidationResult {
  const schema = readJson(schemaPath) as AnySchema;
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const ok = validate(value);

  if (ok) {
    return { ok: true, errors: [] };
  }

  return {
    ok: false,
    errors: (validate.errors ?? []).map(formatError),
  };
}
