import { Prisma, PrismaClient } from '../../generated/prisma';
import { prisma as defaultPrisma } from '../lib/prisma';

export type UsageStatus = 'success' | 'failed' | 'timeout' | 'skipped';
export type UsageCostSource = 'provider_reported' | 'generation_api' | 'estimated' | 'flat_rate' | 'legacy_estimate' | 'none';

export interface UsageContext {
  userId?: number | null;
  sessionId?: number | null;
  domainId?: number | null;
  domainHost?: string | null;
  runId?: number | null;
  promptId?: number | null;
  aiQueryResultId?: number | null;
  provider: string;
  feature: string;
  operation: string;
  callType: string;
  modelRequested?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface UsageAttemptResult {
  status: UsageStatus;
  modelUsed?: string | null;
  providerGenerationId?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  cachedTokens?: number | null;
  reasoningTokens?: number | null;
  costUsd?: number | string | Prisma.Decimal | null;
  costSource?: UsageCostSource;
  latencyMs?: number | null;
  httpStatus?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface UsageFilters {
  from?: Date;
  to?: Date;
  userId?: number;
  domainId?: number;
  provider?: string;
  feature?: string;
  model?: string;
  status?: string;
}

const REDACTED_METADATA_KEYS = new Set([
  'prompt',
  'prompts',
  'response',
  'responses',
  'messages',
  'message',
  'content',
  'body',
  'system',
  'user',
  'assistant',
  'text',
]);

function toDecimal(value: number | string | Prisma.Decimal | null | undefined): Prisma.Decimal {
  if (value instanceof Prisma.Decimal) return value;
  if (value === null || value === undefined || value === '') return new Prisma.Decimal(0);
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? new Prisma.Decimal(numeric) : new Prisma.Decimal(0);
}

function decimalToNumber(value: Prisma.Decimal | number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (value instanceof Prisma.Decimal) return Number(value.toFixed(8));
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function positiveInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function safeString(value: unknown, max = 500): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : null;
}

export function scrubUsageMetadata(input?: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!input) return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (REDACTED_METADATA_KEYS.has(key.toLowerCase())) {
      out[key] = '[redacted]';
      continue;
    }
    if (Array.isArray(value)) {
      out[key] = value.length <= 20 ? value : { length: value.length };
      continue;
    }
    if (value && typeof value === 'object') {
      out[key] = scrubUsageMetadata(value as Record<string, unknown>);
      continue;
    }
    out[key] = typeof value === 'string' ? value.slice(0, 500) : value;
  }
  return Object.keys(out).length ? out : null;
}

function buildWhere(filters: UsageFilters = {}): Prisma.UsageLedgerEntryWhereInput {
  const where: Prisma.UsageLedgerEntryWhereInput = {};
  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    };
  }
  if (filters.userId) where.userId = filters.userId;
  if (filters.domainId) where.domainId = filters.domainId;
  if (filters.provider) where.provider = filters.provider;
  if (filters.feature) where.feature = filters.feature;
  if (filters.model) where.OR = [{ modelUsed: filters.model }, { modelRequested: filters.model }];
  if (filters.status) where.status = filters.status;
  return where;
}

