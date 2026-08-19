import { describe, expect, it } from 'vitest';
import { deepMergeConfig, getDefaultConfig, validateConfig } from '../src/core/config.js';
import { ValidationError } from '../src/core/errors.js';

describe('config helpers', () => {
  it('returns a complete default config', () => {
    const config = getDefaultConfig();
    expect(config.reviewSettings.model).toBe('gpt-5.6');
    expect(config.rules.securityAuditOnPR).toBe(true);
  });

  it('deep-merges partial rules without dropping defaults', () => {
    const merged = deepMergeConfig(getDefaultConfig(), {
      rules: { securityAuditOnPR: false },
    });
    expect(merged.rules.securityAuditOnPR).toBe(false);
    expect(merged.reviewSettings.maxDiffLines).toBe(1000);
  });

  it('rejects non-object nested overrides', () => {
    expect(() =>
      deepMergeConfig(getDefaultConfig(), {
        rules: 'strict' as unknown as { securityAuditOnPR: boolean },
      }),
    ).toThrow(ValidationError);
    expect(() =>
      deepMergeConfig(getDefaultConfig(), {
        reviewSettings: null as unknown as { model: string },
      }),
    ).toThrow(ValidationError);
  });

  it('rejects invalid field types after merge', () => {
    expect(() => deepMergeConfig(getDefaultConfig(), { version: '' })).toThrow(/version/i);
    expect(() => deepMergeConfig(getDefaultConfig(), { program: '' })).toThrow(/program/i);
    expect(() =>
      deepMergeConfig(getDefaultConfig(), {
        rules: { securityAuditOnPR: 'yes' as unknown as boolean },
      }),
    ).toThrow(/securityAuditOnPR/i);
    expect(() =>
      deepMergeConfig(getDefaultConfig(), {
        reviewSettings: { maxDiffLines: 0 },
      }),
    ).toThrow(/maxDiffLines/i);
    expect(() =>
      deepMergeConfig(getDefaultConfig(), {
        reviewSettings: { model: '' },
      }),
    ).toThrow(/model/i);
  });

  it('validateConfig rejects mistyped booleans and numbers', () => {
    const config = getDefaultConfig();
    expect(() =>
      validateConfig({
        ...config,
        rules: { ...config.rules, securityAuditOnPR: 'yes' as unknown as boolean },
      }),
    ).toThrow(/securityAuditOnPR/i);
    expect(() =>
      validateConfig({
        ...config,
        reviewSettings: { ...config.reviewSettings, maxDiffLines: Number.NaN },
      }),
    ).toThrow(/maxDiffLines/i);
  });
});
