/**
 * Central React Query hooks for every AI Checker data fetch.
 *
 * Why this file exists: previously each AI Checker page (Report Preview,
 * Track Prompts, Track Keywords, Competitors, Prompt Gaps) called the same
 * endpoints with its own `useEffect + apiGet`. Switching tabs unmounted the
 * page and refetched all 3–4 endpoints, even when the user was still on the
 * same domain. By routing every fetch through React Query with stable keys
 * defined here, two pages requesting the same `(domainId, runId)` payload
 * share one network call and one in-memory copy.
 *
 * Conventions:
 *   • Always use `aiResultsKeys.*` — never construct query keys inline.
 *   • Pass `null` for `domainId` when it's still being resolved; the hook
 *     stays disabled and returns `undefined`.
 *   • Trends / runs / competitors are independent of `runId` — they
 *     describe history that doesn't change when the user picks a past run.
 *   • Report + competitor-analysis are scoped by `(domainId, runId)`. The
 *     `runId='latest'` sentinel keeps the cache stable while the user is
 *     viewing the latest completed run (most common case).
 */

import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/services/apiClient';

export const aiResultsKeys = {
  domains: () => ['ai-results', 'domains'] as const,
  report: (domainId: number | string, runId?: number | null, view: 'lite' | 'full' | 'responses' = 'lite') =>
    ['ai-results', 'report', domainId, runId ?? 'latest', view] as const,
  trends: (domainId: number | string, days?: number) =>
    ['ai-results', 'trends', domainId, days ?? 'legacy'] as const,
  runs: (domainId: number | string) =>
    ['ai-results', 'runs', domainId] as const,
  competitorAnalysis: (domainId: number | string, runId?: number | null) =>
    ['ai-results', 'competitor-analysis', domainId, runId ?? 'latest'] as const,
  competitors: (domainId: number | string) =>
    ['ai-results', 'competitors', domainId] as const,
  trackedPrompts: (domainId: number | string) =>
    ['ai-results', 'tracked-prompts', domainId] as const,
  promptHistory: (
    domainId: number | string,
    rowType: 'prompt' | 'keyword',
    rawId: number | string,
    kind: 'audit' | 'weekly',
  ) => ['ai-results', 'prompt-history', domainId, rowType, rawId, kind] as const,
  campaigns: () => ['ai-results', 'campaigns'] as const,
  gscStatus: () => ['ai-results', 'gsc-status'] as const,
};

type QueryControl = {
  enabled?: boolean;
  staleTime?: number;
};

type ReportQueryOptions = QueryControl & {
  includeInsights?: boolean;
  includeResponses?: boolean;
};

// ── Shared types ───────────────────────────────────────────────────────────

export interface DomainRow {
  id: number;
  url: string;
  createdAt: string;
  lastAnalyzed?: string | Date | null;
  host?: string;
  companyName?: string | null;
  metrics?: {
    visibilityScore: number | null;
    shareOfVoice: number | null;
    brandAccuracy: number | null;
    brandSentiment: number | null;
    mentions: number;
    overallHealth: number | null;
  };
}

export interface DomainsResponse {
  domains: DomainRow[];
}

// Report / trends / runs / competitor-analysis shapes are intentionally
// loose (`any`) here — pages parse what they need. Tightening them would
// require duplicating ~200 lines of types already declared per page. The
// query layer only cares about caching the raw JSON.

// ── Hooks ──────────────────────────────────────────────────────────────────

/**
 * The user's domain list. Cached for 10 minutes — domains rarely change
 * during a session, and the list is needed by every AI Checker page.
 */
export function useDomains() {
  return useQuery({
    queryKey: aiResultsKeys.domains(),
    queryFn: () => apiGet<DomainsResponse>('/wizard/domains'),
    staleTime: 10 * 60 * 1000,
  });
}

export function useReport<T = any>(
  domainId: number | null,
  runId?: number | null,
  options: ReportQueryOptions = {},
) {
  const includeInsights = options.includeInsights === true;
  const includeResponses = options.includeResponses === true;
  const view = includeInsights ? 'full' : includeResponses ? 'responses' : 'lite';
  return useQuery<T>({
    queryKey: aiResultsKeys.report(domainId ?? 'none', runId, view),
    queryFn: () => {
      const params = new URLSearchParams();
      if (runId) params.set('runId', String(runId));
      if (!includeInsights) params.set('lite', '1');
      if (includeResponses) params.set('responses', '1');
      const query = params.toString();
      return apiGet<T>(`/wizard/domain/${domainId}/report${query ? `?${query}` : ''}`);
    },
    enabled: domainId != null && (options.enabled ?? true),
    // The report is expensive to build server-side. Keep it fresh in cache so
    // switching between the AI dashboard tabs (which all read this) doesn't
    // refetch, and an alt-tab away/back doesn't re-hit it.
    staleTime: options.staleTime ?? 3 * 60 * 1000,
  });
}

