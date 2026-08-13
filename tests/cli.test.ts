import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createProgram, runCli } from '../src/cli/index.js';
import {
  approvedReviewJson,
  createCapturedIo,
  envWithoutKey,
  jsonCompletionResponse,
  rejectedReviewJson,
} from './helpers.js';

const sampleDiff = path.resolve(process.cwd(), 'tests/fixtures/sample.diff');
const secretFile = path.resolve(process.cwd(), 'tests/fixtures/secret-sample.ts');
const cleanFile = path.resolve(process.cwd(), 'tests/fixtures/clean-sample.ts');

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('CLI Commands', () => {
  it('creates commander program with review, triage, audit commands', () => {
    const program = createProgram();
    expect(program.name()).toBe('codex-oss');
    const commandNames = program.commands.map((cmd) => cmd.name());
    expect(commandNames).toContain('review');
    expect(commandNames).toContain('triage');
    expect(commandNames).toContain('audit');
  });

  it('prints help and exits 0', async () => {
    const io = createCapturedIo();
    const code = await runCli(['--help'], io);
    expect(code).toBe(0);
    expect(io.out()).toContain('codex-oss');
  });

  it('fails review when --diff is missing', async () => {
    const io = createCapturedIo();
    const code = await runCli(['--mock', 'review'], io);
    expect(code).toBe(1);
    expect(io.err()).toMatch(/Missing required --diff/i);
    expect(io.out()).not.toContain('Approved:');
    expect(io.out()).not.toContain('sample');
  });

  it('fails review when the diff path is unreadable', async () => {
    const io = createCapturedIo();
    const missing = path.join(os.tmpdir(), 'codex-missing-diff-does-not-exist.diff');
    const code = await runCli(['--mock', 'review', '--diff', missing], io);
    expect(code).toBe(1);
    expect(io.err()).toMatch(/not found or unreadable/i);
    expect(io.err()).toContain(missing);
    expect(io.out()).not.toContain('Approved:');
  });

  it('reviews a real fixture in mock mode and exits 0', async () => {
    const io = createCapturedIo();
    const code = await runCli(['--mock', 'review', '--diff', sampleDiff], io);
    expect(code).toBe(0);
    expect(io.out()).toContain('Approved: YES');
    expect(io.out()).toMatch(/Quality Score: \d+\/100/);
    expect(io.out()).toContain('Summary:');
  });

  it('fails fast in live mode without a key and does not print a successful review', async () => {
    const io = createCapturedIo(envWithoutKey());
    const code = await runCli(['review', '--diff', sampleDiff], io);
    expect(code).toBe(1);
    expect(io.err()).toMatch(/OPENAI_API_KEY|--api-key|--mock/);
    expect(io.out()).not.toContain('Approved: YES');
  });

  it('exits non-zero when a live review is not approved', async () => {
    globalThis.fetch = async () => jsonCompletionResponse(rejectedReviewJson());
    const io = createCapturedIo();
    const code = await runCli(['--api-key', 'sk-test-key', 'review', '--diff', sampleDiff], io);
    expect(code).toBe(1);
    expect(io.out()).toContain('Approved: NO');
    expect(io.out()).toContain('Does not meet repository standards.');
    expect(io.out()).toContain('missing tests');
  });

  it('applies config model and maxDiffLines on the live request body', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-config-'));
    const configPath = path.join(dir, 'config.json');
    const diffPath = path.join(dir, 'long.diff');
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        reviewSettings: { model: 'gpt-4o-mini', maxDiffLines: 2 },
        rules: { securityAuditOnPR: false },
      }),
    );
    fs.writeFileSync(diffPath, ['line-one', 'line-two', 'line-three', 'line-four'].join('\n'));

    let capturedBody = '';
    globalThis.fetch = async (_input, init) => {
      capturedBody = String(init?.body ?? '');
      return jsonCompletionResponse(approvedReviewJson());
    };

    const io = createCapturedIo();
    const code = await runCli([
      '--api-key',
      'sk-test-key',
      '--config',
      configPath,
      'review',
      '--diff',
      diffPath,
    ], io);

    expect(code).toBe(0);
    const payload = JSON.parse(capturedBody) as { model: string; messages: Array<{ content: string }> };
    expect(payload.model).toBe('gpt-4o-mini');
    const user = payload.messages.find((message) => message.content.includes('Diff Content'));
    expect(user).toBeDefined();
    expect(user?.content).toContain('line-one');
    expect(user?.content).toContain('line-two');
    expect(user?.content).not.toContain('line-three');
  });

  it('fails mock review when securityAuditOnPR finds a secret in the diff', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-secret-diff-'));
    const diffPath = path.join(dir, 'secret.diff');
    fs.writeFileSync(diffPath, '+ const key = "sk-proj-abcdefghijklmnopqrstuvwxyz012345";\n');

    const io = createCapturedIo();
    const code = await runCli(['--mock', 'review', '--diff', diffPath], io);
    expect(code).toBe(1);
    expect(io.out()).toContain('Security Audit Passed: NO');
    expect(io.err()).toContain('SecurityAuditError');
  });

  it('triages an issue in mock mode', async () => {
    const io = createCapturedIo();
    const code = await runCli(['--mock', 'triage', '--title', 'Bug: crash', '--body', 'Steps to reproduce'], io);
    expect(code).toBe(0);
    expect(io.out()).toContain('Category:');
    expect(io.out()).toContain('Complexity:');
    expect(io.out()).toContain('Summary:');
  });

  it('fails triage in live mode without a key', async () => {
    const io = createCapturedIo(envWithoutKey());
    const code = await runCli(['triage', '--title', 'Bug'], io);
    expect(code).toBe(1);
    expect(io.err()).toMatch(/OPENAI_API_KEY|--api-key|--mock/);
  });

  it('fails audit when --file is missing', async () => {
    const io = createCapturedIo();
    const code = await runCli(['audit'], io);
    expect(code).toBe(1);
    expect(io.err()).toMatch(/Missing required --file/i);
    expect(io.out()).not.toContain('Audit Passed:');
  });

  it('fails audit on a fixture containing modern secret prefixes', async () => {
    const io = createCapturedIo();
    const code = await runCli(['audit', '--file', secretFile], io);
    expect(code).toBe(1);
    expect(io.out()).toContain('Audit Passed: NO');
    expect(io.out()).toMatch(/sk-proj|github_pat|SEC001|SEC004/i);
  });

  it('passes audit on a clean fixture', async () => {
    const io = createCapturedIo();
    const code = await runCli(['audit', '--file', cleanFile], io);
    expect(code).toBe(0);
    expect(io.out()).toContain('Audit Passed: YES');
    expect(io.out()).toContain('Findings Count: 0');
  });

  it('returns non-zero for an unknown command', async () => {
    const io = createCapturedIo();
    const code = await runCli(['not-a-command'], io);
    expect(code).toBe(1);
  });
});
