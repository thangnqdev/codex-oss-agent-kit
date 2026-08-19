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
    expect(io.out()).toMatch(/Reviewed lines: \d+\/\d+/);
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

  it('applies config model and chunks an oversized diff so every line is reviewed', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-config-'));
    const configPath = path.join(dir, 'config.json');
    const diffPath = path.join(dir, 'long.diff');
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        reviewSettings: { model: 'gpt-5.6', maxDiffLines: 2 },
        rules: { securityAuditOnPR: false },
      }),
    );
    fs.writeFileSync(diffPath, ['line-one', 'line-two', 'line-three', 'line-four'].join('\n'));

    const bodies: string[] = [];
    let url = '';
    globalThis.fetch = async (input, init) => {
      url = String(input);
      bodies.push(String(init?.body ?? ''));
      return jsonCompletionResponse(approvedReviewJson());
    };

    const io = createCapturedIo();
    const code = await runCli(
      ['--api-key', 'sk-test-key', '--config', configPath, 'review', '--diff', diffPath],
      io,
    );

    expect(code).toBe(0);
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(bodies.length).toBeGreaterThan(1);
    const combined = bodies.join('\n');
    const payload = JSON.parse(bodies[0] ?? '{}') as {
      model: string;
      text?: { format?: { type?: string } };
      input?: Array<{ content: string }>;
    };
    expect(payload.model).toBe('gpt-5.6');
    expect(payload.text?.format?.type).toBe('json_schema');
    expect(combined).toContain('line-one');
    expect(combined).toContain('line-two');
    expect(combined).toContain('line-three');
    expect(combined).toContain('line-four');
    expect(io.out()).toMatch(/Reviewed lines: 4\/4/);
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
    const code = await runCli(
      ['--mock', 'triage', '--title', 'Bug: crash', '--body', 'Steps to reproduce'],
      io,
    );
    expect(code).toBe(0);
    expect(io.out()).toContain('Category:');
    expect(io.out()).toContain('Complexity:');
    expect(io.out()).toContain('Summary:');
  });

  it('triages an issue as JSON with --format json', async () => {
    const io = createCapturedIo();
    const code = await runCli(
      ['--mock', '--format', 'json', 'triage', '--title', 'Bug: crash', '--body', 'Steps'],
      io,
    );
    expect(code).toBe(0);
    const payload = JSON.parse(io.out()) as {
      category: string;
      complexity: string;
      recommendedLabels: string[];
    };
    expect(payload.category).toBe('bug');
    expect(payload.complexity).toBe('medium');
    expect(Array.isArray(payload.recommendedLabels)).toBe(true);
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

  it('audits a unified diff that only deletes a secret as a pass', async () => {
    const io = createCapturedIo();
    const deleted = path.resolve(process.cwd(), 'tests/fixtures/delete-secret.diff');
    const code = await runCli(['audit', '--file', deleted], io);
    expect(code).toBe(0);
    expect(io.out()).toContain('Audit Passed: YES');
  });

  it('audits a unified diff that adds a secret as a fail', async () => {
    const io = createCapturedIo();
    const added = path.resolve(process.cwd(), 'tests/fixtures/add-secret.diff');
    const code = await runCli(['audit', '--file', added], io);
    expect(code).toBe(1);
    expect(io.out()).toContain('Audit Passed: NO');
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

  it('audits as JSON with --format json and still exits non-zero on findings', async () => {
    const io = createCapturedIo();
    const code = await runCli(['--format', 'json', 'audit', '--file', secretFile], io);
    expect(code).toBe(1);
    const payload = JSON.parse(io.out()) as {
      passed: boolean;
      riskScore: number;
      findings: Array<{ ruleId: string }>;
    };
    expect(payload.passed).toBe(false);
    expect(payload.riskScore).toBeGreaterThan(0);
    expect(payload.findings.length).toBeGreaterThan(0);
  });

  it('prints the package version with --version', async () => {
    const io = createCapturedIo();
    const code = await runCli(['--version'], io);
    expect(code).toBe(0);
    expect(io.out().trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('applies --model and --max-diff-lines CLI overrides', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-overrides-'));
    const diffPath = path.join(dir, 'small.diff');
    fs.writeFileSync(diffPath, ['line-one', 'line-two', 'line-three', 'line-four'].join('\n'));

    const bodies: string[] = [];
    globalThis.fetch = async (_input, init) => {
      bodies.push(String(init?.body ?? ''));
      return jsonCompletionResponse(approvedReviewJson());
    };

    const io = createCapturedIo();
    const code = await runCli(
      [
        '--api-key',
        'sk-test-key',
        '--model',
        'gpt-4o-mini',
        '--max-diff-lines',
        '2',
        '--config',
        path.join(dir, 'missing-config.json'),
        'review',
        '--diff',
        diffPath,
      ],
      io,
    );

    expect(code).toBe(0);
    expect(bodies.length).toBe(2);
    const payload = JSON.parse(bodies[0] ?? '{}') as { model: string };
    expect(payload.model).toBe('gpt-4o-mini');
  });

  it('ignores a blank --model override and keeps the config model', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-blank-model-'));
    const diffPath = path.join(dir, 'small.diff');
    fs.writeFileSync(diffPath, 'single-line');

    let model = '';
    globalThis.fetch = async (_input, init) => {
      const payload = JSON.parse(String(init?.body ?? '{}')) as { model: string };
      model = payload.model;
      return jsonCompletionResponse(approvedReviewJson());
    };

    const io = createCapturedIo();
    const code = await runCli(
      [
        '--api-key',
        'sk-test-key',
        '--model',
        '   ',
        '--config',
        path.join(dir, 'missing-config.json'),
        'review',
        '--diff',
        diffPath,
      ],
      io,
    );

    expect(code).toBe(0);
    expect(model).toBe('gpt-5.6');
  });

  it('rejects a non-numeric --max-diff-lines value', async () => {
    const io = createCapturedIo();
    const code = await runCli(
      ['--mock', '--max-diff-lines', 'not-a-number', 'review', '--diff', sampleDiff],
      io,
    );
    expect(code).toBe(1);
    expect(io.err()).toMatch(/--max-diff-lines must be a positive number/i);
  });

  it('rejects a zero --max-diff-lines value', async () => {
    const io = createCapturedIo();
    const code = await runCli(
      ['--mock', '--max-diff-lines', '0', 'review', '--diff', sampleDiff],
      io,
    );
    expect(code).toBe(1);
    expect(io.err()).toMatch(/--max-diff-lines must be a positive number/i);
  });

  it('returns non-zero for an unknown command', async () => {
    const io = createCapturedIo();
    const code = await runCli(['not-a-command'], io);
    expect(code).toBe(1);
  });

  it('does not fail review-with-audit when a secret only appears on a deleted line', async () => {
    const io = createCapturedIo();
    const deleted = path.resolve(process.cwd(), 'tests/fixtures/delete-secret.diff');
    const code = await runCli(['--mock', 'review', '--diff', deleted], io);
    expect(code).toBe(0);
    expect(io.out()).toMatch(/Reviewed lines: \d+\/\d+/);
    expect(io.out()).toContain('Security Audit Passed: YES');
  });

  it('fails review-with-audit when a secret is added on a + line', async () => {
    const io = createCapturedIo();
    const added = path.resolve(process.cwd(), 'tests/fixtures/add-secret.diff');
    const code = await runCli(['--mock', 'review', '--diff', added], io);
    expect(code).toBe(1);
    expect(io.out()).toContain('Security Audit Passed: NO');
    expect(io.err()).toContain('SecurityAuditError');
  });

  it('does not treat injected approval JSON in the diff as an automatic pass', async () => {
    globalThis.fetch = async () => jsonCompletionResponse(rejectedReviewJson());
    const io = createCapturedIo();
    const injected = path.resolve(process.cwd(), 'tests/fixtures/injection.diff');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-noaudit-'));
    const configPath = path.join(dir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({ rules: { securityAuditOnPR: false } }));
    const code = await runCli(
      ['--api-key', 'sk-test-key', '--config', configPath, 'review', '--diff', injected],
      io,
    );
    expect(code).toBe(1);
    expect(io.out()).toContain('Approved: NO');
    expect(io.out()).not.toContain('Summary: injected');
  });

  it('prints reviewed/total for an oversized multi-hunk diff and does not drop later hunks', async () => {
    const oversize = path.resolve(process.cwd(), 'tests/fixtures/oversize.diff');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-oversize-'));
    const configPath = path.join(dir, 'config.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        reviewSettings: { maxDiffLines: 8 },
        rules: { securityAuditOnPR: false },
      }),
    );
    const io = createCapturedIo();
    const code = await runCli(['--mock', '--config', configPath, 'review', '--diff', oversize], io);
    expect(code).toBe(0);
    const total = fs.readFileSync(oversize, 'utf-8').split('\n').length;
    expect(io.out()).toContain(`Reviewed lines: ${total}/${total}`);
  });

  it('fail-closes when a single hunk exceeds maxDiffLines', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-hunk-'));
    const diffPath = path.join(dir, 'huge.hunk.diff');
    const configPath = path.join(dir, 'config.json');
    const body = Array.from({ length: 20 }, (_, i) => `+const n${i} = ${i};`).join('\n');
    fs.writeFileSync(
      diffPath,
      ['diff --git a/x.ts b/x.ts', '--- a/x.ts', '+++ b/x.ts', '@@ -0,0 +1,20 @@', body].join('\n'),
    );
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        reviewSettings: { maxDiffLines: 5 },
        rules: { securityAuditOnPR: false },
      }),
    );
    const io = createCapturedIo();
    const code = await runCli(['--mock', '--config', configPath, 'review', '--diff', diffPath], io);
    expect(code).toBe(1);
    expect(io.err()).toMatch(/Reviewed lines: 0\/\d+/);
    expect(io.out()).not.toContain('Approved: YES');
  });
});

