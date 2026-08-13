import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as lib from '../src/index.js';
import { CodexApiError, SecurityAuditError, ValidationError } from '../src/index.js';

describe('public contracts', () => {
  it('does not export the CLI layer from the library barrel', () => {
    expect('createProgram' in lib).toBe(false);
    expect('runCli' in lib).toBe(false);
    expect(lib.CodexClient).toBeDefined();
    expect(lib.AgentsParser).toBeDefined();
    expect(lib.SecurityAuditor).toBeDefined();

    const barrel = fs.readFileSync(path.resolve('src/index.ts'), 'utf-8');
    expect(barrel).not.toMatch(/from ['"]\.\/cli\//);
  });

  it('exports distinct domain error classes that are throwable', () => {
    expect(new CodexApiError('api', 500, true).name).toBe('CodexApiError');
    expect(new ValidationError('bad').name).toBe('ValidationError');
    expect(new SecurityAuditError('audit').name).toBe('SecurityAuditError');
  });

  it('package.json publishes dist/bin and builds before publish', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf-8')) as {
      files: string[];
      scripts: Record<string, string>;
    };
    expect(pkg.files).toContain('dist');
    expect(pkg.files).toContain('bin');
    expect(pkg.scripts.prepublishOnly).toMatch(/build/);
    expect(pkg.scripts.prepare).toBeDefined();
    expect(pkg.scripts.test).toContain('--coverage');
    expect(pkg.scripts.start).toContain('bin/codex-oss.js');
  });

  it('security workflow audits src/** and not only the barrel', () => {
    const workflow = fs.readFileSync(path.resolve('.github/workflows/security-scan.yml'), 'utf-8');
    expect(workflow).toContain("git ls-files 'src/*.ts' 'src/**/*.ts'");
    expect(workflow).not.toMatch(/audit --file src\/index\.ts\s*$/m);
  });

  it('README and SECURITY do not claim unimplemented capabilities', () => {
    const readme = fs.readFileSync(path.resolve('README.md'), 'utf-8');
    const security = fs.readFileSync(path.resolve('SECURITY.md'), 'utf-8');

    expect(readme).not.toMatch(/Coverage-100%/i);
    expect(readme).not.toMatch(/CI-passing/i);
    expect(readme).not.toMatch(/constructive line-by-line/i);
    expect(readme).not.toMatch(/OWASP top 10 risks/i);
    expect(readme).not.toMatch(/zero lint errors/i);
    expect(security).not.toMatch(/All PRs are audited for credential leaks, dependency vulnerabilities/i);
    expect(readme).toMatch(/80%/);
  });
});
