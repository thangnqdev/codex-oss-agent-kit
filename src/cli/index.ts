import { Command, CommanderError } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';
import { AgentsParser } from '../core/agents-parser.js';
import { CodexClient } from '../core/codex-client.js';
import {
  CodexApiError,
  GitHubApiError,
  SecurityAuditError,
  ValidationError,
} from '../core/errors.js';
import { GitHubClient, ReviewEvent } from '../core/github-client.js';
import { IssueTriager } from '../core/issue-triager.js';
import { runReview } from '../core/review-run.js';
import { SecurityAuditor } from '../core/security-auditor.js';
import { CodexConfig, PRReviewResult } from '../types/index.js';

export interface CliIo {
  readonly stdout: NodeJS.WritableStream;
  readonly stderr: NodeJS.WritableStream;
  readonly env: NodeJS.ProcessEnv;
  readonly cwd: string;
}

type GlobalCliOptions = {
  readonly mock?: boolean;
  readonly apiKey?: string;
  readonly config?: string;
  readonly model?: string;
  readonly maxDiffLines?: string;
  readonly format?: string;
};

interface ReviewCliOptions {
  readonly diff?: string;
  readonly agents?: string;
}

interface TriageCliOptions {
  readonly title?: string;
  readonly body?: string;
}

interface AuditCliOptions {
  readonly file?: string;
}

interface PostReviewCliOptions {
  readonly repo?: string;
  readonly pr?: string;
  readonly result?: string;
  readonly event?: string;
  readonly commitId?: string;
}

interface PostLabelsCliOptions {
  readonly repo?: string;
  readonly issue?: string;
  readonly labels?: string;
}

interface PostCheckCliOptions {
  readonly repo?: string;
  readonly sha?: string;
  readonly name?: string;
  readonly conclusion?: string;
  readonly title?: string;
  readonly summary?: string;
}

const DEFAULT_IO: CliIo = {
  stdout: process.stdout,
  stderr: process.stderr,
  env: process.env,
  cwd: process.cwd(),
};

