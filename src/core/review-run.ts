import { CodexClient } from './codex-client.js';
import { DEFAULT_REVIEW_CONCURRENCY, mapWithConcurrency } from './concurrency.js';
import { ValidationError } from './errors.js';
import { chunkDiff } from './review-chunks.js';
import { buildReviewPrompt } from './review-prompt.js';
import { parsePRReviewResult } from './result-schemas.js';
import { PR_REVIEW_JSON_SCHEMA } from './review-request.js';
import { PRReviewResult } from '../types/index.js';

export interface ReviewRunInput {
  readonly diffContent: string;
  readonly agentsText: string;
  readonly maxDiffLines: number;
  readonly client: CodexClient;
  readonly concurrency?: number;
}

export interface ReviewRunOutput extends PRReviewResult {
  readonly reviewedLines: number;
  readonly totalLines: number;
  readonly chunkCount: number;
}

export async function runReview(input: ReviewRunInput): Promise<ReviewRunOutput> {
  const packed = chunkDiff(input.diffContent, input.maxDiffLines);

  if (packed.totalLines === 0 || packed.chunks.length === 0) {
    return {
      approved: true,
      score: 100,
      summary: 'Empty diff submitted. No changes to review.',
      ruleViolations: [],
      suggestions: [],
      reviewedLines: 0,
      totalLines: 0,
      chunkCount: 0,
    };
  }

  const concurrency = input.concurrency ?? DEFAULT_REVIEW_CONCURRENCY;
  const results = await mapWithConcurrency(packed.chunks, concurrency, async (chunk, index) => {
    const prompt = buildReviewPrompt(input.agentsText, chunk, index, packed.chunks.length);
    const raw = await input.client.generateCompletion(
      prompt.userPrompt,
      prompt.systemPrompt,
      PR_REVIEW_JSON_SCHEMA,
    );
    return parsePRReviewResult(raw);
  });

  return {
    ...aggregateReviewResults(results),
    reviewedLines: packed.reviewedLines,
    totalLines: packed.totalLines,
    chunkCount: packed.chunks.length,
  };
}

export function aggregateReviewResults(results: readonly PRReviewResult[]): PRReviewResult {
  if (results.length === 0) {
    throw new ValidationError('Cannot aggregate an empty review result list');
  }

  return {
    approved: results.every((result) => result.approved),
    score: Math.min(...results.map((result) => result.score)),
    summary: results
      .map((result, index) =>
        results.length === 1 ? result.summary : `Chunk ${index + 1}: ${result.summary}`,
      )
      .join(' '),
    ruleViolations: results.flatMap((result) => result.ruleViolations),
    suggestions: results.flatMap((result) => result.suggestions),
  };
}
