import { describe, expect, it } from 'vitest';
import { scanFiles } from '../src/lib/scanners/security.js';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'forge-sec-'));
}

function writeFile(dir: string, name: string, content: string): string {
  const filePath = join(dir, name);
  writeFileSync(filePath, content, 'utf8');
  return filePath;
}

describe('security scanner', () => {
  it('detects hardcoded password', () => {
    const dir = tempDir();
    const file = writeFile(dir, 'config.ts', 'const password = "hunter2";\n');
    const result = scanFiles([file]);
    expect(result.ok).toBe(false);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ severity: 'HIGH', type: 'hardcoded-secret', file, line: 1 });
  });

  it('detects AWS access key pattern', () => {
    const dir = tempDir();
    const file = writeFile(dir, 'aws.ts', 'const key = "AKIAIOSFODNN7EXAMPLE";\n');
    const result = scanFiles([file]);
    expect(result.ok).toBe(false);
    expect(result.findings[0]).toMatchObject({ severity: 'CRITICAL', type: 'hardcoded-secret' });
  });

  it('detects private key header', () => {
    const dir = tempDir();
    const file = writeFile(dir, 'key.pem', '-----BEGIN RSA PRIVATE KEY-----\nstuff\n');
    const result = scanFiles([file]);
    expect(result.ok).toBe(false);
    expect(result.findings[0]).toMatchObject({ severity: 'CRITICAL', type: 'hardcoded-secret' });
  });

  it('detects eval usage as WARNING', () => {
    const dir = tempDir();
    const file = writeFile(dir, 'exec.js', 'const x = eval(userInput);\n');
    const result = scanFiles([file]);
    expect(result.ok).toBe(true);
    expect(result.findings[0]).toMatchObject({ severity: 'WARNING', type: 'code-injection' });
  });

  it('returns ok=true for clean files', () => {
    const dir = tempDir();
    const file = writeFile(dir, 'clean.ts', 'export function add(a: number, b: number) { return a + b; }\n');
    const result = scanFiles([file]);
    expect(result.ok).toBe(true);
    expect(result.findings).toHaveLength(0);
  });

  it('respects severity threshold filter', () => {
    const dir = tempDir();
    const file = writeFile(dir, 'mixed.ts', 'const password = "secret";\neval(x);\n');
    const result = scanFiles([file], { severityThreshold: 'HIGH' });
    expect(result.ok).toBe(false);
    expect(result.findings).toHaveLength(2);
  });

  it('skips binary files gracefully', () => {
    const dir = tempDir();
    const file = join(dir, 'image.png');
    writeFileSync(file, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0d, 0x0a]));
    const result = scanFiles([file]);
    expect(result.ok).toBe(true);
    expect(result.scanned_files).toBe(0);
  });

  it('reports scanner type as pattern', () => {
    const dir = tempDir();
    const file = writeFile(dir, 'a.ts', 'const x = 1;\n');
    const result = scanFiles([file]);
    expect(result.scanner).toBe('pattern');
  });

  it('redacts the matched secret in findings', () => {
    const dir = tempDir();
    const file = writeFile(dir, 'aws.ts', 'const key = "AKIAIOSFODNN7EXAMPLE";\n');
    const result = scanFiles([file]);
    expect(result.findings.length).toBeGreaterThan(0);
    const match = result.findings[0].match;
    // Full token is AKIAIOSFODNN7EXAMPLE (20 chars); redact() keeps first 4 and last 4
    expect(match).toMatch(/^AKIA/);
    expect(match).toContain('...');
    expect(match).toMatch(/MPLE$/);
    expect(match.length).toBeLessThan('AKIAIOSFODNN7EXAMPLE'.length);
  });
});
