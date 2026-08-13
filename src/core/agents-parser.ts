import * as fs from 'fs';
import { CodexConfig } from '../types/index.js';

export class AgentsParser {
  public static parseAgentsFile(filePath: string): string[] {
    if (!fs.existsSync(filePath)) {
      return ['Default AGENTS.md rules: Enforce strict mode, 80% coverage floor, clean architecture.'];
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const rules: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        rules.push(trimmed.substring(2).trim());
      }
    }

    return rules.length > 0 ? rules : [content];
  }

  public static parseConfigFile(configPath: string): CodexConfig {
    const defaultConfig: CodexConfig = {
      version: '1.0.0',
      program: 'Codex for Open Source',
      rules: {
        enforceStrictTypes: true,
        requireCoverageFloor: 80,
        securityAuditOnPR: true,
        autoTriageIssues: true,
      },
      reviewSettings: {
        model: 'gpt-4o',
        maxDiffLines: 1000,
        commentOnPass: false,
      },
    };

    if (!fs.existsSync(configPath)) {
      return defaultConfig;
    }

    try {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<CodexConfig>;
      return { ...defaultConfig, ...parsed };
    } catch {
      return defaultConfig;
    }
  }
}
