import { z } from 'zod';

// ==================== Scenario Types ====================

export const ScenarioAssertionSchema = z.object({
  assertion: z.string(),
  type: z.enum(['functional', 'ui', 'side-effect', 'performance']),
});

export type ScenarioAssertion = z.infer<typeof ScenarioAssertionSchema>;

export const ScenarioSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  given: z.string(),
  when: z.string(),
  then: z.array(ScenarioAssertionSchema),
  testTypes: z.array(z.enum(['functional', 'ui', 'integration', 'performance'])),
  priority: z.enum(['P0', 'P1', 'P2']),
});

export type Scenario = z.infer<typeof ScenarioSchema>;

export const ScenariosJsonSchema = z.object({
  version: z.literal('1.0'),
  feature: z.string(),
  source: z.string(),
  generated_at: z.string().datetime(),
  scenarios: z.array(ScenarioSchema),
});

export type ScenariosJson = z.infer<typeof ScenariosJsonSchema>;

// ==================== Progress Types ====================

export const TaskSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  status: z.enum(['pending', 'in_progress', 'done', 'failed', 'deferred']),
  commit: z.string().optional(),
  started_at: z.string().datetime().optional(),
  completed_at: z.string().datetime().optional(),
});

export type Task = z.infer<typeof TaskSchema>;

export const BatchSchema = z.object({
  batch: z.number().int().positive(),
  status: z.enum(['pending', 'in_progress', 'done', 'blocked', 'failed']),
  started_at: z.string().datetime().optional(),
  completed_at: z.string().datetime().optional(),
  tasks: z.array(TaskSchema),
});

export type Batch = z.infer<typeof BatchSchema>;

export const VerificationSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'passed', 'failed']),
  test_mode: z.enum(['normal', 'enhanced']),
  last_run: z.string().datetime().nullable().optional(),
  report_path: z.string().nullable().optional(),
});

export type Verification = z.infer<typeof VerificationSchema>;

export const ProgressJsonSchema = z.object({
  version: z.literal('1.0'),
  feature: z.string(),
  status: z.enum(['idle', 'planning', 'executing', 'verification_complete', 'bugfix']),
  phase: z.enum(['brainstorming', 'awaiting_confirmation', 'batch_execution', 'verification']),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  total_batches: z.number().int().nonnegative(),
  current_batch: z.number().int().nonnegative(),
  batches: z.array(BatchSchema),
  verification: VerificationSchema,
});

export type ProgressJson = z.infer<typeof ProgressJsonSchema>;

// ==================== Config Types ====================

export const TestCoverageSchema = z.object({
  unit: z.number().int().min(0).max(100),
  integration: z.number().int().min(0).max(100),
  e2e: z.enum(['P0', 'P0+P1', 'all']),
});

export type TestCoverage = z.infer<typeof TestCoverageSchema>;

export const ConfigJsonSchema = z.object({
  version: z.literal('1.0'),
  test_mode: z.enum(['normal', 'enhanced']),
  gstack_installed: z.boolean(),
  batch_size: z.number().int().min(1).max(10),
  test_command: z.string(),
  test_framework: z.string(),
  test_coverage: TestCoverageSchema,
  project_type: z.enum(['new', 'existing']),
  platforms: z.array(z.enum(['claude', 'opencode', 'codex'])),
});

export type ConfigJson = z.infer<typeof ConfigJsonSchema>;