export async function recordUsageAttempt(
  context: UsageContext,
  result: UsageAttemptResult,
  client: PrismaClient = defaultPrisma
) {
  try {
    const metadata = scrubUsageMetadata({
      ...(context.metadata ?? {}),
      ...(result.metadata ?? {}),
    });
    return await client.usageLedgerEntry.create({
      data: {
        userId: context.userId ?? null,
        sessionId: context.sessionId ?? null,
        domainId: context.domainId ?? null,
        domainHost: context.domainHost ?? null,
        runId: context.runId ?? null,
        promptId: context.promptId ?? null,
        aiQueryResultId: context.aiQueryResultId ?? null,
        provider: context.provider,
        feature: context.feature,
        operation: context.operation,
        callType: context.callType,
        status: result.status,
        modelRequested: context.modelRequested ?? null,
        modelUsed: result.modelUsed ?? context.modelRequested ?? null,
        providerGenerationId: result.providerGenerationId ?? null,
        promptTokens: positiveInt(result.promptTokens),
        completionTokens: positiveInt(result.completionTokens),
        totalTokens: positiveInt(result.totalTokens),
        cachedTokens: positiveInt(result.cachedTokens),
        reasoningTokens: positiveInt(result.reasoningTokens),
        costUsd: toDecimal(result.costUsd),
        costSource: result.costSource ?? (result.costUsd ? 'provider_reported' : 'none'),
        latencyMs: positiveInt(result.latencyMs),
        httpStatus: positiveInt(result.httpStatus),
        errorCode: safeString(result.errorCode, 120),
        errorMessage: safeString(result.errorMessage, 500),
        metadata: metadata as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (err) {
    console.warn('[usage-ledger] failed to record usage', {
      provider: context.provider,
      feature: context.feature,
      operation: context.operation,
      err,
    });
    return null;
  }
}

export async function recordExternalUsage(
  context: Omit<UsageContext, 'callType'> & { callType?: string },
  input: {
    status?: UsageStatus;
    costUsd?: number;
    costSource?: UsageCostSource;
    latencyMs?: number | null;
    httpStatus?: number | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    metadata?: Record<string, unknown> | null;
  },
  client: PrismaClient = defaultPrisma
) {
  return recordUsageAttempt(
    {
      ...context,
      callType: context.callType ?? 'external',
    },
    {
      status: input.status ?? 'success',
      costUsd: input.costUsd ?? 0,
      costSource: input.costSource ?? 'flat_rate',
      latencyMs: input.latencyMs,
      httpStatus: input.httpStatus,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      metadata: input.metadata,
    },
    client
  );
}

export async function getUsageSummary(filters: UsageFilters = {}, client: PrismaClient = defaultPrisma) {
  const where = buildWhere(filters);
  const [agg, failedCalls, promptRows] = await Promise.all([
    client.usageLedgerEntry.aggregate({
      where,
      _count: { id: true },
      _sum: {
        costUsd: true,
        promptTokens: true,
        completionTokens: true,
        totalTokens: true,
      },
    }),
    client.usageLedgerEntry.count({ where: { ...where, status: { not: 'success' } } }),
    client.usageLedgerEntry.findMany({
      where: { ...where, promptId: { not: null } },
      distinct: ['promptId'],
      select: { promptId: true },
    }),
  ]);
  const totalCostUsd = decimalToNumber(agg._sum.costUsd);
  const uniquePrompts = promptRows.length;
  return {
    totalCostUsd,
    totalCalls: agg._count.id,
    failedCalls,
    promptTokens: agg._sum.promptTokens ?? 0,
    completionTokens: agg._sum.completionTokens ?? 0,
    totalTokens: agg._sum.totalTokens ?? 0,
    uniquePrompts,
    avgCostPerPromptUsd: uniquePrompts > 0 ? Number((totalCostUsd / uniquePrompts).toFixed(8)) : 0,
  };
}

export async function getUsageByUser(filters: UsageFilters = {}, client: PrismaClient = defaultPrisma) {
  const groups = await client.usageLedgerEntry.groupBy({
    by: ['userId'],
    where: buildWhere(filters),
    _count: { id: true },
    _sum: { costUsd: true, totalTokens: true },
  });
  const userIds = groups.map((g) => g.userId).filter((id): id is number => typeof id === 'number');
  const users = userIds.length
    ? await client.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true, name: true },
      })
    : [];
  const byId = new Map(users.map((user) => [user.id, user]));
  return groups
    .map((group) => ({
      userId: group.userId,
      email: group.userId ? byId.get(group.userId)?.email ?? null : null,
      name: group.userId ? byId.get(group.userId)?.name ?? null : null,
      totalCalls: group._count.id,
      totalTokens: group._sum.totalTokens ?? 0,
      totalCostUsd: decimalToNumber(group._sum.costUsd),
    }))
    .sort((a, b) => b.totalCostUsd - a.totalCostUsd);
}

export async function getUsageByPrompt(filters: UsageFilters = {}, client: PrismaClient = defaultPrisma) {
  const where = { ...buildWhere(filters), promptId: { not: null } };
  const groups = await client.usageLedgerEntry.groupBy({
    by: ['promptId'],
    where,
    _count: { id: true },
    _sum: { costUsd: true, totalTokens: true },
  });
  const promptIds = groups.map((g) => g.promptId).filter((id): id is number => typeof id === 'number');
  const prompts = promptIds.length
    ? await client.prompt.findMany({
        where: { id: { in: promptIds } },
        select: {
          id: true,
          text: true,
          domainId: true,
          domain: { select: { host: true, url: true, userId: true } },
        },
      })
    : [];
  const byId = new Map(prompts.map((prompt) => [prompt.id, prompt]));
  return groups
    .map((group) => {
      const prompt = group.promptId ? byId.get(group.promptId) : null;
      return {
        promptId: group.promptId,
        promptText: prompt?.text ?? null,
        domainId: prompt?.domainId ?? null,
        domainHost: prompt?.domain.host ?? null,
        userId: prompt?.domain.userId ?? null,
        totalCalls: group._count.id,
        totalTokens: group._sum.totalTokens ?? 0,
        totalCostUsd: decimalToNumber(group._sum.costUsd),
      };
    })
    .sort((a, b) => b.totalCostUsd - a.totalCostUsd);
}

export async function getUsageByModel(filters: UsageFilters = {}, client: PrismaClient = defaultPrisma) {
  const groups = await client.usageLedgerEntry.groupBy({
    by: ['provider', 'modelUsed'],
    where: buildWhere(filters),
    _count: { id: true },
    _sum: { costUsd: true, totalTokens: true },
  });
  return groups
    .map((group) => ({
      provider: group.provider,
      model: group.modelUsed,
      totalCalls: group._count.id,
      totalTokens: group._sum.totalTokens ?? 0,
      totalCostUsd: decimalToNumber(group._sum.costUsd),
    }))
    .sort((a, b) => b.totalCostUsd - a.totalCostUsd);
}

export async function getUsageLogs(
  filters: UsageFilters = {},
  page = 1,
  pageSize = 50,
  client: PrismaClient = defaultPrisma
) {
  const safePage = Math.max(1, Math.trunc(page));
  const safePageSize = Math.min(200, Math.max(1, Math.trunc(pageSize)));
  const where = buildWhere(filters);
  const [total, rows] = await Promise.all([
    client.usageLedgerEntry.count({ where }),
    client.usageLedgerEntry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (safePage - 1) * safePageSize,
      take: safePageSize,
    }),
  ]);
  return {
    page: safePage,
    pageSize: safePageSize,
    total,
    rows: rows.map((row) => ({
      ...row,
      costUsd: decimalToNumber(row.costUsd),
    })),
  };
}

