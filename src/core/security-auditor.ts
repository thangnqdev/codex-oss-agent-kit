import { SecurityAuditResult } from '../types/index.js';

export class SecurityAuditor {
  private static readonly SECRET_PATTERNS = [
    { ruleId: 'SEC001', name: 'OpenAI API Key', pattern: /sk-[a-zA-Z0-9]{32,}/ },
    { ruleId: 'SEC002', name: 'GitHub Personal Access Token', pattern: /ghp_[a-zA-Z0-9]{36}/ },
    { ruleId: 'SEC003', name: 'Generic Secret Variable', pattern: /const\s+SECRET\s*=\s*['"][^'"]+['"]/i },
    { ruleId: 'SEC004', name: 'Eval Code Execution', pattern: /eval\s*\(/ },
  ];

  public auditContent(content: string, location: string = 'inline'): SecurityAuditResult {
    const findings: SecurityAuditResult['findings'] = [];

    for (const rule of SecurityAuditor.SECRET_PATTERNS) {
      if (rule.pattern.test(content)) {
        findings.push({
          severity: rule.ruleId === 'SEC004' ? 'medium' : 'critical',
          ruleId: rule.ruleId,
          description: `Potential vulnerability or hardcoded credential detected: ${rule.name}`,
          location,
        });
      }
    }

    const hasCritical = findings.some(f => f.severity === 'critical');
    const riskScore = findings.length * 25;

    return {
      passed: !hasCritical,
      riskScore: Math.min(riskScore, 100),
      findings,
    };
  }
}
