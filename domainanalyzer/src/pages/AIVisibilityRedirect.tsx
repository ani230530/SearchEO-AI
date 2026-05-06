import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { maskDomainId } from "@/lib/domainUtils";

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

    const stored = localStorage.getItem(AI_VISIBILITY_LAST_DOMAIN_SLUG);
    if (stored) {
      setState({ status: "redirect", slug: stored });
      return;
    }

    if (!token) {
      setState({ status: "empty" });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/dashboard/all`, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });
        if (!resp.ok) throw new Error("Failed to load domains");
        const data = (await resp.json()) as {
          domains?: Array<{ id: number; lastAnalyzed?: string; metrics?: unknown }>;
        };
        const domains = data.domains ?? [];
        if (cancelled) return;
        if (domains.length === 0) {
          setState({ status: "empty" });
          return;
        }
        const mostRecent = [...domains].sort((a, b) => {
          const aTime = a.lastAnalyzed ? new Date(a.lastAnalyzed).getTime() : 0;
          const bTime = b.lastAnalyzed ? new Date(b.lastAnalyzed).getTime() : 0;
          return bTime - aTime;
        })[0];
        const slug = maskDomainId(mostRecent.id);
        setState({ status: "redirect", slug });
      } catch (err) {
        if (cancelled) return;
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "Failed to load domains",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, token]);

  if (state.status === "redirect") {
    return <Navigate to={`/ai-results/${state.slug}`} replace />;
  }

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
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-black border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-600 font-medium">Loading…</p>
      </div>
    </div>
  );
};

export default AIVisibilityRedirect;
