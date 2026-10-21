import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { buildAiInstructions } from '../ai/v2/instructions.js';
import { buildAiInput } from '../ai/v2/context.js';
import { aiAnalysisInputSchema } from '../ai/v2/input.schema.js';
import { kigenAnalysisResultV2Schema } from '../ai/v2/output.schema.js';
import { validateAiOutput } from '../ai/v2/validation.js';
import type { GuestPolicy, GuestProvider, GuestProviderResponse } from './types.js';

export function buildGuestRequest(input: unknown, policy: GuestPolicy) {
  const parsed = aiAnalysisInputSchema.parse(input);
  if (parsed.referenceContext.personProfile !== null || parsed.referenceContext.userPatternSummary !== null ||
    parsed.referenceContext.recentCaseSummaries.length || parsed.referenceContext.recentFeedbacks.length) {
    throw new Error('Guest history must be empty');
  }
  return { model: policy.model, store: false as const, instructions: buildAiInstructions(),
    input: buildAiInput(parsed), max_output_tokens: policy.maxOutputTokens,
    text: { format: zodTextFormat(kigenAnalysisResultV2Schema, 'kigen_analysis_result_v2') } };
}

type Client = Pick<OpenAI['responses'], 'create'>;
export function createGuestProvider(clientFactory: () => Client = () => {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error('Provider unavailable');
  return new OpenAI({ apiKey, maxRetries: 0 }).responses;
}): GuestProvider {
  return { async generate(input, policy): Promise<GuestProviderResponse> {
    // No retry loop. Exceptions, including timeout or a truncated body, are ambiguous.
    const response = await clientFactory().create(buildGuestRequest(input, policy),
      { maxRetries: 0, timeout: 30_000 });
    if (!response || !['completed', 'failed', 'incomplete', 'cancelled'].includes(response.status ?? '')) {
      return { terminal: false };
    }
    const usage = response.usage ? { inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens, totalTokens: response.usage.total_tokens } : undefined;
    if (response.status !== 'completed') return { terminal: true, usage };
    try {
      const text = response.output.flatMap(item => item.type === 'message'
        ? item.content.flatMap(content => content.type === 'output_text' ? [content.text] : []) : []).join('');
      const parsed = aiAnalysisInputSchema.parse(input);
      const result = validateAiOutput(JSON.parse(text), parsed.referenceContext);
      return { terminal: true, result, usage };
    } catch { return { terminal: true, usage }; }
  } };
}
