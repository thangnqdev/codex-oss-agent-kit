import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AgentsParser } from '../src/core/agents-parser.js';
import { ValidationError } from '../src/core/errors.js';

describe('AgentsParser', () => {
  it('returns default rules if AGENTS.md file does not exist', () => {
    const rules = AgentsParser.parseAgentsFile('non-existent-agents.md');
    expect(rules.length).toBeGreaterThan(0);
    expect(rules[0]).toContain('Default AGENTS.md rules');
  });

  it('parses bullet points from valid AGENTS.md file', () => {
    const agentsPath = path.resolve(process.cwd(), 'AGENTS.md');
    const rules = AgentsParser.parseAgentsFile(agentsPath);
    expect(rules.length).toBeGreaterThan(0);
  });

  it('returns the full file when no bullets are present', () => {
    const filePath = path.join(os.tmpdir(), `codex-agents-${Date.now()}.md`);
    fs.writeFileSync(filePath, 'No bullets in this file.');
    const rules = AgentsParser.parseAgentsFile(filePath);
    expect(rules).toEqual(['No bullets in this file.']);
  });

  it('returns default config if config file does not exist', () => {
    const config = AgentsParser.parseConfigFile('non-existent-config.json');
    expect(config.program).toBe('Codex for Open Source');
    expect(config.rules.requireCoverageFloor).toBe(80);
    expect(config.reviewSettings.maxDiffLines).toBe(1000);
  });

  it('parses valid config json file', () => {
    const configPath = path.resolve(process.cwd(), '.codex/config.json');
    const config = AgentsParser.parseConfigFile(configPath);
    expect(config.version).toBe('1.0.0');
    expect(config.rules.enforceStrictTypes).toBe(true);
  });

  it('deep-merges partial nested objects and keeps defaults', () => {
    const configPath = path.join(os.tmpdir(), `codex-partial-${Date.now()}.json`);
    fs.writeFileSync(configPath, JSON.stringify({
      rules: { securityAuditOnPR: false },
      reviewSettings: { model: 'gpt-4o-mini' },
    }));

    const config = AgentsParser.parseConfigFile(configPath);
    expect(config.rules.securityAuditOnPR).toBe(false);
    expect(config.rules.requireCoverageFloor).toBe(80);
    expect(config.rules.enforceStrictTypes).toBe(true);
    expect(config.reviewSettings.model).toBe('gpt-4o-mini');
    expect(config.reviewSettings.maxDiffLines).toBe(1000);
    expect(config.reviewSettings.commentOnPass).toBe(false);
  });

  it('throws ValidationError for invalid JSON config', () => {
    const configPath = path.join(os.tmpdir(), `codex-bad-json-${Date.now()}.json`);
    fs.writeFileSync(configPath, '{ not json');
    expect(() => AgentsParser.parseConfigFile(configPath)).toThrow(ValidationError);
    expect(() => AgentsParser.parseConfigFile(configPath)).toThrow(/invalid JSON/i);
  });

  it('throws ValidationError for a non-object config document', () => {
    const configPath = path.join(os.tmpdir(), `codex-array-${Date.now()}.json`);
    fs.writeFileSync(configPath, '[]');
    expect(() => AgentsParser.parseConfigFile(configPath)).toThrow(ValidationError);
  });
});
