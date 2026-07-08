/**
 * LLM client + embeddings — thin wrapper around the OpenAI SDK with strict
 * JSON-mode helpers and a single point for retries / timeouts.
 *
 * Why a wrapper:
 *   - Every call goes through the same retry policy (jittered, max 2 retries).
 *   - JSON parsing is checked here, not duplicated in every service.
 *   - Tests can swap in a fake by passing `client` overrides.
 */

import type OpenAI from 'openai';
import { callOpenAiJson, embedTextWithUsage } from '../services/openAiClient';
import type { UsageContext } from '../services/usageLedgerService';

export interface LlmCallOptions {
  model: string;
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  context?: Omit<UsageContext, 'provider' | 'callType' | 'modelRequested'>;
  /** Override the shared client (testing). */
  client?: OpenAI | null;
}

export class LlmError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'LlmError';
  }
}

/** Call the LLM and parse a JSON object from the response. Throws LlmError on failure. */
export async function callJson<T = unknown>(opts: LlmCallOptions): Promise<T> {
  try {
    return await callOpenAiJson<T>({
      model: opts.model,
      system: opts.system,
      user: opts.user,
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
      context: opts.context,
      client: opts.client,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new LlmError(message, err);
  }
}

/** Embed a single text. Returns null if no API key is configured (so tests + offline runs degrade gracefully). */
export async function embedText(
  text: string,
  client?: OpenAI | null,
  context?: Omit<UsageContext, 'provider' | 'callType' | 'modelRequested'>
): Promise<number[] | null> {
  return embedTextWithUsage({ text, client, context });
}

export const Models = {
  /** Topics generation — fast, cheap, structured output. */
  topics: 'gpt-4o-mini',
  /** Competitor ranking — quality matters, but constrained to supplied list. */
  competitors: 'gpt-4o-mini',
  /** Domain context synthesis — needs to read a big crawl blob. */
  synthesis: 'gpt-4o-mini',
} as const;
