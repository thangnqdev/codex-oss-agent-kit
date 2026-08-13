import { CodexClient } from './codex-client.js';
import { IssueTriageResult } from '../types/index.js';

export class IssueTriager {
  private client: CodexClient;

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

    const systemPrompt = `You are an automated issue triager for Open Source maintainers. Evaluate the issue and return JSON matching IssueTriageResult.`;
    const userPrompt = `Issue Title: ${title}\nIssue Body:\n${body}`;

    const rawResponse = await this.client.generateCompletion(userPrompt, systemPrompt);

    try {
      const parsed = JSON.parse(rawResponse) as IssueTriageResult;
      return {
        category: parsed.category || 'bug',
        complexity: parsed.complexity || 'medium',
        recommendedLabels: parsed.recommendedLabels || ['triage-needed'],
        hasReproductionSteps: parsed.hasReproductionSteps ?? body.includes('step'),
        summary: parsed.summary || 'Issue triaged automatically.',
      };
    } catch {
      const isBug = title.toLowerCase().includes('bug') || title.toLowerCase().includes('error');
      return {
        category: isBug ? 'bug' : 'feature',
        complexity: 'medium',
        recommendedLabels: isBug ? ['bug', 'triage'] : ['enhancement'],
        hasReproductionSteps: body.length > 50,
        summary: 'Issue categorized based on title and description heuristics.',
      };
    }
  }
}