export function createProgram(io: CliIo = DEFAULT_IO): Command {
  const program = new Command();
  let exitCode = 0;

  program
    .name('codex-oss')
    .description(
      'Open-source maintainer toolkit: review, triage, and static audit using the OpenAI Responses API.',
    )
    .version(readPackageVersion())
    .option(
      '--mock',
      'Use mock completions without calling the OpenAI API (local only, not a CI quality gate)',
    )
    .option('--api-key <key>', 'OpenAI API key (overrides OPENAI_API_KEY)')
    .option('--config <path>', 'Path to .codex/config.json', '.codex/config.json')
    .option('--model <id>', 'Override reviewSettings.model')
    .option('--max-diff-lines <n>', 'Override reviewSettings.maxDiffLines')
    .option('--format <fmt>', 'Output format: text or json', 'text');

  program
    .command('review')
    .description(
      'Review a pull request diff against AGENTS.md (AI signal plus deterministic gates)',
    )
    .option('-d, --diff <path>', 'Path to diff file')
    .option('-a, --agents <path>', 'Path to AGENTS.md file', 'AGENTS.md')
    .action(async (options: ReviewCliOptions, command: Command) => {
      const globals = command.optsWithGlobals<GlobalCliOptions>();
      const config = applyCliOverrides(loadConfig(io, globals.config), globals);
      const diffPath = requireOption(options.diff, 'Missing required --diff <path>');
      const diffContent = readRequiredFile(resolvePath(io.cwd, diffPath), 'Diff file');
      const client = createClient(io, globals, config);
      const agentsText = AgentsParser.loadAgentsText(
        resolvePath(io.cwd, options.agents ?? 'AGENTS.md'),
      );
      const result = await runReview({
        diffContent,
        agentsText,
        maxDiffLines: config.reviewSettings.maxDiffLines,
        client,
      });

      const jsonPayload: Record<string, unknown> = {
        approved: result.approved,
        score: result.score,
        summary: result.summary,
        ruleViolations: result.ruleViolations,
        suggestions: result.suggestions,
        reviewedLines: result.reviewedLines,
        totalLines: result.totalLines,
        chunkCount: result.chunkCount,
      };

      if (globals.format === 'json') {
        writeln(io.stdout, JSON.stringify(jsonPayload));
      } else {
        writeln(io.stdout, '=== Codex OSS Pull Request Review ===');
        writeln(io.stdout, `Reviewed lines: ${result.reviewedLines}/${result.totalLines}`);
        writeln(io.stdout, `Approved: ${result.approved ? 'YES' : 'NO'}`);
        writeln(io.stdout, `Quality Score: ${result.score}/100`);
        writeln(io.stdout, `Summary: ${result.summary}`);
        writeln(
          io.stdout,
          'Note: AI verdict is a signal; deterministic audit/size/key gates still apply.',
        );
        if (result.ruleViolations.length > 0) {
          writeln(io.stdout, `Rule Violations: ${result.ruleViolations.join(', ')}`);
        }
        if (result.suggestions.length > 0) {
          writeln(io.stdout, `Suggestions: ${result.suggestions.join(', ')}`);
        }
      }

      if (config.rules.securityAuditOnPR) {
        const auditor = new SecurityAuditor();
        const audit = auditor.auditContent(diffContent, diffPath);
        if (globals.format !== 'json') {
          writeln(io.stdout, `Security Audit Passed: ${audit.passed ? 'YES' : 'NO'}`);
          for (const finding of audit.findings) {
            writeln(
              io.stdout,
              `- [${finding.severity.toUpperCase()}] ${finding.ruleId}: ${finding.description}`,
            );
          }
        }
        if (!audit.passed) {
          exitCode = 1;
          throw new SecurityAuditError(
            `Security audit failed with ${audit.findings.length} finding(s)`,
          );
        }
      }

      if (!result.approved) {
        exitCode = 1;
      }
    });

  program
    .command('triage')
    .description('Intelligently triage bug report or feature request')
    .option('-t, --title <title>', 'Issue title', 'Bug report')
    .option('-b, --body <body>', 'Issue body content', 'Issue details')
    .action(async (options: TriageCliOptions, command: Command) => {
      const globals = command.optsWithGlobals<GlobalCliOptions>();
      const config = applyCliOverrides(loadConfig(io, globals.config), globals);
      const client = createClient(io, globals, config);
      const triager = new IssueTriager(client);
      const result = await triager.triageIssue(
        options.title ?? 'Bug report',
        options.body ?? 'Issue details',
      );

      if (globals.format === 'json') {
        writeln(io.stdout, JSON.stringify(result));
        return;
      }

      writeln(io.stdout, '=== Codex OSS Issue Triage ===');
      writeln(io.stdout, `Category: ${result.category}`);
      writeln(io.stdout, `Complexity: ${result.complexity}`);
      writeln(io.stdout, `Recommended Labels: ${result.recommendedLabels.join(', ')}`);
      writeln(io.stdout, `Summary: ${result.summary}`);
    });

  program
    .command('audit')
    .description('Perform static security audit on source file or unified diff')
    .option('-f, --file <path>', 'Path to file to audit')
    .action((options: AuditCliOptions, command: Command) => {
      const globals = command.optsWithGlobals<GlobalCliOptions>();
      const filePath = requireOption(options.file, 'Missing required --file <path>');
      const content = readRequiredFile(resolvePath(io.cwd, filePath), 'Audit file');
      const auditor = new SecurityAuditor();
      const result = auditor.auditContent(content, filePath);

      if (globals.format === 'json') {
        writeln(io.stdout, JSON.stringify(result));
      } else {
        writeln(io.stdout, '=== Codex OSS Security Audit ===');
        writeln(io.stdout, `Audit Passed: ${result.passed ? 'YES' : 'NO'}`);
        writeln(io.stdout, `Risk Score: ${result.riskScore}/100`);
        writeln(io.stdout, `Findings Count: ${result.findings.length}`);
        for (const finding of result.findings) {
          writeln(
            io.stdout,
            `- [${finding.severity.toUpperCase()}] ${finding.ruleId}: ${finding.description}`,
          );
        }
      }

      if (!result.passed) {
        exitCode = 1;
        throw new SecurityAuditError(
          `Security audit failed with ${result.findings.length} finding(s)`,
        );
      }
    });

  const post = program
    .command('post')
    .description('Post results back to GitHub (PR review, issue labels, check run)');

  post
    .command('review')
    .description('Post a PR review from a review result JSON file (or stdin via --result -)')
    .option('-r, --repo <owner/name>', 'GitHub repository (overrides GITHUB_REPOSITORY)')
    .option('-p, --pr <number>', 'Pull request number (overrides PR_NUMBER)')
    .option('--result <path>', 'Path to review result JSON file, or - for stdin')
    .option('--event <event>', 'Review event: approve, comment, or request-changes')
    .option('--commit-id <sha>', 'Commit SHA to attach the review to')
    .action(async (options: PostReviewCliOptions, command: Command) => {
      const globals = command.optsWithGlobals<GlobalCliOptions>();
      const client = createGitHubClient(io, options.repo);
      const prNumber = parsePositiveInt(
        options.pr ?? io.env.PR_NUMBER ?? '',
        'Missing required --pr <number> (or PR_NUMBER env)',
      );
      const raw = readResultPayload(io, options.result);
      const review = parseReviewResultPayload(raw);
      const event = resolveReviewEvent(options.event, review.approved);
      const body = formatReviewBody(review);

      await client.postPRReview(prNumber, {
        event,
        body,
        commitId: options.commitId,
      });
      if (globals.format === 'json') {
        writeln(io.stdout, JSON.stringify({ posted: true, event, pr: prNumber }));
      } else {
        writeln(io.stdout, `Posted ${event} review on PR #${prNumber}`);
      }
    });

  post
    .command('labels')
    .description('Add labels to an issue or PR (e.g. from triage output)')
    .option('-r, --repo <owner/name>', 'GitHub repository (overrides GITHUB_REPOSITORY)')
    .option('-i, --issue <number>', 'Issue or PR number (overrides ISSUE_NUMBER)')
    .option('-l, --labels <list>', 'Comma-separated labels')
    .action(async (options: PostLabelsCliOptions, command: Command) => {
      const globals = command.optsWithGlobals<GlobalCliOptions>();
      const client = createGitHubClient(io, options.repo);
      const issueNumber = parsePositiveInt(
        options.issue ?? io.env.ISSUE_NUMBER ?? '',
        'Missing required --issue <number> (or ISSUE_NUMBER env)',
      );
      const labels = (options.labels ?? '')
        .split(',')
        .map((label) => label.trim())
        .filter((label) => label !== '');
      if (labels.length === 0) {
        throw new ValidationError('Missing required --labels <list>');
      }

      await client.addLabels(issueNumber, labels);
      if (globals.format === 'json') {
        writeln(io.stdout, JSON.stringify({ posted: true, issue: issueNumber, labels }));
      } else {
        writeln(io.stdout, `Added labels to #${issueNumber}: ${labels.join(', ')}`);
      }
    });

  post
    .command('check')
    .description('Create a completed check run reporting the review outcome')
    .option('-r, --repo <owner/name>', 'GitHub repository (overrides GITHUB_REPOSITORY)')
    .option('--sha <sha>', 'Head commit SHA (overrides GITHUB_SHA)')
    .option('--name <name>', 'Check run name', 'codex-oss-review')
    .option('--conclusion <conclusion>', 'success, failure, neutral, or action_required')
    .option('--title <title>', 'Check run title', 'Codex OSS Review')
    .option('--summary <summary>', 'Check run summary text')
    .action(async (options: PostCheckCliOptions, command: Command) => {
      const globals = command.optsWithGlobals<GlobalCliOptions>();
      const client = createGitHubClient(io, options.repo);
      const headSha = requireOption(
        options.sha ?? io.env.GITHUB_SHA,
        'Missing required --sha (or GITHUB_SHA env)',
      );
      const conclusion = resolveCheckConclusion(options.conclusion);

      await client.postCheckRun({
        name: options.name ?? 'codex-oss-review',
        headSha,
        conclusion,
        title: options.title ?? 'Codex OSS Review',
        summary: options.summary ?? 'Codex OSS review completed.',
      });
      if (globals.format === 'json') {
        writeln(io.stdout, JSON.stringify({ posted: true, conclusion, sha: headSha }));
      } else {
        writeln(
          io.stdout,
          `Posted check run "${options.name ?? 'codex-oss-review'}" (${conclusion})`,
        );
      }
    });

  (program as Command & { getExitCode?: () => number }).getExitCode = (): number => exitCode;
  return program;
}

