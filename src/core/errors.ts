export class CodexApiError extends Error {
  public readonly status: number | undefined;
  public readonly retryable: boolean;

  constructor(message: string, status?: number, retryable: boolean = false) {
    super(message);
    this.name = 'CodexApiError';
    this.status = status;
    this.retryable = retryable;
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class SecurityAuditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityAuditError';
  }
}

export class GitHubApiError extends Error {
  public readonly status: number | undefined;
  public readonly retryable: boolean;

  constructor(message: string, status?: number, retryable: boolean = false) {
    super(message);
    this.name = 'GitHubApiError';
    this.status = status;
    this.retryable = retryable;
  }
}
