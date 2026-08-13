import { Command } from 'commander';
import { CodexClient } from '../core/codex-client.js';
import { PRAnalyzer } from '../core/pr-analyzer.js';
import { IssueTriager } from '../core/issue-triager.js';
import { SecurityAuditor } from '../core/security-auditor.js';
import { AgentsParser } from '../core/agents-parser.js';
import * as fs from 'fs';

export function createProgram(): Command {
  const program = new Command();

  program
    .name('codex-oss')
    .description('AI-Powered Open-Source Maintainer Toolkit & GitHub Action Engine built for OpenAI Codex for OSS compliance.')
    .version('1.0.0');

  program
    .command('review')
    .description('Review pull request code diff against AGENTS.md guidelines')
    .option('-d, --diff <path>', 'Path to diff file')
    .option('-a, --agents <path>', 'Path to AGENTS.md file', 'AGENTS.md')
    .action(async (options) => {
      const diffContent = options.diff && fs.existsSync(options.diff)
        ? fs.readFileSync(options.diff, 'utf-8')
        : 'sample diff content';
      const agentRules = AgentsParser.parseAgentsFile(options.agents);
      
      const client = new CodexClient({ mockMode: true });
      const analyzer = new PRAnalyzer(client);
      const result = await analyzer.analyzeDiff(diffContent, agentRules);

      console.log('=== Codex OSS Pull Request Review ===');
      console.log(`Approved: ${result.approved ? 'YES ✅' : 'NO ❌'}`);
      console.log(`Quality Score: ${result.score}/100`);
      console.log(`Summary: ${result.summary}`);
      if (result.ruleViolations.length > 0) {
        console.log('Rule Violations:', result.ruleViolations);
      }
      if (result.suggestions.length > 0) {
        console.log('Suggestions:', result.suggestions);
      }
    });

  program
    .command('triage')
    .description('Intelligently triage bug report or feature request')
    .option('-t, --title <title>', 'Issue title', 'Bug report')
    .option('-b, --body <body>', 'Issue body content', 'Issue details')
    .action(async (options) => {
      const client = new CodexClient({ mockMode: true });
      const triager = new IssueTriager(client);
      const result = await triager.triageIssue(options.title, options.body);

      console.log('=== Codex OSS Issue Triage ===');
      console.log(`Category: ${result.category}`);
      console.log(`Complexity: ${result.complexity}`);
      console.log(`Recommended Labels: ${result.recommendedLabels.join(', ')}`);
      console.log(`Summary: ${result.summary}`);
    });

  program
    .command('audit')
    .description('Perform static security audit on source file')
    .option('-f, --file <path>', 'Path to file to audit')
    .action((options) => {
      const content = options.file && fs.existsSync(options.file)
        ? fs.readFileSync(options.file, 'utf-8')
        : 'sample content';
      const auditor = new SecurityAuditor();
      const result = auditor.auditContent(content, options.file || 'inline');

      console.log('=== Codex OSS Security Audit ===');
      console.log(`Audit Passed: ${result.passed ? 'YES ✅' : 'NO ❌'}`);
      console.log(`Risk Score: ${result.riskScore}/100`);
      console.log(`Findings Count: ${result.findings.length}`);
      result.findings.forEach((f) => {
        console.log(`- [${f.severity.toUpperCase()}] ${f.ruleId}: ${f.description}`);
      });
    });

  return program;
}
