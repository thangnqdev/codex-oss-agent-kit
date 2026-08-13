import { describe, expect, it } from 'vitest';
import { CodexClient } from '../src/core/codex-client.js';
import { ValidationError } from '../src/core/errors.js';
import { PRAnalyzer } from '../src/core/pr-analyzer.js';
import { jsonCompletionResponse, rejectedReviewJson } from './helpers.js';

describe('PRAnalyzer', () => {
  it('handles empty diff gracefully', async () => {
    const client = new CodexClient({ mockMode: true });
    const analyzer = new PRAnalyzer(client);
    const result = await analyzer.analyzeDiff('');

    expect(result.approved).toBe(true);
    expect(result.score).toBe(100);
    expect(result.summary).toContain('Empty diff');
  });

  it('analyzes non-empty diff using CodexClient mock output', async () => {
    const client = new CodexClient({ mockMode: true });
    const analyzer = new PRAnalyzer(client);
    const result = await analyzer.analyzeDiff('+ const x = 1;', ['Enforce strict types']);

    expect(result.approved).toBe(true);
    expect(result.score).toBe(95);
    expect(result.summary).toBeDefined();
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  it('fails closed when the model returns invalid JSON', async () => {
    const client = new CodexClient({
      apiKey: 'sk-test',
      mockMode: false,
      fetchImpl: async () => jsonCompletionResponse('this is not json'),
    });
    const analyzer = new PRAnalyzer(client);

    await expect(analyzer.analyzeDiff('+ const x = 1;')).rejects.toBeInstanceOf(ValidationError);
  });

  it('fails closed when approved is missing (does not auto-approve)', async () => {
    const client = new CodexClient({
      apiKey: 'sk-test',
      mockMode: false,
      fetchImpl: async () => jsonCompletionResponse(JSON.stringify({
        score: 10,
        summary: 'bad',
        ruleViolations: [],
        suggestions: [],
      })),
    });
    const analyzer = new PRAnalyzer(client);

    await expect(analyzer.analyzeDiff('+ const x = 1;')).rejects.toSatisfy((error: unknown) => {
      return error instanceof ValidationError && /approved/i.test(error.message);
    });
  });

  it('returns a rejected review when the model JSON says so', async () => {
    const client = new CodexClient({
      apiKey: 'sk-test',
      mockMode: false,
      fetchImpl: async () => jsonCompletionResponse(rejectedReviewJson()),
    });
    const analyzer = new PRAnalyzer(client);
    const result = await analyzer.analyzeDiff('+ const x = 1;');
    expect(result.approved).toBe(false);
    expect(result.score).toBe(12);
  });
});
