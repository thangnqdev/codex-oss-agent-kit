export interface CodexClientOptions {
  apiKey?: string;
  model?: string;
  mockMode?: boolean;
}

export class CodexClient {
  private apiKey: string;
  private model: string;
  private mockMode: boolean;

  constructor(options: CodexClientOptions = {}) {
    this.apiKey = options.apiKey || process.env.OPENAI_API_KEY || 'mock-key';
    this.model = options.model || 'gpt-4o';
    this.mockMode = options.mockMode ?? (this.apiKey === 'mock-key');
  }

  public getModel(): string {
    return this.model;
  }

  public isMockMode(): boolean {
    return this.mockMode;
  }

  public async generateCompletion(prompt: string, systemPrompt?: string): Promise<string> {
    if (this.mockMode) {
      return this.generateMockResponse(prompt, systemPrompt);
    }

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt || 'You are an OpenAI Codex AI Agent assistant for Open Source maintainers.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.2,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI Codex API returned status ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as { choices: Array<{ message: { content: string } }> };
      return data.choices[0]?.message?.content || '';
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Codex API Call Failed: ${error.message}`);
      }
      throw new Error('Unknown error during Codex API call');
    }
  }

  private generateMockResponse(prompt: string, _systemPrompt?: string): string {
    if (prompt.includes('review') || prompt.includes('diff')) {
      return JSON.stringify({
        approved: true,
        score: 95,
        summary: 'Pull request follows repository standards and clean architecture.',
        ruleViolations: [],
        suggestions: ['Consider adding unit test coverage for edge cases.'],
      });
    }

    if (prompt.includes('triage') || prompt.includes('issue')) {
      return JSON.stringify({
        category: 'bug',
        complexity: 'medium',
        recommendedLabels: ['bug', 'triage-needed'],
        hasReproductionSteps: true,
        summary: 'Issue describes a reproducible bug with steps provided.',
      });
    }

    if (prompt.includes('audit') || prompt.includes('security')) {
      return JSON.stringify({
        passed: true,
        riskScore: 0,
        findings: [],
      });
    }

    return 'Mock Codex Completion Response';
  }
}
