import OpenAI from 'openai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import {
  recordUsageAttempt,
  type UsageContext,
  type UsageCostSource,
} from './usageLedgerService';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const APP_URL = process.env.OPENROUTER_REFERRER || 'http://localhost:3002';
const DEFAULT_TITLE = 'SearchEO-AI';

const openRouterSdk = OPENROUTER_API_KEY
  ? new OpenAI({
      apiKey: OPENROUTER_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': APP_URL,
        'X-Title': DEFAULT_TITLE,
      },
    })
  : null;

const openRouterAiSdk = OPENROUTER_API_KEY
  ? createOpenRouter({
      apiKey: OPENROUTER_API_KEY,
      compatibility: 'strict',
      headers: {
        'HTTP-Referer': APP_URL,
        'X-Title': DEFAULT_TITLE,
      },
    })
  : null;

export interface OpenRouterUsage {
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  cachedTokens?: number | null;
  reasoningTokens?: number | null;
  costUsd?: number | null;
  costSource?: UsageCostSource;
}

export interface OpenRouterChatResult<T = unknown> {
  completion: T;
  content: string;
  usage: OpenRouterUsage;
  providerGenerationId?: string | null;
  modelUsed?: string | null;
  latencyMs: number;
  ledgerEntryId?: number | null;
  costUsd: number | null;
}

function positiveNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function errorStatus(err: unknown): number | null {
  const maybe = err as { status?: unknown; response?: { status?: unknown } };
  return positiveNumber(maybe?.status) ?? positiveNumber(maybe?.response?.status);
}

function errorCode(err: unknown): string | null {
  const maybe = err as { code?: unknown; error?: { code?: unknown } };
  if (typeof maybe?.code === 'string') return maybe.code;
  if (typeof maybe?.error?.code === 'string') return maybe.error.code;
  return null;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message.slice(0, 500);
  return String(err).slice(0, 500);
}

export function isOpenRouterConfigured(): boolean {
  return openRouterSdk !== null;
}

