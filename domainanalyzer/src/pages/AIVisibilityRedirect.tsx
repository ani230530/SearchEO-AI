import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { maskDomainId } from "@/lib/domainUtils";
import { apiGet } from "../services/apiClient";

export const AI_VISIBILITY_LAST_DOMAIN_SLUG = "ai-visibility:lastDomainSlug";

type ResolveState =
  | { status: "resolving" }
  | { status: "redirect"; slug: string }
  | { status: "empty" }
  | { status: "error"; message: string };

const AIVisibilityRedirect = () => {
  const { token, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<ResolveState>({ status: "resolving" });

  useEffect(() => {
    if (authLoading) return;

    let cancelled = false;

    const resolveDomain = async () => {
      try {
        // We always fetch the domains list to ensure we have fresh data and
        // to populate the sessionStorage mapping via maskDomainId.
        const data = await apiGet<any>("/wizard/domains");
        const domains = data.domains ?? [];

        if (cancelled) return;

        if (domains.length === 0) {
          setState({ status: "empty" });
          return;
        }

        // Find the most recent domain or use the one from localStorage if it still exists
        const storedSlug = localStorage.getItem(AI_VISIBILITY_LAST_DOMAIN_SLUG);
        let targetDomain = null;

        if (storedSlug) {
          // Try to find the domain that matches the stored slug
          targetDomain = domains.find((d) => maskDomainId(d.id) === storedSlug);
        }

        if (!targetDomain) {
          // Fallback to the most recently analyzed domain
          targetDomain = [...domains].sort((a, b) => {
            const aTime = a.lastAnalyzed ? new Date(a.lastAnalyzed).getTime() : 0;
            const bTime = b.lastAnalyzed ? new Date(b.lastAnalyzed).getTime() : 0;
            return bTime - aTime;
          })[0];
        }

        if (targetDomain) {
          const slug = maskDomainId(targetDomain.id);
          setState({ status: "redirect", slug });
        } else {
          setState({ status: "empty" });
        }
      } catch (err) {
        if (cancelled) return;
        console.error("AIVisibilityRedirect error:", err);
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "Failed to load domains",
        });
      }
    };

    resolveDomain();

    return () => {
      cancelled = true;
    };
  }, [authLoading, token]);

  useEffect(() => {
    if (state.status !== "redirect") return;

    const timer = window.setTimeout(() => {
      navigate(`/ai-results/${state.slug}`, { replace: true });
    }, 220);

    return () => window.clearTimeout(timer);
  }, [navigate, state]);

  if (state.status === "empty") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
        <div className="text-center max-w-md">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No domains analyzed yet</h2>
          <p className="text-gray-600 mb-6">
            Analyze a domain first to see your AI visibility report.
          </p>
          <button
            onClick={() => navigate("/dashboard")}
            className="px-4 py-2 rounded-full bg-black text-white hover:bg-black/90 transition"
          >
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
        <div className="text-center max-w-md">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Something went wrong</h2>
          <p className="text-gray-600 mb-6">{state.message}</p>
          <button
            onClick={() => navigate("/dashboard")}
            className="px-4 py-2 rounded-full bg-black text-white hover:bg-black/90 transition"
          >
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7] text-slate-900">
      <div className="flex min-h-screen">
        <aside className="hidden w-[280px] shrink-0 border-r border-slate-200 bg-white/95 p-4 lg:block">
          <div className="space-y-4">
            <Skeleton className="h-10 w-36 rounded-lg" />
            <div className="space-y-2">
              {Array.from({ length: 7 }).map((_, idx) => (
                <div key={idx} className="flex items-center gap-3 rounded-lg px-2 py-2">
                  <Skeleton className="h-4 w-4 rounded-sm" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ))}
            </div>
          </div>
        </aside>

        <main className="flex-1">
          <div className="border-b border-slate-200 bg-white/90 px-6 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-56" />
              </div>
              <Skeleton className="h-10 w-36 rounded-full" />
            </div>
          </div>

          <div className="p-6">
            <div className="space-y-6">
              <div className="grid gap-4 lg:grid-cols-3">
                <Skeleton className="h-32 rounded-2xl" />
                <Skeleton className="h-32 rounded-2xl" />
                <Skeleton className="h-32 rounded-2xl" />
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-9 w-28 rounded-full" />
                </div>
                <Skeleton className="h-[280px] w-full rounded-xl" />
              </div>

              <div className="grid gap-4 xl:grid-cols-[1.4fr_0.9fr]">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <Skeleton className="mb-4 h-5 w-48" />
                  <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, idx) => (
                      <div key={idx} className="flex items-center gap-3">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-4 flex-1" />
                        <Skeleton className="h-4 w-16" />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <Skeleton className="mb-4 h-5 w-36" />
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, idx) => (
                      <Skeleton key={idx} className="h-16 rounded-xl" />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default AIVisibilityRedirect;