export async function runCli(argv: string[], ioOverrides: Partial<CliIo> = {}): Promise<number> {
  const io: CliIo = {
    stdout: ioOverrides.stdout ?? DEFAULT_IO.stdout,
    stderr: ioOverrides.stderr ?? DEFAULT_IO.stderr,
    env: ioOverrides.env ?? DEFAULT_IO.env,
    cwd: ioOverrides.cwd ?? DEFAULT_IO.cwd,
  };

  const program = createProgram(io);
  program.exitOverride();
  program.configureOutput({
    writeOut: (str: string) => {
      io.stdout.write(str);
    },
    writeErr: (str: string) => {
      io.stderr.write(str);
    },
  });

  try {
    await program.parseAsync(argv, { from: 'user' });
    const withExit = program as Command & { getExitCode?: () => number };
    return withExit.getExitCode?.() ?? 0;
  } catch (error) {
    if (
      error instanceof ValidationError ||
      error instanceof CodexApiError ||
      error instanceof SecurityAuditError ||
      error instanceof GitHubApiError
    ) {
      io.stderr.write(`${error.name}: ${error.message}\n`);
      return 1;
    }
    if (error instanceof CommanderError) {
      return error.exitCode === 0 ? 0 : 1;
    }
    const message = error instanceof Error ? error.message : String(error);
    io.stderr.write(`${message}\n`);
    return 1;
  }
}

