/**
 * LLM client + embeddings — thin wrapper around the OpenAI SDK with strict
 * JSON-mode helpers and a single point for retries / timeouts.
 *
 * Why a wrapper:
 *   - Every call goes through the same retry policy (jittered, max 2 retries).
 *   - JSON parsing is checked here, not duplicated in every service.
 *   - Tests can swap in a fake by passing `client` overrides.
 */

import OpenAI from 'openai';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const sharedClient = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

export interface LlmCallOptions {
  model: string;
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  /** Override the shared client (testing). */
  client?: OpenAI | null;
}

export class LlmError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'LlmError';
  }
}

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 3;

async function withRetry<T>(fn: () => Promise<T>, attempts = MAX_ATTEMPTS): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const wait = 200 * (i + 1) + Math.random() * 200;
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

/** Call the LLM and parse a JSON object from the response. Throws LlmError on failure. */
export async function callJson<T = unknown>(opts: LlmCallOptions): Promise<T> {
  const client = opts.client ?? sharedClient;
  if (!client) throw new LlmError('OPENAI_API_KEY not configured');
  const response = await withRetry(async () => {
    return client.chat.completions.create(
      {
        model: opts.model,
        messages: [
          { role: 'system', content: opts.system },
          { role: 'user', content: opts.user },
        ],
        response_format: { type: 'json_object' },
        temperature: opts.temperature ?? 0.2,
        max_tokens: opts.maxTokens ?? 2000,
      },
      { timeout: DEFAULT_TIMEOUT_MS }
    );
  });
  const text = response.choices[0]?.message?.content ?? '';
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new LlmError(`LLM did not return valid JSON: ${text.slice(0, 200)}`, err);
  }
}

/** Embed a single text. Returns null if no API key is configured (so tests + offline runs degrade gracefully). */
export async function embedText(
  text: string,
  client: OpenAI | null = sharedClient
): Promise<number[] | null> {
  if (!client) return null;
  const trimmed = text.slice(0, 8000); // OpenAI 8k token limit, conservatively
  if (!trimmed.trim()) return null;
  const response = await withRetry(() =>
    client.embeddings.create(
      { model: 'text-embedding-3-small', input: trimmed },
      { timeout: DEFAULT_TIMEOUT_MS }
    )
  );
  return response.data[0]?.embedding ?? null;
}

export const Models = {
  /** Topics generation — fast, cheap, structured output. */
  topics: 'gpt-4o-mini',
  /** Competitor ranking — quality matters, but constrained to supplied list. */
  competitors: 'gpt-4o-mini',
  /** Domain context synthesis — needs to read a big crawl blob. */
  synthesis: 'gpt-4o-mini',
} as const;
