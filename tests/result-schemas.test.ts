import { describe, expect, it } from 'vitest';
import { ValidationError } from '../src/core/errors.js';
import { parseIssueTriageResult, parsePRReviewResult } from '../src/core/result-schemas.js';

describe('result schemas', () => {
  it('parses a valid PR review payload', () => {
    const result = parsePRReviewResult(
      JSON.stringify({
        approved: true,
        score: 91,
        summary: 'ok',
        ruleViolations: [],
        suggestions: ['nits'],
      }),
    );
    expect(result.approved).toBe(true);
    expect(result.score).toBe(91);
  });

  it('rejects empty, non-object, and malformed PR review payloads', () => {
    expect(() => parsePRReviewResult('')).toThrow(ValidationError);
    expect(() => parsePRReviewResult('[]')).toThrow(ValidationError);
    expect(() => parsePRReviewResult('not-json')).toThrow(ValidationError);
    expect(() =>
      parsePRReviewResult(
        JSON.stringify({
          approved: 'yes',
          score: 1,
          summary: 'x',
          ruleViolations: [],
          suggestions: [],
        }),
      ),
    ).toThrow(/approved/i);
    expect(() =>
      parsePRReviewResult(
        JSON.stringify({
          approved: true,
          score: 'high',
          summary: 'x',
          ruleViolations: [],
          suggestions: [],
        }),
      ),
    ).toThrow(/score/i);
    expect(() =>
      parsePRReviewResult(
        JSON.stringify({
          approved: true,
          score: 1,
          summary: '',
          ruleViolations: [],
          suggestions: [],
        }),
      ),
    ).toThrow(/summary/i);
    expect(() =>
      parsePRReviewResult(
        JSON.stringify({
          approved: true,
          score: 1,
          summary: 'x',
          ruleViolations: 'none',
          suggestions: [],
        }),
      ),
    ).toThrow(/ruleViolations/i);
    expect(() =>
      parsePRReviewResult(
        JSON.stringify({
          approved: true,
          score: 1,
          summary: 'x',
          ruleViolations: [],
          suggestions: [1],
        }),
      ),
    ).toThrow(/suggestions/i);
  });

  it('parses a valid issue triage payload', () => {
    const result = parseIssueTriageResult(
      JSON.stringify({
        category: 'feature',
        complexity: 'high',
        recommendedLabels: ['enhancement'],
        hasReproductionSteps: false,
        summary: 'feature request',
      }),
    );
    expect(result.category).toBe('feature');
    expect(result.complexity).toBe('high');
  });

  it('rejects invalid issue triage payloads', () => {
    expect(() => parseIssueTriageResult('')).toThrow(ValidationError);
    expect(() =>
      parseIssueTriageResult(
        JSON.stringify({
          category: 'feature',
          complexity: 'extreme',
          recommendedLabels: [],
          hasReproductionSteps: false,
          summary: 'x',
        }),
      ),
    ).toThrow(/complexity/i);
    expect(() =>
      parseIssueTriageResult(
        JSON.stringify({
          category: 'feature',
          complexity: 'low',
          recommendedLabels: 'bug',
          hasReproductionSteps: false,
          summary: 'x',
        }),
      ),
    ).toThrow(/recommendedLabels/i);
    expect(() =>
      parseIssueTriageResult(
        JSON.stringify({
          category: 'feature',
          complexity: 'low',
          recommendedLabels: [],
          hasReproductionSteps: 'yes',
          summary: 'x',
        }),
      ),
    ).toThrow(/hasReproductionSteps/i);
    expect(() =>
      parseIssueTriageResult(
        JSON.stringify({
          category: 'feature',
          complexity: 'low',
          recommendedLabels: [],
          hasReproductionSteps: true,
          summary: '',
        }),
      ),
    ).toThrow(/summary/i);
  });
});