function createClient(io: CliIo, globals: GlobalCliOptions, config: CodexConfig): CodexClient {
  const apiKey = globals.apiKey || io.env.OPENAI_API_KEY || '';
  if (globals.mock) {
    return new CodexClient({
      mockMode: true,
      apiKey: apiKey || 'mock-key',
      model: config.reviewSettings.model,
    });
  }
  if (!apiKey) {
    throw new ValidationError(
      'Live mode requires OPENAI_API_KEY or --api-key. Pass --mock to run without a key.',
    );
  }
  return new CodexClient({
    mockMode: false,
    apiKey,
    model: config.reviewSettings.model,
  });
}

function applyCliOverrides(config: CodexConfig, globals: GlobalCliOptions): CodexConfig {
  let model = config.reviewSettings.model;
  let maxDiffLines = config.reviewSettings.maxDiffLines;
  if (globals.model && globals.model.trim() !== '') {
    model = globals.model;
  }
  if (globals.maxDiffLines !== undefined && globals.maxDiffLines !== '') {
    const parsed = Number(globals.maxDiffLines);
    if (!Number.isFinite(parsed) || parsed < 1) {
      throw new ValidationError('--max-diff-lines must be a positive number');
    }
    maxDiffLines = parsed;
  }
  return {
    ...config,
    reviewSettings: {
      ...config.reviewSettings,
      model,
      maxDiffLines,
    },
  };
}

function loadConfig(io: CliIo, configPath: string | undefined): CodexConfig {
  const resolved = resolvePath(io.cwd, configPath ?? '.codex/config.json');
  return AgentsParser.parseConfigFile(resolved);
}

function requireOption(value: string | undefined, message: string): string {
  if (!value || value.trim() === '') {
    throw new ValidationError(message);
  }
  return value;
}

function readRequiredFile(filePath: string, label: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    throw new ValidationError(`${label} not found or unreadable: ${filePath}`);
  }
}

function resolvePath(cwd: string, target: string): string {
  return path.isAbsolute(target) ? target : path.resolve(cwd, target);
}

function readPackageVersion(): string {
  try {
    const packagePath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../package.json',
    );
    const raw = fs.readFileSync(packagePath, 'utf-8');
    const parsed = JSON.parse(raw) as { version?: unknown };
    if (typeof parsed.version === 'string' && parsed.version.trim() !== '') {
      return parsed.version;
    }
  } catch {
    // Fall through to the fallback version below.
  }
  return '0.0.0';
}

function writeln(stream: NodeJS.WritableStream, line: string): void {
  stream.write(`${line}\n`);
}

