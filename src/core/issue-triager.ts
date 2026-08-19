import { CodexClient } from './codex-client.js';
import { IssueTriageResult } from '../types/index.js';
import { parseIssueTriageResult } from './result-schemas.js';
import { ISSUE_TRIAGE_JSON_SCHEMA } from './review-request.js';

export class IssueTriager {
  private readonly client: CodexClient;

  constructor(client: CodexClient) {
    this.client = client;
  }

  public async triageIssue(title: string, body: string): Promise<IssueTriageResult> {
    if (!title && !body) {
      return {
        category: 'question',
        complexity: 'low',
        recommendedLabels: ['needs-info'],
        hasReproductionSteps: false,
        summary: 'Issue title and body are empty.',
      };
    }

    const systemPrompt =
      'You are an automated issue triager for Open Source maintainers. Return an IssueTriageResult object.';
    const userPrompt = `Issue Title: ${title}\nIssue Body:\n${body}`;

    const rawResponse = await this.client.generateCompletion(
      userPrompt,
      systemPrompt,
      ISSUE_TRIAGE_JSON_SCHEMA,
    );
    return parseIssueTriageResult(rawResponse);
  }
}
