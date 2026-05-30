/**
 * AIResultsShell — parent route layout for every AI Checker page.
 *
 * Previously each AI Checker page (Report Preview, Track Prompts, Track
 * Keywords, Competitors, Prompt Gaps) rendered its own <AIResultsLayout>.
 * React Router unmounted the previous page tree on every navigation —
 * sidebar included — so the user saw a full flash on every tab switch.
 *
 * This shell sits at a parent route. The sidebar / header / domain
 * dropdown live HERE, mounted once. Child pages render through <Outlet />,
 * read domain context via `useShellContext()`, and stay focused on their
 * own content.
 *
 * Data ownership:
 *   • /wizard/domains is fetched here (once per session, then cached) and
 *     passed to children via outlet context. No more duplicate fetches
 *     from every page.
 *   • The "current domain" is resolved from the URL path/param and exposed
 *     to children. The last-visited domain is persisted to localStorage
 *     here, not in every page.
 */

import { Suspense, useEffect, useMemo } from 'react';
import { Outlet, useLocation, useOutletContext, useParams } from 'react-router-dom';
import { AIResultsLayout } from './components/AIResultsLayout';
import { useDomains, type DomainRow } from './queries';
import { maskDomainId, unmaskDomainId } from '@/lib/domainUtils';

export type ShellActiveItem = 'ai-results' | 'competitors' | 'prompts';

export interface ShellContext {
  /** All domains for the dropdown. May be empty during the very first load. */
  allDomains: DomainRow[];
  /** Resolved current domain — driven by URL param + last-visited fallback. */
  currentDomain: DomainRow | null;
  /** Masked id for the URL — exposed so pages can reuse it in nav links. */
  maskedDomainId: string | undefined;
  /** True while the domains list is still loading on first paint. */
  domainsLoading: boolean;
}

interface ShellProps {
  activeItem: ShellActiveItem;
  title: string;
}

/**
 * Sort by most-recent activity. Used as the fallback when neither URL nor
 * localStorage points at a specific domain.
 */
function byLastAnalyzed(a: DomainRow, b: DomainRow): number {
  const aT = a.lastAnalyzed ? new Date(a.lastAnalyzed).getTime() : 0;
  const bT = b.lastAnalyzed ? new Date(b.lastAnalyzed).getTime() : 0;
  return bT - aT;
}

export function AIResultsShell({ activeItem, title }: ShellProps) {
  const params = useParams();
  const location = useLocation();

  // Two ways the URL can carry the masked domain id:
  //   1. /:domain in the path (Report Preview, Track Prompts, Track Keywords)
  //   2. ?domain= in the query string (Competitors, Prompt Gaps — no path param)
  // Fall through to the last-visited slug from localStorage so the user
  // doesn't lose their working domain when navigating to a tab without one.
  const urlMaskedId = useMemo(() => {
    if (params.domain) return params.domain;
    const q = new URLSearchParams(location.search).get('domain');
    if (q) return q;
    return localStorage.getItem('ai-visibility:lastDomainSlug') ?? undefined;
  }, [params.domain, location.search]);

  const { data: domainsResp, isLoading: domainsLoading } = useDomains();
  const allDomains = domainsResp?.domains ?? [];

  const currentDomain = useMemo<DomainRow | null>(() => {
    if (allDomains.length === 0) return null;
    if (urlMaskedId) {
      // Try direct id match first (cheap), then mask comparison (handles
      // hash strings that don't reverse cleanly).
      const realId = unmaskDomainId(urlMaskedId);
      if (realId != null) {
        const direct = allDomains.find((d) => d.id === realId);
        if (direct) return direct;
      }
      const masked = allDomains.find((d) => maskDomainId(d.id) === urlMaskedId);
      if (masked) return masked;
    }
    return [...allDomains].sort(byLastAnalyzed)[0] ?? null;
  }, [allDomains, urlMaskedId]);

  // Persist the resolved domain so a tab navigation that lands on a route
  // without an explicit :domain param (e.g. /airesults-competitors-preview)
  // can still pick up where the user left off.
  useEffect(() => {
    if (currentDomain) {
      localStorage.setItem('ai-visibility:lastDomainSlug', maskDomainId(currentDomain.id));
    }
  }, [currentDomain?.id]);

  const ctx: ShellContext = {
    allDomains,
    currentDomain,
    maskedDomainId: currentDomain ? maskDomainId(currentDomain.id) : urlMaskedId,
    domainsLoading,
  };

  return (
    <AIResultsLayout
      activeItem={activeItem}
      allDomains={allDomains}
      currentDomainId={currentDomain?.id}
      currentDomainUrl={currentDomain?.url ?? null}
      currentDomainHost={currentDomain?.host ?? null}
      currentDomainName={currentDomain?.companyName ?? currentDomain?.host ?? null}
      maskedDomainId={ctx.maskedDomainId}
      title={title}
    >
      {/* Inner Suspense — children are lazy-loaded in App.tsx. Keeping the
          boundary INSIDE the layout means only the outlet content shows a
          spinner while a tab's chunk downloads; the sidebar + header stay
          mounted, preserving the "tab switch is instant" UX promise. */}
      <Suspense fallback={<OutletFallback />}>
        <Outlet context={ctx} />
      </Suspense>
    </AIResultsLayout>
  );
}

function OutletFallback() {
  return (
    <div className="flex h-[60vh] w-full items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-[#2D4059]" aria-label="Loading tab…" />
    </div>
  );
}

/** Children read shared domain state from the outlet context. */
export function useShellContext(): ShellContext {
  return useOutletContext<ShellContext>();
}
