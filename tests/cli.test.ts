import { describe, it, expect } from 'vitest';
import { createProgram } from '../src/cli/index.js';

describe('CLI Commands', () => {
  it('creates commander program with review, triage, audit commands', () => {
    const program = createProgram();
    expect(program.name()).toBe('codex-oss');
    
    const commandNames = program.commands.map(cmd => cmd.name());
    expect(commandNames).toContain('review');
    expect(commandNames).toContain('triage');
    expect(commandNames).toContain('audit');
  });
});
