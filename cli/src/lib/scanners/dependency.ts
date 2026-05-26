import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runShellCommand } from '../runner.js';

export type PackageLicenseInfo = { name: string; version?: string; license: string | null; license_ok: boolean };
export type VulnerabilityInfo = { name: string; vulnerabilities: number; highest_severity?: string };
export type PackageAuditResult = PackageLicenseInfo & { vulnerabilities: number; highest_severity?: string };
export type DependencyAuditResult = { ok: boolean; packages: PackageAuditResult[]; new_packages_detected: string[]; scanner: 'npm-audit' | 'cargo-audit' | 'pip-audit' | 'manual' };

export function extractNewPackagesFromDiff(diff: string): string[] {
  const added: string[] = [];
  const removed = new Set<string>();
  const pattern = /^[+-]\s*"([^"]+)":\s*"[^"]+"/;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (!line.startsWith('+') && !line.startsWith('-')) continue;
    const match = pattern.exec(line);
    if (!match?.[1]) continue;
    if (line.startsWith('+')) added.push(match[1]);
    else removed.add(match[1]);
  }
  return added.filter(name => !removed.has(name));
}

export function checkLicenses(cwd: string, packageNames: string[], allowlist: string[]): PackageLicenseInfo[] {
  const normalized = allowlist.map(l => l.toLowerCase());
  return packageNames.map(name => {
    const pkgPath = join(cwd, 'node_modules', name, 'package.json');
    if (!existsSync(pkgPath)) return { name, license: null, license_ok: false };
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string; license?: string };
      const license = pkg.license ?? null;
      return { name, version: pkg.version, license, license_ok: license !== null && normalized.includes(license.toLowerCase()) };
    } catch { return { name, license: null, license_ok: false }; }
  });
}

export function parseNpmAuditJson(output: string): VulnerabilityInfo[] {
  try {
    const parsed = JSON.parse(output) as { vulnerabilities?: Record<string, { name: string; severity?: string; via?: unknown[] }> };
    return Object.values(parsed.vulnerabilities ?? {}).map(v => ({
      name: v.name,
      vulnerabilities: Array.isArray(v.via) ? (v.via.filter(item => typeof item === 'object' && item !== null).length || 1) : 1,
      highest_severity: v.severity,
    }));
  } catch { return []; }
}

export function runDependencyAudit(cwd: string, newPackages: string[], allowlist: string[]): DependencyAuditResult {
  const licenseResults = checkLicenses(cwd, newPackages, allowlist);
  let vulnResults: VulnerabilityInfo[] = [];
  let scanner: DependencyAuditResult['scanner'] = 'manual';
  if (existsSync(join(cwd, 'package.json'))) {
    const result = runShellCommand(cwd, '.', 'npm audit --json');
    if (result.stdout) { vulnResults = parseNpmAuditJson(result.stdout); scanner = 'npm-audit'; }
  }
  const packages: PackageAuditResult[] = newPackages.map(name => {
    const li = licenseResults.find(l => l.name === name) ?? { name, license: null, license_ok: false };
    const vi = vulnResults.find(v => v.name === name);
    return { ...li, vulnerabilities: vi?.vulnerabilities ?? 0, highest_severity: vi?.highest_severity };
  });
  return { ok: !packages.some(p => !p.license_ok || p.vulnerabilities > 0), packages, new_packages_detected: newPackages, scanner };
}
