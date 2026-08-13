import { Writable } from 'node:stream';
import { CliIo } from '../src/cli/index.js';

export interface CapturedIo extends CliIo {
  readonly out: () => string;
  readonly err: () => string;
}

export function createCapturedIo(env: NodeJS.ProcessEnv = envWithoutKey()): CapturedIo {
  let stdout = '';
  let stderr = '';

  const stdoutStream = new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      stdout += String(chunk);
      callback();
    },
  });

  const stderrStream = new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      stderr += String(chunk);
      callback();
    },
  });

  return {
    stdout: stdoutStream,
    stderr: stderrStream,
    env,
    cwd: process.cwd(),
    out: () => stdout,
    err: () => stderr,
  };
}

export function envWithoutKey(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.OPENAI_API_KEY;
  return env;
}

export function jsonResponsesResponse(content: string, status: number = 200): Response {
  return new Response(
    JSON.stringify({
      output_text: content,
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: content }],
        },
      ],
    }),
    {
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      headers: { 'Content-Type': 'application/json' },
    },
  );
}

export const jsonCompletionResponse = jsonResponsesResponse;

export function approvedReviewJson(): string {
  return JSON.stringify({
    approved: true,
    score: 88,
    summary: 'Looks good.',
    ruleViolations: [],
    suggestions: ['Keep going.'],
  });
}

export function rejectedReviewJson(): string {
  return JSON.stringify({
    approved: false,
    score: 12,
    summary: 'Does not meet repository standards.',
    ruleViolations: ['missing tests'],
    suggestions: ['Add tests.'],
  });
}
