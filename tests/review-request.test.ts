import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REVIEW_MODEL,
  PR_REVIEW_JSON_SCHEMA,
  RESPONSES_API_URL,
  buildResponsesRequest,
  extractResponsesText,
} from '../src/core/review-request.js';

describe('Responses API request builder', () => {
  it('targets the Responses API with a GPT-5.6-family default and a JSON schema', () => {
    const request = buildResponsesRequest(
      DEFAULT_REVIEW_MODEL,
      'user',
      'system',
      PR_REVIEW_JSON_SCHEMA,
    );
    expect(request.url).toBe(RESPONSES_API_URL);
    expect(request.url).toContain('/v1/responses');
    expect(request.url).not.toContain('chat/completions');
    expect(request.body.model).toMatch(/^gpt-5\.6/);
    expect(request.body.text?.format.type).toBe('json_schema');
    expect(request.body.text?.format.name).toBe('pr_review_result');
    expect(request.body.text?.format.schema).toBeDefined();
  });

  it('extracts output_text from a Responses payload', () => {
    expect(extractResponsesText({ output_text: 'hello' })).toBe('hello');
    expect(
      extractResponsesText({
        output: [{ type: 'message', content: [{ type: 'output_text', text: 'from-output' }] }],
      }),
    ).toBe('from-output');
    expect(extractResponsesText({ output: [] })).toBeUndefined();
  });

  it('skips malformed output items and parts defensively', () => {
    expect(extractResponsesText(null)).toBeUndefined();
    expect(extractResponsesText('string')).toBeUndefined();
    expect(extractResponsesText([1, 2])).toBeUndefined();
    expect(extractResponsesText({ output_text: '   ' })).toBeUndefined();
    expect(extractResponsesText({ output: 'not-array' })).toBeUndefined();
    expect(
      extractResponsesText({
        output: [null, 'scalar', [1], { content: null }, { content: '   ' }],
      }),
    ).toBeUndefined();
    expect(
      extractResponsesText({
        output: [{ content: 'plain-string-content' }],
      }),
    ).toBe('plain-string-content');
    expect(
      extractResponsesText({
        output: [{ content: [null, 'scalar', [1], { text: '   ' }, { text: 'kept' }] }],
      }),
    ).toBe('kept');
    expect(
      extractResponsesText({
        output: [{ content: 'one' }, { content: [{ text: 'two' }] }],
      }),
    ).toBe('onetwo');
  });
});
