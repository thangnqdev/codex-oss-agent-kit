import { CodexConfig } from '../types/index.js';
import { ValidationError } from './errors.js';

export function getDefaultConfig(): CodexConfig {
  return {
    version: '1.0.0',
    program: 'Codex for Open Source',
    rules: {
      securityAuditOnPR: true,
    },
    reviewSettings: {
      model: 'gpt-5.6',
      maxDiffLines: 1000,
    },
  };
}

export function validateConfig(config: CodexConfig): CodexConfig {
  if (typeof config.version !== 'string' || config.version.trim() === '') {
    throw new ValidationError('Config version must be a non-empty string');
  }
  if (typeof config.program !== 'string' || config.program.trim() === '') {
    throw new ValidationError('Config program must be a non-empty string');
  }
  if (typeof config.rules.securityAuditOnPR !== 'boolean') {
    throw new ValidationError('Config rules.securityAuditOnPR must be a boolean');
  }
  if (
    typeof config.reviewSettings.model !== 'string' ||
    config.reviewSettings.model.trim() === ''
  ) {
    throw new ValidationError('Config reviewSettings.model must be a non-empty string');
  }
  if (
    typeof config.reviewSettings.maxDiffLines !== 'number' ||
    !Number.isFinite(config.reviewSettings.maxDiffLines) ||
    config.reviewSettings.maxDiffLines < 1
  ) {
    throw new ValidationError('Config reviewSettings.maxDiffLines must be a positive number');
  }
  return config;
}

export function deepMergeConfig(base: CodexConfig, override: Partial<CodexConfig>): CodexConfig {
  if (override.rules !== undefined && !isPlainObject(override.rules)) {
    throw new ValidationError('Config rules must be an object');
  }
  if (override.reviewSettings !== undefined && !isPlainObject(override.reviewSettings)) {
    throw new ValidationError('Config reviewSettings must be an object');
  }

  const merged: CodexConfig = {
    version: override.version ?? base.version,
    program: override.program ?? base.program,
    rules: {
      ...base.rules,
      ...(override.rules ?? {}),
    },
    reviewSettings: {
      ...base.reviewSettings,
      ...(override.reviewSettings ?? {}),
    },
  };

  return validateConfig(merged);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
