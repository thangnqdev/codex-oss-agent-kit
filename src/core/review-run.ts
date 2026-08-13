import { CodexClient } from './codex-client.js';
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

  const results: PRReviewResult[] = [];
  for (let index = 0; index < packed.chunks.length; index += 1) {
    const chunk = packed.chunks[index];
    if (chunk === undefined) {
      throw new ValidationError('Review chunk was missing');
    }
    const prompt = buildReviewPrompt(input.agentsText, chunk, index, packed.chunks.length);
    const raw = await input.client.generateCompletion(
      prompt.userPrompt,
      prompt.systemPrompt,
      PR_REVIEW_JSON_SCHEMA,
    );
    results.push(parsePRReviewResult(raw));
  }

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
    summary: results.map((result, index) => (
      results.length === 1 ? result.summary : `Chunk ${index + 1}: ${result.summary}`
    )).join(' '),
    ruleViolations: results.flatMap((result) => result.ruleViolations),
    suggestions: results.flatMap((result) => result.suggestions),
  };
}
