/**
 * Shared React Query hooks for the Sidebar Dashboard.
 *
 * Mirrors `features/ai-results/queries.ts`: every fetch the sidebar tabs
 * make goes through `useQuery` with a stable key here. Side-effect: two
 * tabs that request the same endpoint share one in-flight request and one
 * cache entry. With the 5-min `staleTime` configured globally in App.tsx,
 * switching tabs hits the cache instead of refetching.
 *
 * Only READ endpoints belong here. Write paths (run audit, save settings,
 * publish, etc.) should use `useMutation` at their call sites with explicit
 * `queryClient.invalidateQueries()` to refresh the affected keys.
 */

import { useQuery } from '@tanstack/react-query';

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3002';

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('authToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const dashboardKeys = {
  gscStatus: () => ['dashboard', 'gsc-status'] as const,
  blogAnalyticsAggregate: (days: number) => ['dashboard', 'blog-analytics', 'aggregate', days] as const,
  gscPages: (days: number) => ['dashboard', 'gsc', 'pages', days] as const,
  gscPageQueries: (pageUrl: string | null, days: number) =>
    ['dashboard', 'gsc', 'page-queries', pageUrl ?? 'none', days] as const,
};

interface GscStatus {
  connected?: boolean;
}

export function useGscStatus() {
  return useQuery<GscStatus>({
    queryKey: dashboardKeys.gscStatus(),
    queryFn: () => getJson<GscStatus>('/api/gsc/status'),
    // GSC connection state changes rarely (only on user-initiated connect /
    // disconnect). 10 min staleTime keeps tab swaps free.
    staleTime: 10 * 60 * 1000,
  });
}

// Loose typing — the aggregate response varies by date range and the call
// sites all narrow `any` to whatever they need. Codifying it here would
// duplicate ~50 lines of nested-record types already used elsewhere.
export function useBlogAnalyticsAggregate(days: number = 28) {
  return useQuery<any>({
    queryKey: dashboardKeys.blogAnalyticsAggregate(days),
    queryFn: () => getJson<any>(`/api/blog-analytics/aggregate?days=${days}`),
  });
}
