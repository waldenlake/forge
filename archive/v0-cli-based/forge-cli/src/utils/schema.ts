import type { ZodSchema } from 'zod';
import {
  ProgressJsonSchema,
  ConfigJsonSchema,
  ScenariosJsonSchema,
  type ProgressJson,
  type ConfigJson,
  type ScenariosJson,
} from '../types';

export type ValidationResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };

function validate<T>(schema: ZodSchema<T>, data: unknown): ValidationResult<T> {
  const result = schema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  return { success: false, error: formatZodError(result.error) };
}

export function validateProgressJson(data: unknown): ValidationResult<ProgressJson> {
  return validate(ProgressJsonSchema, data);
}

export function validateConfigJson(data: unknown): ValidationResult<ConfigJson> {
  return validate(ConfigJsonSchema, data);
}

export function validateScenariosJson(data: unknown): ValidationResult<ScenariosJson> {
  return validate(ScenariosJsonSchema, data);
}

function formatZodError(error: import('zod').ZodError): string {
  return error.errors
    .map((e) => {
      const path = e.path.length ? e.path.join('.') : '(root)';
      return `${path}: ${e.message}`;
    })
    .join('; ');
}
