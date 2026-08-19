import { FetchLike } from './codex-client.js';
import { GitHubApiError, ValidationError } from './errors.js';

export interface GitHubClientOptions {
  readonly token: string;
  readonly repo: string; // owner/name
  readonly apiBaseUrl?: string;
  readonly fetchImpl?: FetchLike;
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
  readonly retryBackoffMs?: number;
}

export type ReviewEvent = 'APPROVE' | 'COMMENT' | 'REQUEST_CHANGES';

export interface PRReviewPayload {
  readonly event: ReviewEvent;
  readonly body: string;
  readonly commitId?: string;
}

export interface CheckRunPayload {
  readonly name: string;
  readonly headSha: string;
  readonly conclusion: 'success' | 'failure' | 'neutral' | 'action_required';
  readonly title: string;
  readonly summary: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_BACKOFF_MS = 250;
const DEFAULT_API_BASE_URL = 'https://api.github.com';

export function parseRepoSlug(repo: string): { owner: string; name: string } {
  const trimmed = repo.trim();
  const separator = trimmed.indexOf('/');
  if (separator <= 0 || separator === trimmed.length - 1) {
    throw new ValidationError(`GitHub repo must be in owner/name format, got: ${trimmed}`);
  }
  const owner = trimmed.slice(0, separator);
  const name = trimmed.slice(separator + 1);
  if (owner.includes('/') || name.includes('/') || owner.includes(' ') || name.includes(' ')) {
    throw new ValidationError(`GitHub repo must be in owner/name format, got: ${trimmed}`);
  }
  return { owner, name };
}

export class GitHubClient {
  private readonly token: string;
  private readonly owner: string;
  private readonly name: string;
  private readonly apiBaseUrl: string;
  private readonly fetchImpl: FetchLike | undefined;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBackoffMs: number;

  constructor(options: GitHubClientOptions) {
    if (!options.token || options.token.trim() === '') {
      throw new ValidationError('GitHubClient requires a token');
    }
    const slug = parseRepoSlug(options.repo);
    this.token = options.token;
    this.owner = slug.owner;
    this.name = slug.name;
    this.apiBaseUrl = (options.apiBaseUrl ?? DEFAULT_API_BASE_URL).replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryBackoffMs = options.retryBackoffMs ?? DEFAULT_RETRY_BACKOFF_MS;
  }

  public async postPRReview(pullNumber: number, payload: PRReviewPayload): Promise<void> {
    if (!Number.isInteger(pullNumber) || pullNumber < 1) {
      throw new ValidationError('pullNumber must be a positive integer');
    }
    if (!payload.body || payload.body.trim() === '') {
      throw new ValidationError('Review body must not be empty');
    }
    const body: Record<string, unknown> = {
      event: payload.event,
      body: payload.body,
    };
    if (payload.commitId !== undefined && payload.commitId.trim() !== '') {
      body.commit_id = payload.commitId;
    }
    await this.request(
      'POST',
      `/repos/${this.owner}/${this.name}/pulls/${pullNumber}/reviews`,
      body,
    );
  }

  public async addLabels(issueNumber: number, labels: readonly string[]): Promise<void> {
    if (!Number.isInteger(issueNumber) || issueNumber < 1) {
      throw new ValidationError('issueNumber must be a positive integer');
    }
    const cleaned = labels.map((label) => label.trim()).filter((label) => label !== '');
    if (cleaned.length === 0) {
      throw new ValidationError('At least one non-empty label is required');
    }
    await this.request('POST', `/repos/${this.owner}/${this.name}/issues/${issueNumber}/labels`, {
      labels: cleaned,
    });
  }

  public async postCheckRun(payload: CheckRunPayload): Promise<void> {
    if (!payload.name || payload.name.trim() === '') {
      throw new ValidationError('Check run name must not be empty');
    }
    if (!payload.headSha || payload.headSha.trim() === '') {
      throw new ValidationError('Check run headSha must not be empty');
    }
    await this.request('POST', `/repos/${this.owner}/${this.name}/check-runs`, {
      name: payload.name,
      head_sha: payload.headSha,
      status: 'completed',
      conclusion: payload.conclusion,
      output: {
        title: payload.title,
        summary: payload.summary,
      },
    });
  }

  private async request(
    method: 'POST',
    requestPath: string,
    requestBody: Record<string, unknown>,
  ): Promise<void> {
    let lastError: unknown;
    const maxAttempts = this.maxRetries + 1;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (attempt > 0) {
        await delay(this.retryBackoffMs * 2 ** (attempt - 1));
      }

      try {
        await this.performRequest(method, requestPath, requestBody);
        return;
      } catch (error) {
        lastError = error;
        if (error instanceof GitHubApiError && error.retryable && attempt < maxAttempts - 1) {
          continue;
        }
        throw error;
      }
    }

    if (lastError instanceof Error) {
      throw lastError;
    }
    throw new GitHubApiError('GitHub API call failed after retries');
  }

  private async performRequest(
    method: 'POST',
    requestPath: string,
    requestBody: Record<string, unknown>,
  ): Promise<void> {
    const controller = new AbortController();
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        controller.abort();
        reject(new GitHubApiError(`GitHub API request timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
    });

    try {
      const response = await Promise.race([
        this.doFetch(`${this.apiBaseUrl}${requestPath}`, {
          method,
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        }),
        timeoutPromise,
      ]);

      if (response.status === 429 || response.status >= 500) {
        throw new GitHubApiError(
          `GitHub API returned status ${response.status}: ${response.statusText}`,
          response.status,
          true,
        );
      }

      if (!response.ok) {
        throw new GitHubApiError(
          `GitHub API returned status ${response.status}: ${response.statusText}`,
          response.status,
          false,
        );
      }
    } catch (error) {
      if (error instanceof GitHubApiError) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new GitHubApiError(`GitHub API request timed out after ${this.timeoutMs}ms`);
      }
      const message =
        error instanceof Error ? error.message : 'Unknown error during GitHub API call';
      throw new GitHubApiError(`GitHub API call failed: ${message}`);
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
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
