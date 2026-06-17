import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { buildDomainSlug, domainMatchesSlug } from "@/lib/domainUtils";
import { apiGet } from "../services/apiClient";
import { resolveDashboardPath } from "@/features/sidebar-dashboard/navigation";

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
        // to populate the latest readable domain slug.
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
          targetDomain = domains.find((d) => domainMatchesSlug(d, storedSlug));
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
          const slug = buildDomainSlug(targetDomain);
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
            onClick={() => navigate(resolveDashboardPath("overview"))}
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
            onClick={() => navigate(resolveDashboardPath("overview"))}
            className="px-4 py-2 rounded-full bg-black text-white hover:bg-black/90 transition"
          >
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-white px-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#2D4059]" />
        <div>
          <p className="text-base font-medium text-slate-900">Loading AI Visibility</p>
          <p className="mt-1 text-sm text-slate-500">Opening your latest AI visibility report...</p>
        </div>
      </div>
    </div>
  );
};

export default AIVisibilityRedirect;
