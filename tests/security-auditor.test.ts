import { describe, expect, it } from 'vitest';
import { SecurityAuditError } from '../src/core/errors.js';
import { SecurityAuditor } from '../src/core/security-auditor.js';

describe('SecurityAuditor', () => {
  it('passes clean source code with 0 findings', () => {
    const auditor = new SecurityAuditor();
    const result = auditor.auditContent('const safeVariable = 42;');

    expect(result.passed).toBe(true);
    expect(result.riskScore).toBe(0);
    expect(result.findings.length).toBe(0);
  });

  it('detects classic OpenAI API key leak as critical finding', () => {
    const auditor = new SecurityAuditor();
    const leakedKey = `sk-${'a'.repeat(40)}`;
    const result = auditor.auditContent(`const apiKey = "${leakedKey}";`);

    expect(result.passed).toBe(false);
    expect(result.riskScore).toBeGreaterThan(0);
    expect(result.findings[0]?.severity).toBe('critical');
  });

  it('detects current OpenAI project and service-account key prefixes', () => {
    const auditor = new SecurityAuditor();
    const project = auditor.auditContent('sk-proj-abcdefghijklmnopqrstuvwxyz012345');
    const service = auditor.auditContent('sk-svcacct-abcdefghijklmnopqrstuvwxyz012345');

    expect(project.passed).toBe(false);
    expect(project.findings.some((finding) => finding.ruleId === 'SEC001')).toBe(true);
    expect(service.passed).toBe(false);
    expect(service.findings.some((finding) => finding.ruleId === 'SEC002')).toBe(true);
  });

  it('detects GitHub fine-grained and classic tokens', () => {
    const auditor = new SecurityAuditor();
    const fine = auditor.auditContent('github_pat_abcdefghijklmnopqrstuvwxyz');
    const classic = auditor.auditContent(`ghp_${'b'.repeat(36)}`);

    expect(fine.passed).toBe(false);
    expect(fine.findings.some((finding) => finding.ruleId === 'SEC004')).toBe(true);
    expect(classic.passed).toBe(false);
    expect(classic.findings.some((finding) => finding.ruleId === 'SEC005')).toBe(true);
  });

  it('fails the audit on a high-severity generic SECRET assignment', () => {
    const auditor = new SecurityAuditor();
    const result = auditor.auditContent('const SECRET = "super-secret-value";');
    expect(result.passed).toBe(false);
    expect(result.findings[0]?.severity).toBe('high');
  });

  it('detects eval execution as medium finding and still passes', () => {
    const auditor = new SecurityAuditor();
    const result = auditor.auditContent('eval("console.log(1)");');

    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings[0]?.severity).toBe('medium');
    expect(result.passed).toBe(true);
  });

  it('throws SecurityAuditError from auditOrThrow when the audit fails', () => {
    const auditor = new SecurityAuditor();
    expect(() => auditor.auditOrThrow('sk-proj-abcdefghijklmnopqrstuvwxyz')).toThrow(SecurityAuditError);
  });

  it('returns the result from auditOrThrow when the audit passes', () => {
    const auditor = new SecurityAuditor();
    const result = auditor.auditOrThrow('const ok = true;');
    expect(result.passed).toBe(true);
  });

  it('ignores secrets that only appear on deleted unified-diff lines', () => {
    const auditor = new SecurityAuditor();
    const deleted = [
      'diff --git a/app.ts b/app.ts',
      '--- a/app.ts',
      '+++ b/app.ts',
      '@@ -1,2 +1,1 @@',
      '-const leaked = "sk-proj-abcdefghijklmnopqrstuvwxyz0123456789";',
      ' export const value = 1;',
    ].join('\n');
    expect(auditor.auditContent(deleted).passed).toBe(true);
  });

  it('fails when the same secret is on an added unified-diff line', () => {
    const auditor = new SecurityAuditor();
    const added = [
      'diff --git a/app.ts b/app.ts',
      '--- a/app.ts',
      '+++ b/app.ts',
      '@@ -1,1 +1,2 @@',
      ' export const value = 1;',
      '+const leaked = "sk-proj-abcdefghijklmnopqrstuvwxyz0123456789";',
    ].join('\n');
    expect(auditor.auditContent(added).passed).toBe(false);
  });
});
