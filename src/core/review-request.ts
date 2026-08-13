export const RESPONSES_API_URL = 'https://api.openai.com/v1/responses';
export const DEFAULT_REVIEW_MODEL = 'gpt-5.6';

export interface JsonSchemaSpec {
  readonly name: string;
  readonly strict: boolean;
  readonly schema: Record<string, unknown>;
}

export interface ResponsesRequestBody {
  readonly model: string;
  readonly input: ReadonlyArray<{
    readonly role: 'system' | 'user';
    readonly content: string;
  }>;
  readonly text?: {
    readonly format: {
      readonly type: 'json_schema';
      readonly name: string;
      readonly strict: boolean;
      readonly schema: Record<string, unknown>;
    };
  };
}

export const PR_REVIEW_JSON_SCHEMA: JsonSchemaSpec = {
  name: 'pr_review_result',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['approved', 'score', 'summary', 'ruleViolations', 'suggestions'],
    properties: {
      approved: { type: 'boolean' },
      score: { type: 'number' },
      summary: { type: 'string' },
      ruleViolations: { type: 'array', items: { type: 'string' } },
      suggestions: { type: 'array', items: { type: 'string' } },
    },
  },
};

export const ISSUE_TRIAGE_JSON_SCHEMA: JsonSchemaSpec = {
  name: 'issue_triage_result',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['category', 'complexity', 'recommendedLabels', 'hasReproductionSteps', 'summary'],
    properties: {
      category: { type: 'string', enum: ['bug', 'feature', 'documentation', 'question'] },
      complexity: { type: 'string', enum: ['low', 'medium', 'high'] },
      recommendedLabels: { type: 'array', items: { type: 'string' } },
      hasReproductionSteps: { type: 'boolean' },
      summary: { type: 'string' },
    },
  },
};

export function buildResponsesRequest(
  model: string,
  userPrompt: string,
  systemPrompt: string,
  schema?: JsonSchemaSpec,
): { readonly url: string; readonly body: ResponsesRequestBody } {
  const body: ResponsesRequestBody = {
    model,
    input: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  };

  if (schema) {
    return {
      url: RESPONSES_API_URL,
      body: {
        ...body,
        text: {
          format: {
            type: 'json_schema',
            name: schema.name,
            strict: schema.strict,
            schema: schema.schema,
          },
        },
      },
    };
  }

  return { url: RESPONSES_API_URL, body };
}

export function extractResponsesText(data: unknown): string | undefined {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return undefined;
  }

  const record = data as { output_text?: unknown; output?: unknown };
  if (typeof record.output_text === 'string' && record.output_text.trim() !== '') {
    return record.output_text;
  }

  if (!Array.isArray(record.output)) {
    return undefined;
  }

  const pieces: string[] = [];
  for (const item of record.output) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      continue;
    }
    const content = (item as { content?: unknown }).content;
    if (typeof content === 'string' && content.trim() !== '') {
      pieces.push(content);
      continue;
    }
    if (!Array.isArray(content)) {
      continue;
    }
    for (const part of content) {
      if (typeof part !== 'object' || part === null || Array.isArray(part)) {
        continue;
      }
      const text = (part as { text?: unknown }).text;
      if (typeof text === 'string' && text.trim() !== '') {
        pieces.push(text);
      }
    }
  }

  if (pieces.length === 0) {
    return undefined;
  }
  return pieces.join('');
}
