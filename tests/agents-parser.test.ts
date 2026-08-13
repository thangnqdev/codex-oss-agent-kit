import { describe, it, expect } from 'vitest';
import { AgentsParser } from '../src/core/agents-parser.js';
import * as path from 'path';

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

  it('returns default config if config file does not exist', () => {
    const config = AgentsParser.parseConfigFile('non-existent-config.json');
    expect(config.program).toBe('Codex for Open Source');
    expect(config.rules.requireCoverageFloor).toBe(80);
  });

  it('parses valid config json file', () => {
    const configPath = path.resolve(process.cwd(), '.codex/config.json');
    const config = AgentsParser.parseConfigFile(configPath);
    expect(config.version).toBe('1.0.0');
    expect(config.rules.enforceStrictTypes).toBe(true);
  });
});