function titleizeUsageValue(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function providerLabel(provider: string): string {
  const labels: Record<string, string> = {
    openrouter: 'OpenRouter',
    openai: 'OpenAI',
    serpapi: 'SerpAPI',
    serper: 'Serper',
    n8n: 'n8n',
    pagespeed: 'PageSpeed',
  };
  return labels[provider] ?? titleizeUsageValue(provider);
}

function modelLabel(model: string): string {
  const known: Record<string, string> = {
    'openai/gpt-4o-mini': 'GPT-4o Mini',
    'openai/gpt-4o': 'GPT-4o',
    'anthropic/claude-sonnet-4.5': 'Claude Sonnet 4.5',
    'google/gemini-2.5-flash:online': 'Gemini 2.5 Flash',
    'text-embedding-3-small': 'OpenAI Embeddings Small',
    'text-embedding-3-large': 'OpenAI Embeddings Large',
  };
  return known[model] ?? model.replace(/^openai\//, '').replace(/^anthropic\//, '').replace(/^google\//, '');
}

export async function getUsageFilterOptions(client: PrismaClient = defaultPrisma) {
  const [userRows, domainRows, providerRows, featureRows, statusRows, modelUsedRows, modelRequestedRows] =
    await Promise.all([
      client.usageLedgerEntry.findMany({
        where: { userId: { not: null } },
        distinct: ['userId'],
        select: { userId: true },
        orderBy: { userId: 'asc' },
      }),
      client.usageLedgerEntry.findMany({
        where: { OR: [{ domainId: { not: null } }, { domainHost: { not: null } }] },
        distinct: ['domainId', 'domainHost'],
        select: { domainId: true, domainHost: true },
        orderBy: { domainHost: 'asc' },
      }),
      client.usageLedgerEntry.findMany({
        distinct: ['provider'],
        select: { provider: true },
        orderBy: { provider: 'asc' },
      }),
      client.usageLedgerEntry.findMany({
        distinct: ['feature'],
        select: { feature: true },
        orderBy: { feature: 'asc' },
      }),
      client.usageLedgerEntry.findMany({
        distinct: ['status'],
        select: { status: true },
        orderBy: { status: 'asc' },
      }),
      client.usageLedgerEntry.findMany({
        where: { modelUsed: { not: null } },
        distinct: ['modelUsed'],
        select: { modelUsed: true },
        orderBy: { modelUsed: 'asc' },
      }),
      client.usageLedgerEntry.findMany({
        where: { modelRequested: { not: null } },
        distinct: ['modelRequested'],
        select: { modelRequested: true },
        orderBy: { modelRequested: 'asc' },
      }),
    ]);

  const userIds = userRows.map((row) => row.userId).filter((id): id is number => typeof id === 'number');
  const users = userIds.length
    ? await client.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true, name: true },
      })
    : [];
  const usersById = new Map(users.map((user) => [user.id, user]));

  const domainIds = domainRows.map((row) => row.domainId).filter((id): id is number => typeof id === 'number');
  const domains = domainIds.length
    ? await client.domain.findMany({
        where: { id: { in: domainIds } },
        select: { id: true, host: true, url: true },
      })
    : [];
  const domainsById = new Map(domains.map((domain) => [domain.id, domain]));

  const modelValues = new Set<string>();
  for (const row of modelUsedRows) if (row.modelUsed) modelValues.add(row.modelUsed);
  for (const row of modelRequestedRows) if (row.modelRequested) modelValues.add(row.modelRequested);

  return {
    users: userIds.map((id) => {
      const found = usersById.get(id);
      return {
        value: String(id),
        label: found?.name || found?.email || `User ${id}`,
        description: found?.email && found.name ? found.email : undefined,
      };
    }),
    domains: domainRows
      .map((row) => {
        const domain = row.domainId ? domainsById.get(row.domainId) : null;
        const label = domain?.host || row.domainHost || (row.domainId ? `Domain ${row.domainId}` : 'Unknown domain');
        return {
          value: row.domainId ? String(row.domainId) : '',
          label,
          description: domain?.url ?? undefined,
        };
      })
      .filter((option) => option.value || option.label !== 'Unknown domain'),
    providers: providerRows.map((row) => ({
      value: row.provider,
      label: providerLabel(row.provider),
    })),
    features: featureRows.map((row) => ({
      value: row.feature,
      label: titleizeUsageValue(row.feature),
    })),
    models: Array.from(modelValues)
      .sort()
      .map((model) => ({
        value: model,
        label: modelLabel(model),
        description: model,
      })),
    statuses: statusRows.map((row) => ({
      value: row.status,
      label: titleizeUsageValue(row.status),
    })),
  };
}

export function serializeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
