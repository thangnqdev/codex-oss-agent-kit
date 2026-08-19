import { IssueTriageResult, PRReviewResult } from '../types/index.js';
import { ValidationError } from './errors.js';

const ISSUE_CATEGORIES = ['bug', 'feature', 'documentation', 'question'] as const;
const ISSUE_COMPLEXITIES = ['low', 'medium', 'high'] as const;

export function parsePRReviewResult(raw: string): PRReviewResult {
  const obj = parseJsonObject(raw, 'PR review');

  if (typeof obj.approved !== 'boolean') {
    throw new ValidationError('PR review: approved must be a boolean');
  }
  if (typeof obj.score !== 'number' || !Number.isFinite(obj.score)) {
    throw new ValidationError('PR review: score must be a number');
  }
  if (typeof obj.summary !== 'string' || obj.summary.trim() === '') {
    throw new ValidationError('PR review: summary must be a non-empty string');
  }
  if (!isStringArray(obj.ruleViolations)) {
    throw new ValidationError('PR review: ruleViolations must be a string array');
  }
  if (!isStringArray(obj.suggestions)) {
    throw new ValidationError('PR review: suggestions must be a string array');
  }

  return {
    approved: obj.approved,
    score: obj.score,
    summary: obj.summary,
    ruleViolations: obj.ruleViolations,
    suggestions: obj.suggestions,
  };
}

export function parseIssueTriageResult(raw: string): IssueTriageResult {
  const obj = parseJsonObject(raw, 'Issue triage');

  if (!isOneOf(obj.category, ISSUE_CATEGORIES)) {
    throw new ValidationError(
      'Issue triage: category must be bug, feature, documentation, or question',
    );
  }
  if (!isOneOf(obj.complexity, ISSUE_COMPLEXITIES)) {
    throw new ValidationError('Issue triage: complexity must be low, medium, or high');
  }
  if (!isStringArray(obj.recommendedLabels)) {
    throw new ValidationError('Issue triage: recommendedLabels must be a string array');
  }
  if (typeof obj.hasReproductionSteps !== 'boolean') {
    throw new ValidationError('Issue triage: hasReproductionSteps must be a boolean');
  }
  if (typeof obj.summary !== 'string' || obj.summary.trim() === '') {
    throw new ValidationError('Issue triage: summary must be a non-empty string');
  }

  return {
    category: obj.category,
    complexity: obj.complexity,
    recommendedLabels: obj.recommendedLabels,
    hasReproductionSteps: obj.hasReproductionSteps,
    summary: obj.summary,
  };
}

function parseJsonObject(raw: string, label: string): Record<string, unknown> {
  if (!raw || raw.trim() === '') {
    throw new ValidationError(`${label}: empty model output`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ValidationError(`${label}: model output is not valid JSON`);
  }

  if (!isRecord(parsed)) {
    throw new ValidationError(`${label}: model output must be a JSON object`);
  }

  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}
