import { Command, CommanderError } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { AgentsParser } from '../core/agents-parser.js';
import { CodexClient } from '../core/codex-client.js';
import { truncateToMaxLines } from '../core/config.js';
import { CodexApiError, SecurityAuditError, ValidationError } from '../core/errors.js';
import { IssueTriager } from '../core/issue-triager.js';
import { PRAnalyzer } from '../core/pr-analyzer.js';
import { SecurityAuditor } from '../core/security-auditor.js';
import { CodexConfig } from '../types/index.js';

export interface CliIo {
  readonly stdout: NodeJS.WritableStream;
  readonly stderr: NodeJS.WritableStream;
  readonly env: NodeJS.ProcessEnv;
  readonly cwd: string;
}

interface GlobalCliOptions {
  readonly mock?: boolean;
  readonly apiKey?: string;
  readonly config?: string;
}

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
    .description('AI-Powered Open-Source Maintainer Toolkit & GitHub Action Engine built for OpenAI Codex for OSS compliance.')
    .version('1.0.0')
    .option('--mock', 'Use mock completions without calling the Codex API')
    .option('--api-key <key>', 'OpenAI API key (overrides OPENAI_API_KEY)')
    .option('--config <path>', 'Path to .codex/config.json', '.codex/config.json');

  program
    .command('review')
    .description('Review pull request code diff against AGENTS.md guidelines')
    .option('-d, --diff <path>', 'Path to diff file')
    .option('-a, --agents <path>', 'Path to AGENTS.md file', 'AGENTS.md')
    .action(async (options: ReviewCliOptions, command: Command) => {
      const globals = command.optsWithGlobals() as GlobalCliOptions;
      const config = loadConfig(io, globals.config);
      const diffPath = requireOption(options.diff, 'Missing required --diff <path>');
      const diffContent = readRequiredFile(resolvePath(io.cwd, diffPath), 'Diff file');
      const client = createClient(io, globals, config);
      const analyzer = new PRAnalyzer(client);
      const agentRules = AgentsParser.parseAgentsFile(resolvePath(io.cwd, options.agents ?? 'AGENTS.md'));
      const truncatedDiff = truncateToMaxLines(diffContent, config.reviewSettings.maxDiffLines);
      const result = await analyzer.analyzeDiff(truncatedDiff, agentRules);

      writeln(io.stdout, '=== Codex OSS Pull Request Review ===');
      writeln(io.stdout, `Approved: ${result.approved ? 'YES' : 'NO'}`);
      writeln(io.stdout, `Quality Score: ${result.score}/100`);
      writeln(io.stdout, `Summary: ${result.summary}`);
      if (result.ruleViolations.length > 0) {
        writeln(io.stdout, `Rule Violations: ${result.ruleViolations.join(', ')}`);
      }
      if (result.suggestions.length > 0) {
        writeln(io.stdout, `Suggestions: ${result.suggestions.join(', ')}`);
      }

      if (config.rules.securityAuditOnPR) {
        const auditor = new SecurityAuditor();
        const audit = auditor.auditContent(diffContent, diffPath);
        writeln(io.stdout, `Security Audit Passed: ${audit.passed ? 'YES' : 'NO'}`);
        if (audit.findings.length > 0) {
          for (const finding of audit.findings) {
            writeln(io.stdout, `- [${finding.severity.toUpperCase()}] ${finding.ruleId}: ${finding.description}`);
          }
        }
        if (!audit.passed) {
          exitCode = 1;
          throw new SecurityAuditError(`Security audit failed with ${audit.findings.length} finding(s)`);
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
      const globals = command.optsWithGlobals() as GlobalCliOptions;
      const config = loadConfig(io, globals.config);
      const client = createClient(io, globals, config);
      const triager = new IssueTriager(client);
      const result = await triager.triageIssue(options.title ?? 'Bug report', options.body ?? 'Issue details');

      writeln(io.stdout, '=== Codex OSS Issue Triage ===');
      writeln(io.stdout, `Category: ${result.category}`);
      writeln(io.stdout, `Complexity: ${result.complexity}`);
      writeln(io.stdout, `Recommended Labels: ${result.recommendedLabels.join(', ')}`);
      writeln(io.stdout, `Summary: ${result.summary}`);
    });

  program
    .command('audit')
    .description('Perform static security audit on source file')
    .option('-f, --file <path>', 'Path to file to audit')
    .action((options: AuditCliOptions) => {
      const filePath = requireOption(options.file, 'Missing required --file <path>');
      const content = readRequiredFile(resolvePath(io.cwd, filePath), 'Audit file');
      const auditor = new SecurityAuditor();
      const result = auditor.auditContent(content, filePath);

      writeln(io.stdout, '=== Codex OSS Security Audit ===');
      writeln(io.stdout, `Audit Passed: ${result.passed ? 'YES' : 'NO'}`);
      writeln(io.stdout, `Risk Score: ${result.riskScore}/100`);
      writeln(io.stdout, `Findings Count: ${result.findings.length}`);
      for (const finding of result.findings) {
        writeln(io.stdout, `- [${finding.severity.toUpperCase()}] ${finding.ruleId}: ${finding.description}`);
      }

      if (!result.passed) {
        exitCode = 1;
        throw new SecurityAuditError(`Security audit failed with ${result.findings.length} finding(s)`);
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
    if (error instanceof ValidationError || error instanceof CodexApiError || error instanceof SecurityAuditError) {
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
    throw new ValidationError('Live mode requires OPENAI_API_KEY or --api-key. Pass --mock to run without a key.');
  }
  return new CodexClient({
    mockMode: false,
    apiKey,
    model: config.reviewSettings.model,
  });
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

function writeln(stream: NodeJS.WritableStream, line: string): void {
  stream.write(`${line}\n`);
}
