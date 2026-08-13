import { CodexApiError, ValidationError } from './errors.js';
import {
  DEFAULT_REVIEW_MODEL,
  JsonSchemaSpec,
  buildResponsesRequest,
  extractResponsesText,
} from './review-request.js';

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface CodexClientOptions {
  readonly apiKey?: string;
  readonly model?: string;
  readonly mockMode?: boolean;
  readonly fetchImpl?: FetchLike;
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
  readonly retryBackoffMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_BACKOFF_MS = 250;

export class CodexClient {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly mockMode: boolean;
  private readonly fetchImpl: FetchLike | undefined;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBackoffMs: number;

  constructor(options: CodexClientOptions = {}) {
    this.model = options.model || DEFAULT_REVIEW_MODEL;
    this.fetchImpl = options.fetchImpl;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryBackoffMs = options.retryBackoffMs ?? DEFAULT_RETRY_BACKOFF_MS;

    const resolvedKey = options.apiKey ?? process.env.OPENAI_API_KEY ?? '';
    this.mockMode = options.mockMode ?? false;

    if (this.mockMode) {
      this.apiKey = resolvedKey || 'mock-key';
      return;
    }

    if (!resolvedKey) {
      throw new ValidationError('Live CodexClient requires an API key');
    }

    this.apiKey = resolvedKey;
  }

  public getModel(): string {
    return this.model;
  }

  public isMockMode(): boolean {
    return this.mockMode;
  }

  public async generateCompletion(
    prompt: string,
    systemPrompt?: string,
    schema?: JsonSchemaSpec,
  ): Promise<string> {
    if (this.mockMode) {
      return this.generateMockResponse(prompt, systemPrompt);
    }

    let lastError: unknown;
    const maxAttempts = this.maxRetries + 1;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (attempt > 0) {
        await delay(this.retryBackoffMs * (2 ** (attempt - 1)));
      }

      try {
        return await this.performRequest(prompt, systemPrompt, schema);
      } catch (error) {
        lastError = error;
        if (error instanceof CodexApiError && error.retryable && attempt < maxAttempts - 1) {
          continue;
        }
        throw error;
      }
    }

    if (lastError instanceof Error) {
      throw lastError;
    }
    throw new CodexApiError('Codex API call failed after retries');
  }

  private async performRequest(
    prompt: string,
    systemPrompt: string | undefined,
    schema: JsonSchemaSpec | undefined,
  ): Promise<string> {
    const controller = new AbortController();
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        controller.abort();
        reject(new CodexApiError(`Codex API request timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
    });

    const request = buildResponsesRequest(
      this.model,
      prompt,
      systemPrompt || 'You are an OpenAI review assistant for open-source maintainers.',
      schema,
    );

    try {
      const response = await Promise.race([
        this.doFetch(request.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(request.body),
          signal: controller.signal,
        }),
        timeoutPromise,
      ]);

      if (response.status === 429 || response.status >= 500) {
        throw new CodexApiError(
          `OpenAI Responses API returned status ${response.status}: ${response.statusText}`,
          response.status,
          true,
        );
      }

      if (!response.ok) {
        throw new CodexApiError(
          `OpenAI Responses API returned status ${response.status}: ${response.statusText}`,
          response.status,
          false,
        );
      }

      let data: unknown;
      try {
        data = await response.json();
      } catch {
        throw new ValidationError('Codex API returned non-JSON body');
      }

      const content = extractResponsesText(data);
      if (!content || content.trim() === '') {
        throw new ValidationError('Codex API returned empty content');
      }
      return content;
    } catch (error) {
      if (error instanceof ValidationError || error instanceof CodexApiError) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new CodexApiError(`Codex API request timed out after ${this.timeoutMs}ms`);
      }
      const message = error instanceof Error ? error.message : 'Unknown error during Codex API call';
      throw new CodexApiError(`Codex API call failed: ${message}`);
    } finally {
      if (timeoutHandle !== undefined) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  private doFetch(input: string, init: RequestInit): Promise<Response> {
    const impl = this.fetchImpl ?? globalThis.fetch.bind(globalThis);
    return impl(input, init);
  }

  private generateMockResponse(prompt: string, _systemPrompt?: string): string {
    const normalized = prompt.toLowerCase();

    if (normalized.includes('review') || normalized.includes('diff') || normalized.includes('untrusted')) {
      return JSON.stringify({
        approved: true,
        score: 95,
        summary: 'Pull request follows repository standards and clean architecture.',
        ruleViolations: [],
        suggestions: ['Consider adding unit test coverage for edge cases.'],
      });
    }

    if (normalized.includes('triage') || normalized.includes('issue')) {
      return JSON.stringify({
        category: 'bug',
        complexity: 'medium',
        recommendedLabels: ['bug', 'triage-needed'],
        hasReproductionSteps: true,
        summary: 'Issue describes a reproducible bug with steps provided.',
      });
    }

    if (normalized.includes('audit') || normalized.includes('security')) {
      return JSON.stringify({
        passed: true,
        riskScore: 0,
        findings: [],
      });
    }

    return 'Mock Codex Completion Response';
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
