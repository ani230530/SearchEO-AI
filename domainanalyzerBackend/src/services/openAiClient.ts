import OpenAI from 'openai';
import {
  recordUsageAttempt,
  type UsageContext,
} from './usageLedgerService';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 3;

const CHAT_USD_PER_1M: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4o': { input: 2.50, output: 10.00 },
};

const EMBEDDING_USD_PER_1M: Record<string, number> = {
  'text-embedding-3-small': 0.02,
  'text-embedding-3-large': 0.13,
};

function estimateChatCost(model: string, promptTokens = 0, completionTokens = 0): number {
  const price = CHAT_USD_PER_1M[model] ?? CHAT_USD_PER_1M['gpt-4o-mini'];
  return (promptTokens / 1_000_000) * price.input + (completionTokens / 1_000_000) * price.output;
}

function estimateEmbeddingCost(model: string, tokens = 0): number {
  const price = EMBEDDING_USD_PER_1M[model] ?? EMBEDDING_USD_PER_1M['text-embedding-3-small'];
  return (tokens / 1_000_000) * price;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function withRetry<T>(fn: () => Promise<T>, attempts = MAX_ATTEMPTS): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const wait = 200 * (i + 1) + Math.random() * 200;
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
  throw lastErr;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message.slice(0, 500);
  return String(err).slice(0, 500);
}

function errorStatus(err: unknown): number | null {
  const maybe = err as { status?: unknown; response?: { status?: unknown } };
  const n = Number(maybe?.status ?? maybe?.response?.status);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function errorCode(err: unknown): string | null {
  const maybe = err as { code?: unknown; error?: { code?: unknown } };
  if (typeof maybe?.code === 'string') return maybe.code;
  if (typeof maybe?.error?.code === 'string') return maybe.error.code;
  return null;
}

export class OpenAiClientError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'OpenAiClientError';
  }
}

export function isOpenAiConfigured(): boolean {
  return openai !== null;
}

export async function callOpenAiJson<T = unknown>(args: {
  model: string;
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  context?: Omit<UsageContext, 'provider' | 'callType' | 'modelRequested'>;
  client?: OpenAI | null;
}): Promise<T> {
  const client = args.client ?? openai;
  if (!client) throw new OpenAiClientError('OPENAI_API_KEY not configured');
  const startedAt = Date.now();
  const context: UsageContext = {
    provider: 'openai',
    feature: args.context?.feature ?? 'unknown',
    operation: args.context?.operation ?? 'json_chat_completion',
    callType: 'json_chat_completion',
    modelRequested: args.model,
    userId: args.context?.userId ?? null,
    sessionId: args.context?.sessionId ?? null,
    domainId: args.context?.domainId ?? null,
    domainHost: args.context?.domainHost ?? null,
    runId: args.context?.runId ?? null,
    promptId: args.context?.promptId ?? null,
    aiQueryResultId: args.context?.aiQueryResultId ?? null,
    metadata: args.context?.metadata ?? null,
  };
  try {
    const response = await withRetry(() =>
      withTimeout(
        client.chat.completions.create({
          model: args.model,
          messages: [
            { role: 'system', content: args.system },
            { role: 'user', content: args.user },
          ],
          response_format: { type: 'json_object' },
          temperature: args.temperature ?? 0.2,
          max_tokens: args.maxTokens ?? 2000,
        }),
        args.timeoutMs ?? DEFAULT_TIMEOUT_MS
      )
    );
    const usage = response.usage;
    const promptTokens = usage?.prompt_tokens ?? null;
    const completionTokens = usage?.completion_tokens ?? null;
    const totalTokens = usage?.total_tokens ?? null;
    const costUsd = estimateChatCost(args.model, promptTokens ?? 0, completionTokens ?? 0);
    await recordUsageAttempt(context, {
      status: 'success',
      modelUsed: response.model ?? args.model,
      providerGenerationId: response.id,
      promptTokens,
      completionTokens,
      totalTokens,
      costUsd,
      costSource: 'estimated',
      latencyMs: Date.now() - startedAt,
    });
    const text = response.choices[0]?.message?.content ?? '';
    return JSON.parse(text) as T;
  } catch (err) {
    await recordUsageAttempt(context, {
      status: errorMessage(err).toLowerCase().includes('timeout') ? 'timeout' : 'failed',
      modelUsed: args.model,
      costUsd: 0,
      costSource: 'none',
      latencyMs: Date.now() - startedAt,
      httpStatus: errorStatus(err),
      errorCode: errorCode(err),
      errorMessage: errorMessage(err),
    });
    throw new OpenAiClientError(`OpenAI JSON call failed: ${errorMessage(err)}`, err);
  }
}

export async function embedTextWithUsage(args: {
  text: string;
  model?: string;
  context?: Omit<UsageContext, 'provider' | 'callType' | 'modelRequested'>;
  client?: OpenAI | null;
}): Promise<number[] | null> {
  const client = args.client ?? openai;
  if (!client) return null;
  const model = args.model ?? 'text-embedding-3-small';
  const trimmed = args.text.slice(0, 8000);
  if (!trimmed.trim()) return null;
  const startedAt = Date.now();
  const context: UsageContext = {
    provider: 'openai',
    feature: args.context?.feature ?? 'wizard',
    operation: args.context?.operation ?? 'embedding',
    callType: 'embedding',
    modelRequested: model,
    userId: args.context?.userId ?? null,
    sessionId: args.context?.sessionId ?? null,
    domainId: args.context?.domainId ?? null,
    domainHost: args.context?.domainHost ?? null,
    runId: args.context?.runId ?? null,
    promptId: args.context?.promptId ?? null,
    aiQueryResultId: args.context?.aiQueryResultId ?? null,
    metadata: args.context?.metadata ?? null,
  };
  try {
    const response = await withRetry(() =>
      withTimeout(
        client.embeddings.create({ model, input: trimmed }),
        DEFAULT_TIMEOUT_MS
      )
    );
    const totalTokens = response.usage?.total_tokens ?? null;
    await recordUsageAttempt(context, {
      status: 'success',
      modelUsed: model,
      promptTokens: totalTokens,
      totalTokens,
      costUsd: estimateEmbeddingCost(model, totalTokens ?? 0),
      costSource: 'estimated',
      latencyMs: Date.now() - startedAt,
    });
    return response.data[0]?.embedding ?? null;
  } catch (err) {
    await recordUsageAttempt(context, {
      status: errorMessage(err).toLowerCase().includes('timeout') ? 'timeout' : 'failed',
      modelUsed: model,
      costUsd: 0,
      costSource: 'none',
      latencyMs: Date.now() - startedAt,
      httpStatus: errorStatus(err),
      errorCode: errorCode(err),
      errorMessage: errorMessage(err),
    });
    throw err;
  }
}

