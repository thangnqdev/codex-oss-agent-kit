import * as fs from 'fs';
import { CodexConfig } from '../types/index.js';
import { deepMergeConfig, getDefaultConfig } from './config.js';
import { ValidationError } from './errors.js';

const DEFAULT_AGENTS_TEXT =
  'Default AGENTS.md rules: Enforce strict mode, 80% coverage floor, clean architecture.';

export class AgentsParser {
  public static loadAgentsText(filePath: string): string {
    if (!fs.existsSync(filePath)) {
      return DEFAULT_AGENTS_TEXT;
    }
    return fs.readFileSync(filePath, 'utf-8');
  }

  public static parseAgentsFile(filePath: string): string[] {
    return [AgentsParser.loadAgentsText(filePath)];
  }

  public static parseConfigFile(configPath: string): CodexConfig {
    if (!fs.existsSync(configPath)) {
      return getDefaultConfig();
    }

    let raw: string;
    try {
      raw = fs.readFileSync(configPath, 'utf-8');
    } catch {
      throw new ValidationError(`Config file is unreadable: ${configPath}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new ValidationError(`Config file contains invalid JSON: ${configPath}`);
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new ValidationError(`Config file must contain a JSON object: ${configPath}`);
    }

    return deepMergeConfig(getDefaultConfig(), parsed);
  }
}
