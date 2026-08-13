import { describe, expect, it } from 'vitest';
import { CodexClient } from '../src/core/codex-client.js';
import { runReview } from '../src/core/review-run.js';
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
});
