import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GitHubApiError, ValidationError } from '../src/core/errors.js';
import { GitHubClient, parseRepoSlug } from '../src/core/github-client.js';

interface CapturedRequest {
  readonly url: string;
  readonly init: RequestInit;
}

describe('parseRepoSlug', () => {
  it('splits owner and name on a single slash', () => {
    expect(parseRepoSlug('thangnqdev/codex-oss-agent-kit')).toEqual({
      owner: 'thangnqdev',
      name: 'codex-oss-agent-kit',
    });
  });

  it('rejects empty or malformed values', () => {
    expect(() => parseRepoSlug('foo')).toThrow(ValidationError);
    expect(() => parseRepoSlug('foo/')).toThrow(ValidationError);
    expect(() => parseRepoSlug('/foo')).toThrow(ValidationError);
    expect(() => parseRepoSlug('foo/bar/baz')).toThrow(ValidationError);
  });
});

describe('GitHubClient', () => {
  let responses: Response[];
  let captured: CapturedRequest[];
  let originalFetch: typeof globalThis.fetch;
  let callIndex = 0;

  beforeEach(() => {
    captured = [];
    responses = [];
    callIndex = 0;
    originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: string | URL, init?: RequestInit): Promise<Response> => {
      captured.push({
        url: typeof input === 'string' ? input : input.toString(),
        init: init ?? {},
      });
      const reply = responses[callIndex] ?? new Response('{}', { status: 200 });
      callIndex += 1;
      return reply;
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function jsonResponse(body: unknown, status: number = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      headers: { 'Content-Type': 'application/json' },
    });
  }

  function ok(): Response {
    return jsonResponse({}, 200);
  }

  it('posts a PR review with the expected headers and body', async () => {
    responses.push(ok());
    const client = new GitHubClient({ token: 'tok', repo: 'owner/name' });
    await client.postPRReview(42, {
      event: 'APPROVE',
      body: 'Looks good.',
      commitId: 'abcdef',
    });

    expect(captured).toHaveLength(1);
    const req = captured[0]!;
    expect(req.url).toBe('https://api.github.com/repos/owner/name/pulls/42/reviews');
    expect(req.init.method).toBe('POST');
    const headers = req.init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer tok');
    expect(headers['Accept']).toBe('application/vnd.github+json');
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['X-GitHub-Api-Version']).toBe('2022-11-28');
    const body = JSON.parse(String(req.init.body)) as Record<string, unknown>;
    expect(body).toEqual({
      event: 'APPROVE',
      body: 'Looks good.',
      commit_id: 'abcdef',
    });
  });

  it('omits commit_id when not provided', async () => {
    responses.push(ok());
    const client = new GitHubClient({ token: 'tok', repo: 'owner/name' });
    await client.postPRReview(1, { event: 'COMMENT', body: 'comments' });
    const body = JSON.parse(String(captured[0]!.init.body)) as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(['event', 'body']);
  });

  it('posts labels to an issue', async () => {
    responses.push(ok());
    const client = new GitHubClient({ token: 'tok', repo: 'owner/name' });
    await client.addLabels(7, ['bug', ' triage-needed ', '']);
    expect(captured[0]!.url).toBe('https://api.github.com/repos/owner/name/issues/7/labels');
    const body = JSON.parse(String(captured[0]!.init.body)) as { labels: string[] };
    expect(body.labels).toEqual(['bug', 'triage-needed']);
  });

  it('posts a check run with conclusion and sha', async () => {
    responses.push(ok());
    const client = new GitHubClient({ token: 'tok', repo: 'owner/name' });
    await client.postCheckRun({
      name: 'codex-oss-review',
      headSha: 'deadbeef',
      conclusion: 'success',
      title: 'Codex OSS Review',
      summary: 'All clean.',
    });
    expect(captured[0]!.url).toBe('https://api.github.com/repos/owner/name/check-runs');
    const body = JSON.parse(String(captured[0]!.init.body)) as Record<string, unknown>;
    expect(body['head_sha']).toBe('deadbeef');
    expect(body['conclusion']).toBe('success');
    expect(body['status']).toBe('completed');
  });

  it('uses a custom apiBaseUrl when provided', async () => {
    responses.push(ok());
    const client = new GitHubClient({
      token: 'tok',
      repo: 'owner/name',
      apiBaseUrl: 'https://github.example.com/api/v3/',
    });
    await client.postPRReview(1, { event: 'COMMENT', body: 'x' });
    expect(captured[0]!.url).toBe(
      'https://github.example.com/api/v3/repos/owner/name/pulls/1/reviews',
    );
  });

  it('rejects empty token or invalid repo', () => {
    expect(() => new GitHubClient({ token: '', repo: 'owner/name' })).toThrow(ValidationError);
    expect(() => new GitHubClient({ token: 'tok', repo: 'no-slash' })).toThrow(ValidationError);
  });

  it('rejects invalid pull or issue numbers', async () => {
    const client = new GitHubClient({ token: 'tok', repo: 'owner/name' });
    await expect(client.postPRReview(0, { event: 'COMMENT', body: 'x' })).rejects.toThrow(
      ValidationError,
    );
    await expect(client.addLabels(-1, ['bug'])).rejects.toThrow(ValidationError);
  });

  it('rejects empty review body or labels', async () => {
    const client = new GitHubClient({ token: 'tok', repo: 'owner/name' });
    await expect(client.postPRReview(1, { event: 'COMMENT', body: '   ' })).rejects.toThrow(
      /body must not be empty/i,
    );
    await expect(client.addLabels(1, ['', ' '])).rejects.toThrow(/at least one non-empty label/i);
  });

  it('throws GitHubApiError on 4xx with retryable=false', async () => {
    responses.push(jsonResponse({ message: 'not found' }, 404));
    const client = new GitHubClient({ token: 'tok', repo: 'owner/name' });
    await expect(client.postPRReview(1, { event: 'COMMENT', body: 'x' })).rejects.toMatchObject({
      name: 'GitHubApiError',
      status: 404,
      retryable: false,
    });
    expect(captured).toHaveLength(1);
  });

  it('retries on 429 with exponential backoff and then succeeds', async () => {
    responses.push(jsonResponse({}, 429));
    responses.push(jsonResponse({}, 200));
    const client = new GitHubClient({
      token: 'tok',
      repo: 'owner/name',
      retryBackoffMs: 1,
      maxRetries: 2,
    });
    await client.postPRReview(1, { event: 'COMMENT', body: 'x' });
    expect(captured).toHaveLength(2);
    expect(captured[0]!.url).toBe(captured[1]!.url);
  });

  it('retries on 500 and stops after maxRetries', async () => {
    responses.push(jsonResponse({}, 500));
    responses.push(jsonResponse({}, 500));
    responses.push(jsonResponse({}, 500));
    const client = new GitHubClient({
      token: 'tok',
      repo: 'owner/name',
      retryBackoffMs: 1,
      maxRetries: 1,
    });
    await expect(client.postPRReview(1, { event: 'COMMENT', body: 'x' })).rejects.toMatchObject({
      status: 500,
      retryable: true,
    });
    expect(captured).toHaveLength(2);
  });

  it('throws a timeout error when fetch stalls', async () => {
    globalThis.fetch = (_input, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    };
    const client = new GitHubClient({
      token: 'tok',
      repo: 'owner/name',
      timeoutMs: 10,
      maxRetries: 0,
    });
    await expect(client.postPRReview(1, { event: 'COMMENT', body: 'x' })).rejects.toMatchObject({
      name: 'GitHubApiError',
      retryable: false,
    });
  });

  it('wraps unexpected network errors as GitHubApiError', async () => {
    globalThis.fetch = () => {
      return Promise.reject(new Error('ECONNRESET'));
    };
    const client = new GitHubClient({
      token: 'tok',
      repo: 'owner/name',
      maxRetries: 0,
    });
    await expect(client.postPRReview(1, { event: 'COMMENT', body: 'x' })).rejects.toMatchObject({
      name: 'GitHubApiError',
      message: expect.stringContaining('ECONNRESET'),
    });
  });

  it('surfaces the GitHubApiError type from the public barrel', () => {
    const err = new GitHubApiError('boom', 502, true);
    expect(err.name).toBe('GitHubApiError');
    expect(err.status).toBe(502);
    expect(err.retryable).toBe(true);
  });
});
