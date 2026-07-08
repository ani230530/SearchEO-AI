import { recordExternalUsage, type UsageContext, type UsageCostSource, type UsageStatus } from './usageLedgerService';

export const EXTERNAL_COST_USD = {
  serpapi: 0.005,
  serper: 0.001,
  pagespeed: 0,
  n8n: 0,
} as const;

export async function logExternalUsage(args: {
  provider: keyof typeof EXTERNAL_COST_USD | string;
  feature: string;
  operation: string;
  status?: UsageStatus;
  costUsd?: number;
  costSource?: UsageCostSource;
  latencyMs?: number | null;
  httpStatus?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  context?: Partial<Omit<UsageContext, 'provider' | 'feature' | 'operation' | 'callType'>>;
  metadata?: Record<string, unknown> | null;
}) {
  const defaultCost = Object.prototype.hasOwnProperty.call(EXTERNAL_COST_USD, args.provider)
    ? EXTERNAL_COST_USD[args.provider as keyof typeof EXTERNAL_COST_USD]
    : 0;
  return recordExternalUsage(
    {
      provider: args.provider,
      feature: args.feature,
      operation: args.operation,
      callType: 'external',
      userId: args.context?.userId ?? null,
      sessionId: args.context?.sessionId ?? null,
      domainId: args.context?.domainId ?? null,
      domainHost: args.context?.domainHost ?? null,
      runId: args.context?.runId ?? null,
      promptId: args.context?.promptId ?? null,
      aiQueryResultId: args.context?.aiQueryResultId ?? null,
      modelRequested: args.context?.modelRequested ?? null,
      metadata: args.context?.metadata ?? null,
    },
    {
      status: args.status ?? 'success',
      costUsd: args.costUsd ?? defaultCost,
      costSource: args.costSource ?? 'flat_rate',
      latencyMs: args.latencyMs,
      httpStatus: args.httpStatus,
      errorCode: args.errorCode,
      errorMessage: args.errorMessage,
      metadata: args.metadata,
    }
  );
}
