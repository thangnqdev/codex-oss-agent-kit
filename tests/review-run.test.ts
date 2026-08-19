import { describe, expect, it } from 'vitest';
import { CodexClient } from '../src/core/codex-client.js';
import { aggregateReviewResults, runReview } from '../src/core/review-run.js';
import { ValidationError } from '../src/core/errors.js';
import { jsonResponsesResponse, rejectedReviewJson } from './helpers.js';

describe('runReview orchestrator', () => {
  it('aggregates chunked reviews and reports reviewed vs total lines', async () => {
    let calls = 0;
    const client = new CodexClient({
      apiKey: 'sk-test',
      mockMode: false,
      fetchImpl: async () => {
        calls += 1;
        return jsonResponsesResponse(rejectedReviewJson());
      },
    });

    const result = await runReview({
      diffContent: 'one\ntwo\nthree\nfour',
      agentsText: 'Never import CLI modules inside core or types.',
      maxDiffLines: 2,
      client,
    });

    expect(calls).toBe(2);
    expect(result.reviewedLines).toBe(4);
    expect(result.totalLines).toBe(4);
    expect(result.chunkCount).toBe(2);
    expect(result.approved).toBe(false);
  });

  it('reviews chunks concurrently without exceeding the concurrency limit', async () => {
    let active = 0;
    let peak = 0;
    const client = new CodexClient({
      apiKey: 'sk-test',
      mockMode: false,
      fetchImpl: async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 10));
        active -= 1;
        return jsonResponsesResponse(rejectedReviewJson());
      },
    });

    const result = await runReview({
      diffContent: 'a\nb\nc\nd\ne\nf\ng\nh',
      agentsText: 'rules',
      maxDiffLines: 2,
      client,
      concurrency: 2,
    });

    expect(result.chunkCount).toBe(4);
    expect(peak).toBe(2);
    expect(result.summary).toContain('Chunk 1:');
    expect(result.summary).toContain('Chunk 4:');
  });

  it('keeps chunk summaries in diff order even when chunks finish out of order', async () => {
    const client = new CodexClient({
      apiKey: 'sk-test',
      mockMode: false,
      fetchImpl: async (_input, init) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          input?: Array<{ content: string }>;
        };
        const userContent = body.input?.[1]?.content ?? '';
        const summary = userContent.includes('first-chunk') ? 'first' : 'second';
        // Make the first chunk slower so the second finishes first.
        await new Promise((resolve) => setTimeout(resolve, summary === 'first' ? 20 : 1));
        return jsonResponsesResponse(
          JSON.stringify({
            approved: true,
            score: 90,
            summary,
            ruleViolations: [],
            suggestions: [],
          }),
        );
      },
    });

    const result = await runReview({
      diffContent: 'first-chunk\nsecond-chunk',
      agentsText: 'rules',
      maxDiffLines: 1,
      client,
      concurrency: 2,
    });

    expect(result.summary).toBe('Chunk 1: first Chunk 2: second');
  });

  it('returns an approved empty-diff result without calling the model', async () => {
    let calls = 0;
    const client = new CodexClient({
      apiKey: 'sk-test',
      mockMode: false,
      fetchImpl: async () => {
        calls += 1;
        return jsonResponsesResponse(rejectedReviewJson());
      },
    });

    const result = await runReview({
      diffContent: '',
      agentsText: 'rules',
      maxDiffLines: 10,
      client,
    });

    expect(calls).toBe(0);
    expect(result.approved).toBe(true);
    expect(result.chunkCount).toBe(0);
    expect(result.reviewedLines).toBe(0);
  });

  it('aggregateReviewResults rejects an empty list', () => {
    expect(() => aggregateReviewResults([])).toThrow(ValidationError);
  });
});
