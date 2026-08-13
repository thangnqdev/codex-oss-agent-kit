import { CodexClient } from './codex-client.js';
import { PRReviewResult } from '../types/index.js';
import { buildReviewPrompt } from './review-prompt.js';
import { parsePRReviewResult } from './result-schemas.js';
import { PR_REVIEW_JSON_SCHEMA } from './review-request.js';

export class PRAnalyzer {
  private readonly client: CodexClient;

  constructor(client: CodexClient) {
    this.client = client;
  }

  public async analyzeDiff(diffContent: string, agentsText: string = ''): Promise<PRReviewResult> {
    if (!diffContent || diffContent.trim().length === 0) {
      return {
        approved: true,
        score: 100,
        summary: 'Empty diff submitted. No changes to review.',
        ruleViolations: [],
        suggestions: [],
      };
    }

    const prompt = buildReviewPrompt(agentsText, diffContent);
    const rawResponse = await this.client.generateCompletion(
      prompt.userPrompt,
      prompt.systemPrompt,
      PR_REVIEW_JSON_SCHEMA,
    );
    return parsePRReviewResult(rawResponse);
  }
}