export function getOpenRouterLanguageModel(model: string, options?: Record<string, unknown>) {
  if (!openRouterAiSdk) {
    throw new Error('OPENROUTER_API_KEY not configured');
  }
  return openRouterAiSdk(model, options as any);
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

function extractUsage(completion: any): OpenRouterUsage {
  const usage = completion?.usage ?? {};
  const promptDetails = usage?.prompt_tokens_details ?? usage?.promptTokensDetails ?? {};
  const completionDetails = usage?.completion_tokens_details ?? usage?.completionTokensDetails ?? {};
  const cost = positiveNumber(usage?.cost ?? usage?.cost_usd ?? usage?.total_cost);
  return {
    promptTokens: positiveNumber(usage?.prompt_tokens ?? usage?.promptTokens),
    completionTokens: positiveNumber(usage?.completion_tokens ?? usage?.completionTokens),
    totalTokens: positiveNumber(usage?.total_tokens ?? usage?.totalTokens),
    cachedTokens: positiveNumber(promptDetails?.cached_tokens ?? promptDetails?.cachedTokens),
    reasoningTokens: positiveNumber(completionDetails?.reasoning_tokens ?? completionDetails?.reasoningTokens),
    costUsd: cost,
    costSource: cost !== null ? 'provider_reported' : 'none',
  };
}

function extractContent(completion: any): string {
  return completion?.choices?.[0]?.message?.content ?? '';
}

async function fetchGenerationUsage(generationId: string | null | undefined): Promise<OpenRouterUsage | null> {
  if (!OPENROUTER_API_KEY || !generationId) return null;
  try {
    const response = await fetch(`https://openrouter.ai/api/v1/generation?id=${encodeURIComponent(generationId)}`, {
      headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}` },
    });
    if (!response.ok) return null;
    const json = await response.json();
    const data = json?.data ?? json;
    const cost = positiveNumber(data?.total_cost ?? data?.cost ?? data?.usage?.cost);
    return {
      promptTokens: positiveNumber(data?.tokens_prompt ?? data?.prompt_tokens ?? data?.usage?.prompt_tokens),
      completionTokens: positiveNumber(data?.tokens_completion ?? data?.completion_tokens ?? data?.usage?.completion_tokens),
      totalTokens: positiveNumber(data?.tokens_total ?? data?.total_tokens ?? data?.usage?.total_tokens),
      cachedTokens: positiveNumber(data?.cached_tokens ?? data?.usage?.prompt_tokens_details?.cached_tokens),
      reasoningTokens: positiveNumber(data?.reasoning_tokens ?? data?.usage?.completion_tokens_details?.reasoning_tokens),
      costUsd: cost,
      costSource: cost !== null ? 'generation_api' : 'none',
    };
  } catch {
    return null;
  }
}

function mergeUsage(primary: OpenRouterUsage, fallback: OpenRouterUsage | null): OpenRouterUsage {
  if (!fallback) return primary;
  return {
    promptTokens: primary.promptTokens ?? fallback.promptTokens,
    completionTokens: primary.completionTokens ?? fallback.completionTokens,
    totalTokens: primary.totalTokens ?? fallback.totalTokens,
    cachedTokens: primary.cachedTokens ?? fallback.cachedTokens,
    reasoningTokens: primary.reasoningTokens ?? fallback.reasoningTokens,
    costUsd: primary.costUsd ?? fallback.costUsd,
    costSource: primary.costUsd !== null && primary.costUsd !== undefined
      ? primary.costSource
      : fallback.costSource,
  };
}

export async function callOpenRouterChat<T = unknown>(args: {
  payload: Record<string, unknown>;
  context: Omit<UsageContext, 'provider' | 'callType' | 'modelRequested'> & {
    modelRequested: string;
    callType?: string;
  };
  timeoutMs?: number;
}): Promise<OpenRouterChatResult<T>> {
  if (!openRouterSdk) throw new Error('OPENROUTER_API_KEY not configured');
  const startedAt = Date.now();
  const baseContext: UsageContext = {
    ...args.context,
    provider: 'openrouter',
    callType: args.context.callType ?? 'chat_completion',
    modelRequested: args.context.modelRequested,
  };
  try {
    const completion = await withTimeout(
      (openRouterSdk.chat.completions as any).create(args.payload),
      args.timeoutMs ?? 60_000
    ) as T;
    const completionAny = completion as any;
    const providerGenerationId = completionAny?.id ?? null;
    const modelUsed = completionAny?.model ?? args.context.modelRequested;
    const responseUsage = extractUsage(completionAny);
    const usage = mergeUsage(
      responseUsage,
      responseUsage.costUsd === null || responseUsage.costUsd === undefined
        ? await fetchGenerationUsage(providerGenerationId)
        : null
    );
    const latencyMs = Date.now() - startedAt;
    const ledgerEntry = await recordUsageAttempt(baseContext, {
      status: 'success',
      modelUsed,
      providerGenerationId,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      cachedTokens: usage.cachedTokens,
      reasoningTokens: usage.reasoningTokens,
      costUsd: usage.costUsd ?? 0,
      costSource: usage.costSource ?? 'none',
      latencyMs,
    });
    return {
      completion,
      content: extractContent(completionAny),
      usage,
      providerGenerationId,
      modelUsed,
      latencyMs,
      ledgerEntryId: ledgerEntry?.id ?? null,
      costUsd: usage.costUsd ?? null,
    };
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    await recordUsageAttempt(baseContext, {
      status: errorMessage(err).toLowerCase().includes('timeout') ? 'timeout' : 'failed',
      modelUsed: args.context.modelRequested,
      costUsd: 0,
      costSource: 'none',
      latencyMs,
      httpStatus: errorStatus(err),
      errorCode: errorCode(err),
      errorMessage: errorMessage(err),
    });
    throw err;
  }
}

export async function callOpenRouterJson<T = unknown>(args: {
  model: string;
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  context: Omit<UsageContext, 'provider' | 'callType' | 'modelRequested'>;
  timeoutMs?: number;
}): Promise<T> {
  const result = await callOpenRouterChat({
    payload: {
      model: args.model,
      messages: [
        { role: 'system', content: args.system },
        { role: 'user', content: args.user },
      ],
      response_format: { type: 'json_object' },
      temperature: args.temperature ?? 0.2,
      max_tokens: args.maxTokens ?? 2000,
    },
    context: {
      ...args.context,
      modelRequested: args.model,
      callType: 'json_chat_completion',
    },
    timeoutMs: args.timeoutMs,
  });
  return JSON.parse(result.content || '{}') as T;
}
