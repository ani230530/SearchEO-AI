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
  report: (domainId: number | string, runId?: number | null) =>
    ['ai-results', 'report', domainId, runId ?? 'latest'] as const,
  trends: (domainId: number | string) =>
    ['ai-results', 'trends', domainId] as const,
  runs: (domainId: number | string) =>
    ['ai-results', 'runs', domainId] as const,
  competitorAnalysis: (domainId: number | string, runId?: number | null) =>
    ['ai-results', 'competitor-analysis', domainId, runId ?? 'latest'] as const,
  competitors: (domainId: number | string) =>
    ['ai-results', 'competitors', domainId] as const,
  campaigns: () => ['ai-results', 'campaigns'] as const,
  gscStatus: () => ['ai-results', 'gsc-status'] as const,
};

// ── Shared types ───────────────────────────────────────────────────────────

export interface DomainRow {
  id: number;
  url: string;
  createdAt: string;
  lastAnalyzed?: string | Date | null;
  host?: string;
  companyName?: string | null;
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

export function useReport<T = any>(domainId: number | null, runId?: number | null) {
  return useQuery<T>({
    queryKey: aiResultsKeys.report(domainId ?? 'none', runId),
    queryFn: () => {
      const path = runId
        ? `/wizard/domain/${domainId}/report?runId=${runId}`
        : `/wizard/domain/${domainId}/report`;
      return apiGet<T>(path);
    },
    enabled: domainId != null,
  });
}

export function useTrends<T = any>(domainId: number | null) {
  return useQuery<T>({
    queryKey: aiResultsKeys.trends(domainId ?? 'none'),
    queryFn: () => apiGet<T>(`/wizard/domain/${domainId}/trends`),
    enabled: domainId != null,
  });
}

export function useRuns<T = any>(domainId: number | null) {
  return useQuery<T>({
    queryKey: aiResultsKeys.runs(domainId ?? 'none'),
    queryFn: () => apiGet<T>(`/wizard/domain/${domainId}/runs`),
    enabled: domainId != null,
  });
}

export function useCompetitorAnalysis<T = any>(domainId: number | null, runId?: number | null) {
  return useQuery<T>({
    queryKey: aiResultsKeys.competitorAnalysis(domainId ?? 'none', runId),
    queryFn: () => {
      const path = runId
        ? `/wizard/domain/${domainId}/competitor-analysis?runId=${runId}`
        : `/wizard/domain/${domainId}/competitor-analysis`;
      return apiGet<T>(path);
    },
    enabled: domainId != null,
  });
}

export function useCompetitors<T = any>(domainId: number | null) {
  return useQuery<T>({
    queryKey: aiResultsKeys.competitors(domainId ?? 'none'),
    queryFn: () => apiGet<T>(`/wizard/domain/${domainId}/competitors`),
    enabled: domainId != null,
  });
}

export function useCampaigns<T = any>() {
  return useQuery<T>({
    queryKey: aiResultsKeys.campaigns(),
    queryFn: () => apiGet<T>('/campaigns'),
    staleTime: 10 * 60 * 1000,
  });
}

export function useGscStatus<T = any>() {
  return useQuery<T>({
    queryKey: aiResultsKeys.gscStatus(),
    queryFn: () => apiGet<T>('/gsc/status'),
    staleTime: 10 * 60 * 1000,
  });
}