export function useTrends<T = any>(domainId: number | null, days?: number, options: QueryControl = {}) {
  return useQuery<T>({
    queryKey: aiResultsKeys.trends(domainId ?? 'none', days),
    queryFn: () => {
      const path = typeof days === 'number' ? `/wizard/domain/${domainId}/trends?days=${days}` : `/wizard/domain/${domainId}/trends`;
      return apiGet<T>(path);
    },
    enabled: domainId != null && (options.enabled ?? true),
    staleTime: options.staleTime ?? 5 * 60 * 1000,
  });
}

export function useRuns<T = any>(domainId: number | null, options: QueryControl = {}) {
  return useQuery<T>({
    queryKey: aiResultsKeys.runs(domainId ?? 'none'),
    queryFn: () => apiGet<T>(`/wizard/domain/${domainId}/runs`),
    enabled: domainId != null && (options.enabled ?? true),
    staleTime: options.staleTime ?? 5 * 60 * 1000,
  });
}

export function useCompetitorAnalysis<T = any>(domainId: number | null, runId?: number | null, options: QueryControl = {}) {
  return useQuery<T>({
    queryKey: aiResultsKeys.competitorAnalysis(domainId ?? 'none', runId),
    queryFn: () => {
      const path = runId
        ? `/wizard/domain/${domainId}/competitor-analysis?runId=${runId}`
        : `/wizard/domain/${domainId}/competitor-analysis`;
      return apiGet<T>(path);
    },
    enabled: domainId != null && (options.enabled ?? true),
    staleTime: options.staleTime ?? 5 * 60 * 1000,
  });
}

export function useCompetitors<T = any>(domainId: number | null, options: QueryControl = {}) {
  return useQuery<T>({
    queryKey: aiResultsKeys.competitors(domainId ?? 'none'),
    queryFn: () => apiGet<T>(`/wizard/domain/${domainId}/competitors`),
    enabled: domainId != null && (options.enabled ?? true),
    staleTime: options.staleTime ?? 5 * 60 * 1000,
  });
}

/**
 * Tracked prompts for the Prompt Tracking tab — one row per prompt the user
 * marked for weekly re-testing, carrying the latest weekly metrics plus a
 * week-over-week trend. Response shape mirrors /report's topPrompts (so the
 * PromptTable renders it unchanged) with tracking metadata added:
 *   { latestRunAt, nextTestAt, prompts: [{ ...PromptTableRow, isTracked,
 *     lastTestedAt, nextTestAt, weekTrend: { delta, lastVisibility, points } }] }
 */
export function useTrackedPrompts<T = any>(domainId: number | null, options: QueryControl = {}) {
  return useQuery<T>({
    queryKey: aiResultsKeys.trackedPrompts(domainId ?? 'none'),
    queryFn: () => apiGet<T>(`/wizard/domain/${domainId}/tracked-prompts`),
    enabled: domainId != null && (options.enabled ?? true),
    staleTime: options.staleTime ?? 3 * 60 * 1000,
  });
}

/**
 * Per-prompt (or per-keyword) visibility history for the expanded-row chart.
 * Cached so collapsing and re-expanding a row is instant. `trackedView`
 * scopes to weekly runs (Prompt Tracking tab) vs audit runs elsewhere.
 */
export function usePromptHistory<T = any>(
  domainId: number | null,
  rawId: number | null,
  rowType: 'prompt' | 'keyword',
  historyKindOrTrackedView: boolean | 'audit' | 'weekly',
) {
  const kind = typeof historyKindOrTrackedView === 'string'
    ? historyKindOrTrackedView
    : historyKindOrTrackedView ? 'weekly' : 'audit';
  return useQuery<T>({
    queryKey: aiResultsKeys.promptHistory(domainId ?? 'none', rowType, rawId ?? 'none', kind),
    queryFn: () => {
      const kindQuery = kind === 'weekly' ? '?kind=weekly' : '';
      const path = rowType === 'keyword'
        ? `/wizard/domain/${domainId}/keywords/${rawId}/history${kindQuery}`
        : `/wizard/domain/${domainId}/prompts/${rawId}/history${kindQuery}`;
      return apiGet<T>(path);
    },
    enabled: domainId != null && rawId != null,
    staleTime: 3 * 60 * 1000,
  });
}

export function useCampaigns<T = any>(options: QueryControl = {}) {
  return useQuery<T>({
    queryKey: aiResultsKeys.campaigns(),
    queryFn: () => apiGet<T>('/campaigns'),
    enabled: options.enabled ?? true,
    staleTime: options.staleTime ?? 10 * 60 * 1000,
  });
}

export function useGscStatus<T = any>(options: QueryControl = {}) {
  return useQuery<T>({
    queryKey: aiResultsKeys.gscStatus(),
    queryFn: () => apiGet<T>('/gsc/status'),
    enabled: options.enabled ?? true,
    staleTime: options.staleTime ?? 10 * 60 * 1000,
  });
}
