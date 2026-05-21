import { describe, it, expect } from 'vitest';
import {
  ProgressJsonSchema,
  ConfigJsonSchema,
  ScenariosJsonSchema,
  TaskSchema,
  BatchSchema,
  VerificationSchema,
  TestCoverageSchema,
  ScenarioAssertionSchema,
  ScenarioSchema,
  type ProgressJson,
  type ConfigJson,
  type ScenariosJson,
  type Scenario,
  type ScenarioAssertion,
  type Batch,
  type Task,
  type Verification,
} from '../../src/types';

describe('Type Definitions', () => {
  it('should export Zod schemas', () => {
    expect(ProgressJsonSchema).toBeDefined();
    expect(ConfigJsonSchema).toBeDefined();
    expect(ScenariosJsonSchema).toBeDefined();
  });

  it('should validate valid progress.json', () => {
    const valid: ProgressJson = {
      version: '1.0',
      feature: 'test-feature',
      status: 'planning',
      phase: 'brainstorming',
      created_at: '2026-05-21T08:00:00Z',
      updated_at: '2026-05-21T08:00:00Z',
      total_batches: 0,
      current_batch: 0,
      batches: [],
      verification: {
        status: 'pending',
        test_mode: 'normal',
        last_run: null,
        report_path: null,
      },
    };
    const result = ProgressJsonSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('should reject invalid progress.json status', () => {
    const invalid = {
      version: '1.0',
      feature: 'test',
      status: 'invalid_status',
      phase: 'brainstorming',
      created_at: '2026-05-21T08:00:00Z',
      updated_at: '2026-05-21T08:00:00Z',
      total_batches: 0,
      current_batch: 0,
      batches: [],
      verification: {
        status: 'pending',
        test_mode: 'normal',
        last_run: null,
        report_path: null,
      },
    };
    const result = ProgressJsonSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should validate valid config.json', () => {
    const valid: ConfigJson = {
      version: '1.0',
      test_mode: 'normal',
      gstack_installed: false,
      batch_size: 6,
      test_command: 'npm test',
      test_framework: 'vitest',
      test_coverage: {
        unit: 80,
        integration: 60,
        e2e: 'P0',
      },
      project_type: 'new',
      platforms: ['claude', 'opencode'],
    };
    const result = ConfigJsonSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('should validate valid scenarios.json', () => {
    const valid: ScenariosJson = {
      version: '1.0',
      feature: 'test-feature',
      source: 'proposal.md',
      generated_at: '2026-05-21T08:15:00Z',
      scenarios: [
        {
          id: 1,
          title: 'Test scenario',
          given: 'Given condition',
          when: 'When action',
          then: [
            { assertion: 'Then result', type: 'functional' },
          ],
          testTypes: ['functional'],
          priority: 'P0',
        },
      ],
    };
    const result = ScenariosJsonSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('should reject invalid scenario priority', () => {
    const invalid = {
      version: '1.0',
      feature: 'test',
      source: 'proposal.md',
      generated_at: '2026-05-21T08:15:00Z',
      scenarios: [
        {
          id: 1,
          title: 'Test',
          given: 'Given',
          when: 'When',
          then: [{ assertion: 'Then', type: 'functional' }],
          testTypes: ['functional'],
          priority: 'P3',
        },
      ],
    };
    const result = ScenariosJsonSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should reject config with invalid batch_size', () => {
    const invalid = {
      version: '1.0',
      test_mode: 'normal',
      gstack_installed: false,
      batch_size: 0,
      test_command: 'npm test',
      test_framework: 'vitest',
      test_coverage: { unit: 80, integration: 60, e2e: 'P0' },
      project_type: 'new',
      platforms: ['claude', 'opencode'],
    };
    const result = ConfigJsonSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should reject config with invalid platform', () => {
    const invalid = {
      version: '1.0',
      test_mode: 'normal',
      gstack_installed: false,
      batch_size: 6,
      test_command: 'npm test',
      test_framework: 'vitest',
      test_coverage: { unit: 80, integration: 60, e2e: 'P0' },
      project_type: 'new',
      platforms: ['invalid_platform'],
    };
    const result = ConfigJsonSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should reject test_coverage with unit > 100', () => {
    const invalid = { unit: 101, integration: 60, e2e: 'P0' };
    const result = TestCoverageSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should reject test_coverage with unit < 0', () => {
    const invalid = { unit: -1, integration: 60, e2e: 'P0' };
    const result = TestCoverageSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should validate valid TaskSchema', () => {
    const valid: Task = {
      id: 1,
      title: 'Test task',
      status: 'done',
    };
    const result = TaskSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('should reject TaskSchema with invalid status', () => {
    const invalid = { id: 1, title: 'Test', status: 'invalid' };
    const result = TaskSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should validate valid BatchSchema', () => {
    const valid: Batch = {
      batch: 1,
      status: 'done',
      tasks: [],
    };
    const result = BatchSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('should validate valid VerificationSchema with optional fields omitted', () => {
    const valid = { status: 'pending', test_mode: 'normal' };
    const result = VerificationSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('should validate valid VerificationSchema with null fields', () => {
    const valid = { status: 'pending', test_mode: 'normal', last_run: null, report_path: null };
    const result = VerificationSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('should validate valid ScenarioAssertionSchema', () => {
    const valid: ScenarioAssertion = {
      assertion: 'Test assertion',
      type: 'functional',
    };
    const result = ScenarioAssertionSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('should reject ScenarioAssertionSchema with invalid type', () => {
    const invalid = { assertion: 'Test', type: 'invalid_type' };
    const result = ScenarioAssertionSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});
