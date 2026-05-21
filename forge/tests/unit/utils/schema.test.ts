import { describe, it, expect } from 'vitest';
import { validateProgressJson, validateConfigJson, validateScenariosJson } from '../../../src/utils/schema';
import type { ProgressJson, ConfigJson, ScenariosJson } from '../../../src/types';

describe('Schema Validation', () => {
  describe('validateProgressJson', () => {
    it('should return success for valid progress.json', () => {
      const valid: ProgressJson = {
        version: '1.0',
        feature: 'test',
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
      const result = validateProgressJson(valid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.feature).toBe('test');
      }
    });

    it('should return error for invalid status', () => {
      const invalid = {
        version: '1.0',
        feature: 'test',
        status: 'invalid',
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
      const result = validateProgressJson(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('status');
      }
    });

    it('should return error for null input', () => {
      const result = validateProgressJson(null);
      expect(result.success).toBe(false);
    });

    it('should return error for empty object', () => {
      const result = validateProgressJson({});
      expect(result.success).toBe(false);
    });
  });

  describe('validateConfigJson', () => {
    it('should return success for valid config.json', () => {
      const valid: ConfigJson = {
        version: '1.0',
        test_mode: 'normal',
        gstack_installed: false,
        batch_size: 6,
        test_command: 'npm test',
        test_framework: 'vitest',
        test_coverage: { unit: 80, integration: 60, e2e: 'P0' },
        project_type: 'new',
        platforms: ['claude', 'opencode'],
      };
      const result = validateConfigJson(valid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.batch_size).toBe(6);
      }
    });

    it('should return error for invalid batch_size', () => {
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
      const result = validateConfigJson(invalid);
      expect(result.success).toBe(false);
    });

    it('should return error for missing required field', () => {
      const invalid = { version: '1.0', test_mode: 'normal' };
      const result = validateConfigJson(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('validateScenariosJson', () => {
    it('should return success for valid scenarios.json', () => {
      const valid: ScenariosJson = {
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
            priority: 'P0',
          },
        ],
      };
      const result = validateScenariosJson(valid);
      expect(result.success).toBe(true);
    });

    it('should return error for invalid priority', () => {
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
      const result = validateScenariosJson(invalid);
      expect(result.success).toBe(false);
    });
  });
});
