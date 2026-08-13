import { describe, expect, it } from 'vitest';
import { CodexClient } from '../src/core/codex-client.js';
import { ValidationError } from '../src/core/errors.js';
import { IssueTriager } from '../src/core/issue-triager.js';
import { jsonCompletionResponse } from './helpers.js';

describe('IssueTriager', () => {
  it('handles empty issue title and body', async () => {
    const client = new CodexClient({ mockMode: true });
    const triager = new IssueTriager(client);
    const result = await triager.triageIssue('', '');

    expect(result.category).toBe('question');
    expect(result.recommendedLabels).toContain('needs-info');
  });

  it('triages bug report issue via mock JSON', async () => {
    const client = new CodexClient({ mockMode: true });
    const triager = new IssueTriager(client);
    const result = await triager.triageIssue('Bug: app crashes', 'Steps to reproduce...');

    expect(result.category).toBe('bug');
    expect(result.recommendedLabels.length).toBeGreaterThan(0);
  });

  it('fails closed on invalid triage JSON instead of heuristic success', async () => {
    const client = new CodexClient({
      apiKey: 'sk-test',
      mockMode: false,
      fetchImpl: async () => jsonCompletionResponse('not-json'),
    });
    const triager = new IssueTriager(client);

    await expect(triager.triageIssue('Bug: crash', 'details')).rejects.toBeInstanceOf(ValidationError);
  });

  it('fails closed on an invalid category', async () => {
    const client = new CodexClient({
      apiKey: 'sk-test',
      mockMode: false,
      fetchImpl: async () => jsonCompletionResponse(JSON.stringify({
        category: 'unknown',
        complexity: 'low',
        recommendedLabels: ['x'],
        hasReproductionSteps: false,
        summary: 'nope',
      })),
    });
    const triager = new IssueTriager(client);

    await expect(triager.triageIssue('title', 'body')).rejects.toSatisfy((error: unknown) => {
      return error instanceof ValidationError && /category/i.test(error.message);
    });
  });
});