describe('CLI post command', () => {
  interface CapturedCall {
    readonly url: string;
    readonly init: RequestInit;
  }

  let captured: CapturedCall[] = [];
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    captured = [];
  });

  function stubFetch(status: number = 200): void {
    globalThis.fetch = async (input: string | URL, init?: RequestInit): Promise<Response> => {
      captured.push({
        url: typeof input === 'string' ? input : input.toString(),
        init: init ?? {},
      });
      return new Response('{}', {
        status,
        statusText: status === 200 ? 'OK' : 'Error',
        headers: { 'Content-Type': 'application/json' },
      });
    };
  }

  function envWithGitHub(): NodeJS.ProcessEnv {
    return {
      ...envWithoutKey(),
      GITHUB_TOKEN: 'gh-test-token',
      GITHUB_REPOSITORY: 'owner/name',
    };
  }

  function writeReviewFile(dir: string, approved: boolean): string {
    const reviewPath = path.join(dir, 'review.json');
    fs.writeFileSync(
      reviewPath,
      JSON.stringify({
        approved,
        score: approved ? 95 : 40,
        summary: approved ? 'LGTM' : 'Needs work',
        ruleViolations: approved ? [] : ['missing tests'],
        suggestions: ['add tests'],
      }),
    );
    return reviewPath;
  }

  it('posts an approved review as APPROVE event', async () => {
    stubFetch();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-post-'));
    const reviewPath = writeReviewFile(dir, true);
    const io = createCapturedIo(envWithGitHub());
    const code = await runCli(
      ['post', 'review', '--repo', 'owner/name', '--pr', '42', '--result', reviewPath],
      io,
    );
    expect(code).toBe(0);
    expect(io.out()).toContain('Posted APPROVE review on PR #42');
    expect(captured).toHaveLength(1);
    expect(captured[0]!.url).toBe('https://api.github.com/repos/owner/name/pulls/42/reviews');
    const body = JSON.parse(String(captured[0]!.init.body)) as Record<string, unknown>;
    expect(body['event']).toBe('APPROVE');
    expect(String(body['body'])).toContain('LGTM');
  });

  it('posts a rejected review as COMMENT event and supports --event override', async () => {
    stubFetch();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-post-'));
    const reviewPath = writeReviewFile(dir, false);
    const io = createCapturedIo(envWithGitHub());
    const code = await runCli(
      [
        'post',
        'review',
        '--repo',
        'owner/name',
        '--pr',
        '7',
        '--result',
        reviewPath,
        '--event',
        'request-changes',
      ],
      io,
    );
    expect(code).toBe(0);
    const body = JSON.parse(String(captured[0]!.init.body)) as Record<string, unknown>;
    expect(body['event']).toBe('REQUEST_CHANGES');
    expect(String(body['body'])).toContain('missing tests');
  });

  it('accepts explicit approve and comment events and tolerates missing arrays', async () => {
    stubFetch();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-post-'));
    const reviewPath = path.join(dir, 'minimal.json');
    fs.writeFileSync(
      reviewPath,
      JSON.stringify({ approved: false, score: 50, summary: 'Minimal payload' }),
    );
    const io = createCapturedIo(envWithGitHub());
    const approveCode = await runCli(
      [
        'post',
        'review',
        '--repo',
        'owner/name',
        '--pr',
        '1',
        '--result',
        reviewPath,
        '--event',
        'approve',
      ],
      io,
    );
    expect(approveCode).toBe(0);
    const approveBody = JSON.parse(String(captured[0]!.init.body)) as Record<string, unknown>;
    expect(approveBody['event']).toBe('APPROVE');
    expect(String(approveBody['body'])).toContain('Minimal payload');
    expect(String(approveBody['body'])).not.toContain('Rule Violations');

    const io2 = createCapturedIo(envWithGitHub());
    const commentCode = await runCli(
      [
        'post',
        'review',
        '--repo',
        'owner/name',
        '--pr',
        '2',
        '--result',
        reviewPath,
        '--event',
        'comment',
      ],
      io2,
    );
    expect(commentCode).toBe(0);
    const commentBody = JSON.parse(String(captured[captured.length - 1]!.init.body)) as Record<
      string,
      unknown
    >;
    expect(commentBody['event']).toBe('COMMENT');
  });

  it('posts in JSON format when --format json is set', async () => {
    stubFetch();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-post-'));
    const reviewPath = writeReviewFile(dir, true);
    const io = createCapturedIo(envWithGitHub());
    const code = await runCli(
      [
        '--format',
        'json',
        'post',
        'review',
        '--repo',
        'owner/name',
        '--pr',
        '3',
        '--result',
        reviewPath,
      ],
      io,
    );
    expect(code).toBe(0);
    expect(io.out()).toContain('"posted":true');
    expect(io.out()).not.toContain('Posted APPROVE review on PR #3');
  });

  it('adds labels from a comma-separated list', async () => {
    stubFetch();
    const io = createCapturedIo(envWithGitHub());
    const code = await runCli(
      ['post', 'labels', '--repo', 'owner/name', '--issue', '9', '--labels', 'bug, triage-needed'],
      io,
    );
    expect(code).toBe(0);
    expect(io.out()).toContain('Added labels to #9: bug, triage-needed');
    expect(captured[0]!.url).toBe('https://api.github.com/repos/owner/name/issues/9/labels');
    const body = JSON.parse(String(captured[0]!.init.body)) as { labels: string[] };
    expect(body.labels).toEqual(['bug', 'triage-needed']);
  });

  it('posts a check run with the given conclusion', async () => {
    stubFetch();
    const io = createCapturedIo(envWithGitHub());
    const code = await runCli(
      [
        'post',
        'check',
        '--repo',
        'owner/name',
        '--sha',
        'deadbeef',
        '--name',
        'codex-review',
        '--conclusion',
        'success',
        '--title',
        'Codex OSS Review',
        '--summary',
        'All clean.',
      ],
      io,
    );
    expect(code).toBe(0);
    expect(io.out()).toContain('Posted check run "codex-review" (success)');
    expect(captured[0]!.url).toBe('https://api.github.com/repos/owner/name/check-runs');
    const body = JSON.parse(String(captured[0]!.init.body)) as Record<string, unknown>;
    expect(body['conclusion']).toBe('success');
    expect(body['head_sha']).toBe('deadbeef');
  });

  it('fails when GITHUB_TOKEN is missing', async () => {
    const io = createCapturedIo(envWithoutKey());
    const code = await runCli(
      ['post', 'labels', '--repo', 'owner/name', '--issue', '1', '--labels', 'bug'],
      io,
    );
    expect(code).toBe(1);
    expect(io.err()).toMatch(/GITHUB_TOKEN/);
  });

  it('fails when the repo is missing', async () => {
    const io = createCapturedIo({
      ...envWithoutKey(),
      GITHUB_TOKEN: 'gh-test-token',
    });
    const code = await runCli(['post', 'labels', '--issue', '1', '--labels', 'bug'], io);
    expect(code).toBe(1);
    expect(io.err()).toMatch(/--repo|GITHUB_REPOSITORY/);
  });

  it('fails on an invalid review payload', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-post-'));
    const badPath = path.join(dir, 'bad.json');
    fs.writeFileSync(badPath, 'not json');
    const io = createCapturedIo(envWithGitHub());
    const code = await runCli(
      ['post', 'review', '--repo', 'owner/name', '--pr', '1', '--result', badPath],
      io,
    );
    expect(code).toBe(1);
    expect(io.err()).toMatch(/valid JSON/);
  });

  it('fails when the review payload is not a JSON object or lacks required fields', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-post-'));
    const nullPath = path.join(dir, 'null.json');
    fs.writeFileSync(nullPath, 'null');
    const io = createCapturedIo(envWithGitHub());
    const nullCode = await runCli(
      ['post', 'review', '--repo', 'owner/name', '--pr', '1', '--result', nullPath],
      io,
    );
    expect(nullCode).toBe(1);
    expect(io.err()).toMatch(/JSON object/);

    const fieldsPath = path.join(dir, 'fields.json');
    fs.writeFileSync(fieldsPath, JSON.stringify({ approved: 'yes', score: 'hi', summary: 5 }));
    const io2 = createCapturedIo(envWithGitHub());
    const fieldsCode = await runCli(
      ['post', 'review', '--repo', 'owner/name', '--pr', '1', '--result', fieldsPath],
      io2,
    );
    expect(fieldsCode).toBe(1);
    expect(io2.err()).toMatch(/approved|score|summary/);
  });

  it('fails when --pr is missing', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-post-'));
    const reviewPath = writeReviewFile(dir, true);
    const io = createCapturedIo(envWithGitHub());
    const code = await runCli(
      ['post', 'review', '--repo', 'owner/name', '--result', reviewPath],
      io,
    );
    expect(code).toBe(1);
    expect(io.err()).toMatch(/--pr/);
  });

  it('fails on invalid --event and --conclusion values', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-post-'));
    const reviewPath = writeReviewFile(dir, true);
    const io = createCapturedIo(envWithGitHub());
    const badEvent = await runCli(
      [
        'post',
        'review',
        '--repo',
        'owner/name',
        '--pr',
        '1',
        '--result',
        reviewPath,
        '--event',
        'banana',
      ],
      io,
    );
    expect(badEvent).toBe(1);
    expect(io.err()).toMatch(/--event/);

    const io2 = createCapturedIo(envWithGitHub());
    const badConclusion = await runCli(
      ['post', 'check', '--repo', 'owner/name', '--sha', 'x', '--conclusion', 'banana'],
      io2,
    );
    expect(badConclusion).toBe(1);
    expect(io2.err()).toMatch(/--conclusion/);
  });

  it('propagates GitHubApiError failures as exit 1', async () => {
    stubFetch(403);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-post-'));
    const reviewPath = writeReviewFile(dir, true);
    const io = createCapturedIo(envWithGitHub());
    const code = await runCli(
      ['post', 'review', '--repo', 'owner/name', '--pr', '1', '--result', reviewPath],
      io,
    );
    expect(code).toBe(1);
    expect(io.err()).toMatch(/GitHubApiError/);
  });
});
