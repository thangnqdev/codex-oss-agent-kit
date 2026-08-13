import { describe, it, expect } from 'vitest';
import { SecurityAuditor } from '../src/core/security-auditor.js';

describe('SecurityAuditor', () => {
  it('passes clean source code with 0 findings', () => {
    const auditor = new SecurityAuditor();
    const result = auditor.auditContent('const safeVariable = 42;');

    expect(result.passed).toBe(true);
    expect(result.riskScore).toBe(0);
    expect(result.findings.length).toBe(0);
  });

  it('detects OpenAI API key leak as critical finding', () => {
    const auditor = new SecurityAuditor();
    const leakedKey = 'sk-' + 'a'.repeat(40);
    const result = auditor.auditContent(`const apiKey = "${leakedKey}";`);

    expect(result.passed).toBe(false);
    expect(result.riskScore).toBeGreaterThan(0);
    expect(result.findings[0].severity).toBe('critical');
  });

  it('detects eval execution as medium finding', () => {
    const auditor = new SecurityAuditor();
    const result = auditor.auditContent('eval("console.log(1)");');

    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings[0].severity).toBe('medium');
  });
});