function createGitHubClient(io: CliIo, repoOverride: string | undefined): GitHubClient {
  const token = io.env.GITHUB_TOKEN;
  if (!token || token.trim() === '') {
    throw new ValidationError(
      'Posting to GitHub requires GITHUB_TOKEN (or GITHUB_ENV). Pass an env var from the workflow.',
    );
  }
  const repo = repoOverride ?? io.env.GITHUB_REPOSITORY ?? '';
  if (!repo || repo.trim() === '') {
    throw new ValidationError(
      'Missing GitHub repo: pass --repo <owner/name> or set GITHUB_REPOSITORY',
    );
  }
  return new GitHubClient({ token, repo });
}

function parsePositiveInt(raw: string, errorMessage: string): number {
  requireOption(raw, errorMessage);
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new ValidationError(errorMessage);
  }
  return parsed;
}

function readResultPayload(io: CliIo, resultPath: string | undefined): string {
  if (resultPath === undefined || resultPath === '') {
    throw new ValidationError('Missing required --result <path> (or - for stdin)');
  }
  if (resultPath === '-') {
    return fs.readFileSync(0, 'utf-8');
  }
  const resolved = resolvePath(io.cwd, resultPath);
  try {
    return fs.readFileSync(resolved, 'utf-8');
  } catch {
    throw new ValidationError(`Result file not found or unreadable: ${resolved}`);
  }
}

function parseReviewResultPayload(raw: string): PRReviewResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ValidationError('Review result must be valid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new ValidationError('Review result must be a JSON object');
  }
  const obj = parsed as Record<string, unknown>;
  const approved = obj['approved'];
  const score = obj['score'];
  const summary = obj['summary'];
  if (typeof approved !== 'boolean' || typeof score !== 'number' || typeof summary !== 'string') {
    throw new ValidationError(
      'Review result must include boolean `approved`, numeric `score`, and string `summary`',
    );
  }
  const violations = Array.isArray(obj['ruleViolations'])
    ? obj['ruleViolations'].filter((v): v is string => typeof v === 'string')
    : [];
  const suggestions = Array.isArray(obj['suggestions'])
    ? obj['suggestions'].filter((v): v is string => typeof v === 'string')
    : [];
  return {
    approved,
    score,
    summary,
    ruleViolations: violations,
    suggestions,
  };
}

function resolveReviewEvent(optionEvent: string | undefined, approved: boolean): ReviewEvent {
  if (optionEvent === undefined) {
    return approved ? 'APPROVE' : 'COMMENT';
  }
  const normalized = optionEvent.trim().toLowerCase();
  switch (normalized) {
    case 'approve':
      return 'APPROVE';
    case 'comment':
      return 'COMMENT';
    case 'request-changes':
    case 'request_changes':
      return 'REQUEST_CHANGES';
    default:
      throw new ValidationError(
        `Invalid --event: ${optionEvent}. Expected approve, comment, or request-changes.`,
      );
  }
}

function resolveCheckConclusion(
  optionConclusion: string | undefined,
): 'success' | 'failure' | 'neutral' | 'action_required' {
  const raw = optionConclusion ?? 'neutral';
  const normalized = raw.trim().toLowerCase();
  switch (normalized) {
    case 'success':
    case 'failure':
    case 'neutral':
    case 'action_required':
    case 'action-required':
      return normalized.replace('-', '_') as 'success' | 'failure' | 'neutral' | 'action_required';
    default:
      throw new ValidationError(
        `Invalid --conclusion: ${optionConclusion}. Expected success, failure, neutral, or action_required.`,
      );
  }
}

function formatReviewBody(review: PRReviewResult): string {
  const lines: string[] = [
    '## Codex OSS Automated Review',
    '',
    `**Verdict**: ${review.approved ? '✅ Approved' : '⚠️ Needs attention'}`,
    `**Score**: ${review.score}/100`,
    '',
    `**Summary**: ${review.summary}`,
    '',
    '> Note: AI verdict is a signal; deterministic audit/size/key gates still apply.',
  ];
  if (review.ruleViolations.length > 0) {
    lines.push('', '### Rule Violations');
    for (const violation of review.ruleViolations) {
      lines.push(`- ${violation}`);
    }
  }
  if (review.suggestions.length > 0) {
    lines.push('', '### Suggestions');
    for (const suggestion of review.suggestions) {
      lines.push(`- ${suggestion}`);
    }
  }
  return lines.join('\n');
}
