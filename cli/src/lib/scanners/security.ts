import { readFileSync } from 'node:fs';

export type Severity = 'CRITICAL' | 'HIGH' | 'WARNING';

export type SecurityFinding = {
  severity: Severity;
  type: string;
  file: string;
  line: number;
  message: string;
  match: string;
};

export type SecurityScanOptions = {
  severityThreshold?: Severity;
};

export type SecurityScanResult = {
  ok: boolean;
  findings: SecurityFinding[];
  scanned_files: number;
  scanner: 'pattern' | 'semgrep';
};

type Rule = {
  id: string;
  type: string;
  severity: Severity;
  pattern: RegExp;
  message: string;
};

const RULES: Rule[] = [
  { id: 'aws-key', type: 'hardcoded-secret', severity: 'CRITICAL', pattern: /AKIA[0-9A-Z]{16}/, message: 'Potential AWS access key' },
  { id: 'private-key', type: 'hardcoded-secret', severity: 'CRITICAL', pattern: /-----BEGIN\s+(RSA|EC|DSA)\s+PRIVATE\s+KEY-----/, message: 'Private key detected' },
  { id: 'jwt-secret', type: 'hardcoded-secret', severity: 'HIGH', pattern: /(jwt|JWT)[\w]*[._-]?secret\s*[:=]\s*['"][^'"]{4,}['"]/, message: 'Potential hardcoded JWT secret' },
  { id: 'hardcoded-password', type: 'hardcoded-secret', severity: 'HIGH', pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]+['"]/i, message: 'Potential hardcoded password' },
  { id: 'generic-api-key', type: 'hardcoded-secret', severity: 'HIGH', pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"][^'"]{8,}['"]/i, message: 'Potential hardcoded API key' },
  { id: 'sql-concat', type: 'sql-injection', severity: 'WARNING', pattern: /["'`](?:SELECT|INSERT|UPDATE|DELETE)\b[^"'`]*["'`]\s*\+/i, message: 'Potential SQL injection via string concatenation' },
  { id: 'eval-usage', type: 'code-injection', severity: 'WARNING', pattern: /\beval\s*\(/, message: 'Use of eval() detected' },
  { id: 'new-function', type: 'code-injection', severity: 'WARNING', pattern: /new\s+Function\s*\(/, message: 'Use of new Function() detected' },
];

const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 3, HIGH: 2, WARNING: 1 };

function isBinaryContent(content: string): boolean {
  return content.slice(0, 512).includes('\0');
}

function meetsThreshold(severity: Severity, threshold: Severity): boolean {
  return SEVERITY_RANK[severity] >= SEVERITY_RANK[threshold];
}

function redact(match: string): string {
  if (match.length <= 8) return match;
  return `${match.slice(0, 4)}...${match.slice(-4)}`;
}

export function scanFiles(files: string[], options: SecurityScanOptions = {}): SecurityScanResult {
  const threshold = options.severityThreshold ?? 'HIGH';
  const findings: SecurityFinding[] = [];
  let scannedFiles = 0;

  for (const file of files) {
    let content: string;
    try { content = readFileSync(file, 'utf8'); } catch (e) { process.stderr.write(`[security-scan] could not read: ${file}: ${(e as Error).message}\n`); continue; }
    if (isBinaryContent(content)) continue;
    scannedFiles++;

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const rule of RULES) {
        const gPattern = new RegExp(rule.pattern.source, rule.pattern.flags.includes('g') ? rule.pattern.flags : rule.pattern.flags + 'g');
        let match;
        while ((match = gPattern.exec(line)) !== null) {
          findings.push({
            severity: rule.severity,
            type: rule.type,
            file,
            line: i + 1,
            message: rule.message,
            match: redact(match[0]),
          });
        }
      }
    }
  }

  const blocking = findings.some((f) => meetsThreshold(f.severity, threshold));
  return { ok: !blocking, findings, scanned_files: scannedFiles, scanner: 'pattern' };
}
