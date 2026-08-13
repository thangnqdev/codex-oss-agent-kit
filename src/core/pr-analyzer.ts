import { CodexClient } from './codex-client.js';
import { PRReviewResult } from '../types/index.js';
import { parsePRReviewResult } from './result-schemas.js';

export class PRAnalyzer {
  private readonly client: CodexClient;

  constructor(client: CodexClient) {
    this.client = client;
  }

  public async analyzeDiff(diffContent: string, agentRules: string[] = []): Promise<PRReviewResult> {
    if (!diffContent || diffContent.trim().length === 0) {
      return {
        approved: true,
        score: 100,
        summary: 'Empty diff submitted. No changes to review.',
        ruleViolations: [],
        suggestions: [],
      };
    }

    const rulesContext = agentRules.length > 0
      ? `Repository AGENTS.md rules:\n${agentRules.map((rule) => `- ${rule}`).join('\n')}`
      : 'Standard clean architecture and type safety rules apply.';

    const systemPrompt = 'You are an automated pull request reviewer for OpenAI Codex for OSS compliance. Evaluate the diff against repository rules and return JSON formatted as PRReviewResult.';
    const userPrompt = `${rulesContext}\n\nDiff Content:\n\`\`\`diff\n${diffContent}\n\`\`\``;

    const rawResponse = await this.client.generateCompletion(userPrompt, systemPrompt);
    return parsePRReviewResult(rawResponse);
  }
}
