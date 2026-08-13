import { describe, expect, it } from 'vitest';
import { CodexClient } from '../src/core/codex-client.js';
import { CodexApiError, ValidationError } from '../src/core/errors.js';
import { jsonCompletionResponse } from './helpers.js';

describe('CodexClient', () => {
  it('initializes with default options and mock mode', () => {
    const client = new CodexClient({ mockMode: true });
    expect(client.getModel()).toBe('gpt-4o');
    expect(client.isMockMode()).toBe(true);
  });

  it('throws ValidationError when constructed for live use without a key', () => {
    const previous = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      expect(() => new CodexClient({ mockMode: false })).toThrow(ValidationError);
    } finally {
      if (previous === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = previous;
      }
    }
  });

  it('generates mock completion for diff review', async () => {
    const client = new CodexClient({ mockMode: true });
    const response = await client.generateCompletion('review diff changes');
    expect(response).toContain('approved');
    expect(response).toContain('95');
  });

  it('generates mock completion for issue triage', async () => {
    const client = new CodexClient({ mockMode: true });
    const response = await client.generateCompletion('triage issue bug report');
    expect(response).toContain('category');
    expect(response).toContain('bug');
  });

  it('generates mock completion for security audit', async () => {
    const client = new CodexClient({ mockMode: true });
    const response = await client.generateCompletion('audit security findings');
    expect(response).toContain('passed');
  });

  it('generates default mock response for unknown prompt', async () => {
    const client = new CodexClient({ mockMode: true });
    const response = await client.generateCompletion('random prompt');
    expect(response).toBe('Mock Codex Completion Response');
  });

  it('returns message content on a successful live fetch', async () => {
    const client = new CodexClient({
      apiKey: 'sk-test',
      mockMode: false,
      fetchImpl: async () => jsonCompletionResponse('hello-from-api'),
    });
    await expect(client.generateCompletion('hello')).resolves.toBe('hello-from-api');
  });

  it('retries a 429 and then succeeds', async () => {
    let calls = 0;
    const client = new CodexClient({
      apiKey: 'sk-test',
      mockMode: false,
      retryBackoffMs: 1,
      maxRetries: 2,
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) {
          return new Response('rate limited', { status: 429, statusText: 'Too Many Requests' });
        }
        return jsonCompletionResponse('recovered');
      },
    });

    await expect(client.generateCompletion('hello')).resolves.toBe('recovered');
    expect(calls).toBe(2);
  });

  it('retries 5xx and then fails when retries are exhausted', async () => {
    let calls = 0;
    const client = new CodexClient({
      apiKey: 'sk-test',
      mockMode: false,
      retryBackoffMs: 1,
      maxRetries: 1,
      fetchImpl: async () => {
        calls += 1;
        return new Response('unavailable', { status: 503, statusText: 'Service Unavailable' });
      },
    });

    await expect(client.generateCompletion('hello')).rejects.toBeInstanceOf(CodexApiError);
    expect(calls).toBe(2);
  });

  it('does not retry a non-retryable 401', async () => {
    let calls = 0;
    const client = new CodexClient({
      apiKey: 'sk-test',
      mockMode: false,
      maxRetries: 3,
      fetchImpl: async () => {
        calls += 1;
        return new Response('nope', { status: 401, statusText: 'Unauthorized' });
      },
    });

    await expect(client.generateCompletion('hello')).rejects.toBeInstanceOf(CodexApiError);
    expect(calls).toBe(1);
  });

  it('times out a hung fetch', async () => {
    const client = new CodexClient({
      apiKey: 'sk-test',
      mockMode: false,
      timeoutMs: 30,
      maxRetries: 0,
      fetchImpl: () => new Promise<Response>(() => undefined),
    });

    await expect(client.generateCompletion('hello')).rejects.toSatisfy((error: unknown) => {
      return error instanceof CodexApiError && /timed out/i.test(error.message);
    });
  });

  it('rejects malformed JSON bodies', async () => {
    const client = new CodexClient({
      apiKey: 'sk-test',
      mockMode: false,
      fetchImpl: async () => new Response('not-json', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    });

    await expect(client.generateCompletion('hello')).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects empty model content', async () => {
    const client = new CodexClient({
      apiKey: 'sk-test',
      mockMode: false,
      fetchImpl: async () => jsonCompletionResponse('   '),
    });

    await expect(client.generateCompletion('hello')).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a JSON body with no choices', async () => {
    const client = new CodexClient({
      apiKey: 'sk-test',
      mockMode: false,
      fetchImpl: async () => new Response(JSON.stringify({ choices: [] }), { status: 200 }),
    });

    await expect(client.generateCompletion('hello')).rejects.toBeInstanceOf(ValidationError);
  });

  it('wraps unexpected fetch failures as CodexApiError', async () => {
    const client = new CodexClient({
      apiKey: 'sk-test',
      mockMode: false,
      fetchImpl: async () => {
        throw new Error('socket hang up');
      },
    });

    await expect(client.generateCompletion('hello')).rejects.toSatisfy((error: unknown) => {
      return error instanceof CodexApiError && error.message.includes('socket hang up');
    });
  });

  it('maps AbortError from fetch to a timeout CodexApiError', async () => {
    const client = new CodexClient({
      apiKey: 'sk-test',
      mockMode: false,
      fetchImpl: async () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        throw error;
      },
    });

    await expect(client.generateCompletion('hello')).rejects.toSatisfy((error: unknown) => {
      return error instanceof CodexApiError && /timed out/i.test(error.message);
    });
  });
});
