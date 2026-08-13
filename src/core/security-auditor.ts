import { SecurityAuditResult } from '../types/index.js';
import { contentToAudit } from './diff-lines.js';
import { SecurityAuditError } from './errors.js';

interface SecretPattern {
  readonly ruleId: string;
  readonly name: string;
  readonly pattern: RegExp;
  readonly severity: SecurityAuditResult['findings'][number]['severity'];
}

export class SecurityAuditor {
  private static readonly SECRET_PATTERNS: readonly SecretPattern[] = [
    { ruleId: 'SEC001', name: 'OpenAI project API key', pattern: /sk-proj-[A-Za-z0-9_-]+/, severity: 'critical' },
    { ruleId: 'SEC002', name: 'OpenAI service-account API key', pattern: /sk-svcacct-[A-Za-z0-9_-]+/, severity: 'critical' },
    { ruleId: 'SEC003', name: 'OpenAI API key', pattern: /sk-[A-Za-z0-9]{32,}/, severity: 'critical' },
    { ruleId: 'SEC004', name: 'GitHub fine-grained personal access token', pattern: /github_pat_[A-Za-z0-9_]+/, severity: 'critical' },
    { ruleId: 'SEC005', name: 'GitHub personal access token', pattern: /ghp_[A-Za-z0-9]{36}/, severity: 'critical' },
    { ruleId: 'SEC006', name: 'Generic secret variable', pattern: /const\s+SECRET\s*=\s*['"][^'"]+['"]/i, severity: 'high' },
    { ruleId: 'SEC007', name: 'Eval code execution', pattern: /eval\s*\(/, severity: 'medium' },
  ];

  public auditContent(content: string, location: string = 'inline'): SecurityAuditResult {
    const findings: SecurityAuditResult['findings'] = [];
    const scanTarget = contentToAudit(content);

    for (const rule of SecurityAuditor.SECRET_PATTERNS) {
      if (rule.pattern.test(scanTarget)) {
        findings.push({
          severity: rule.severity,
          ruleId: rule.ruleId,
          description: `Potential vulnerability or hardcoded credential detected: ${rule.name}`,
          location,
        });
      }
    }

    const blocking = findings.filter((finding) => finding.severity === 'critical' || finding.severity === 'high');
    const riskScore = Math.min(findings.length * 25, 100);

    return {
      passed: blocking.length === 0,
      riskScore,
      findings,
    };
  }

  public auditOrThrow(content: string, location: string = 'inline'): SecurityAuditResult {
    const result = this.auditContent(content, location);
    if (!result.passed) {
      throw new SecurityAuditError(
        `Security audit failed with ${result.findings.length} finding(s) at ${location}`,
      );
    }
    return result;
  }
}
