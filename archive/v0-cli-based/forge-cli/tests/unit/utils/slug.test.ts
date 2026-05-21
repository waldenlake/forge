import { describe, it, expect } from 'vitest';
import { generateSlug } from '../../../src/utils/slug';

describe('Feature Slug Generation', () => {
  it('should convert simple text to slug', () => {
    expect(generateSlug('User Authentication')).toBe('user-authentication');
  });

  it('should handle Chinese characters by using hash', () => {
    const slug = generateSlug('用户登录功能');
    expect(slug).toMatch(/^feature-[a-z0-9]+$/);
    expect(slug.length).toBeGreaterThan(0);
  });

  it('should handle mixed Chinese and English', () => {
    const slug = generateSlug('用户登录 user login');
    expect(slug).toMatch(/^feature-[a-z0-9]+$/);
  });

  it('should lowercase and replace spaces with hyphens', () => {
    expect(generateSlug('Add Login Page')).toBe('add-login-page');
  });

  it('should remove special characters', () => {
    expect(generateSlug('Add login page! @#$')).toBe('add-login-page');
  });

  it('should truncate long slugs', () => {
    const long = 'a'.repeat(100);
    const slug = generateSlug(long);
    expect(slug.length).toBeLessThanOrEqual(50);
  });

  it('should handle empty input', () => {
    const slug = generateSlug('');
    expect(slug).toMatch(/^feature-[a-z0-9]+$/);
  });

  it('should generate unique slugs with counter', () => {
    const existing = ['user-auth', 'user-auth-2'];
    const slug = generateSlug('User Auth', existing);
    expect(slug).toBe('user-auth-3');
  });
});
