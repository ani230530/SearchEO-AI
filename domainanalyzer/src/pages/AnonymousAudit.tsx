/**
 * Public route: GET /audit
 *
 * Entry point for the anonymous AI Visibility audit funnel. Renders the
 * `AnonAuditFlow` orchestrator inside a clean centered chrome (back
 * button, brand mark, faint accent lines borrowed from the existing
 * Auth.tsx page so the visual language stays consistent).
 *
 * Auth handling
 * -------------
 * If the user is already authenticated and lands here, we send them
 * straight into the dashboard wizard — running the anonymous funnel for
 * a signed-in user is wasted UX. `loading` state matches Auth.tsx so the
 * page never flashes "Sign up" then redirects.
 *
 * Redirect on success
 * -------------------
 * After signup we read `wizardLink.primaryDomainId` and route to
 *   /newdashboard?tab=ai-visibility
 * with a postAuthRedirect persisted in case the dashboard wants to deep-
 * link further. The Domain shell is already in the user's account at
 * this point (materialized by the backend's maybeLinkWizardSession), so
 * the dashboard wizard can pick it up by host without a fresh round-trip.
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

import { AnonAuditFlow } from '@/features/anon-audit/AnonAuditFlow';
import { useAuth } from '@/contexts/AuthContext';

const AnonymousAudit = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) {
      // Already signed in — drop them into the authenticated wizard.
      navigate('/ai-checker-v2');
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white px-6">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-black border-t-transparent mx-auto" />
          <p className="text-gray-600">Loading…</p>
        </div>
      </div>
    );
  }

  // Suppress flash before the redirect kicks in.
  if (user) return null;

  return (
    <div className="relative min-h-screen bg-white">
      <style>{`
        .audit-header{position:fixed;top:0;left:0;right:0;padding:16px 24px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.72);backdrop-filter:saturate(180%) blur(20px);-webkit-backdrop-filter:saturate(180%) blur(20px);border-bottom:0.5px solid rgba(0,0,0,0.06);z-index:50}
        .audit-brand{font-size:17px;font-weight:400;letter-spacing:-0.022em;color:#1d1d1f;text-decoration:none}
        .audit-back{position:absolute;left:12px;top:50%;transform:translateY(-50%);display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:9999px;color:#1d1d1f;background:transparent;border:1px solid rgba(0,0,0,0.08);transition:all .2s ease}
        .audit-back:hover{background:rgba(0,0,0,0.04)}
        .audit-shell{min-height:100vh;display:flex;align-items:flex-start;justify-content:center;padding:96px 16px 48px}
        .audit-grid{position:fixed;inset:0;pointer-events:none;z-index:0}
        .audit-grid .hline,.audit-grid .vline{position:absolute;background:#e5e7eb;opacity:.5}
        .audit-grid .hline{height:1px;left:0;right:0;transform:scaleX(0);transform-origin:50% 50%;animation:auditX .8s cubic-bezier(.22,.61,.36,1) forwards}
        .audit-grid .hline.h1{top:25%;animation-delay:.15s}
        .audit-grid .hline.h2{top:75%;animation-delay:.32s}
        .audit-grid .vline{width:1px;top:0;bottom:0;transform:scaleY(0);transform-origin:50% 0%;animation:auditY .9s cubic-bezier(.22,.61,.36,1) forwards}
        .audit-grid .vline.v1{left:25%;animation-delay:.5s}
        .audit-grid .vline.v2{left:75%;animation-delay:.66s}
        @keyframes auditX{0%{transform:scaleX(0);opacity:0}60%{opacity:.7}100%{transform:scaleX(1);opacity:.5}}
        @keyframes auditY{0%{transform:scaleY(0);opacity:0}60%{opacity:.7}100%{transform:scaleY(1);opacity:.5}}
      `}</style>

      <header className="audit-header">
        <button
          type="button"
          className="audit-back"
          aria-label="Back to home"
          onClick={() => {
            if (window.history.length > 1) navigate(-1);
            else navigate('/');
          }}
        >
          <ChevronLeft size={18} />
        </button>
        <span className="audit-brand">AI Brand Analyzer</span>
      </header>

      <div className="audit-grid" aria-hidden="true">
        <div className="hline h1" />
        <div className="hline h2" />
        <div className="vline v1" />
        <div className="vline v2" />
      </div>

      <main className="audit-shell relative z-10">
        <div className="w-full max-w-xl">
          <AnonAuditFlow
            onDone={({ snapshot, registration }) => {
              const targetDomainId =
                registration.wizardLink?.primaryDomainId ?? undefined;
              // Drop the user straight into the authenticated wizard with
              // the Domain shell pre-bound. AIChecker.v2's ?domain=N
              // resume logic hydrates url/profile from /wizard/domain/:id/
              // state and lands the user at the right step (Step 1 here
              // since the anon flow only captured the URL — country /
              // state / industry are still collected after signup).
              //
              // Fallback: if for some reason the backend didn't return
              // primaryDomainId (e.g. linkage was a no-op), send them to
              // a blank wizard pre-filled with the host so they don't
              // lose the URL they already typed.
              const dest = targetDomainId
                ? `/ai-checker-v2?domain=${targetDomainId}&fromSignup=1`
                : `/ai-checker-v2?prefillHost=${encodeURIComponent(snapshot.host)}&fromSignup=1`;
              localStorage.setItem('postAuthRedirect', dest);
              navigate(dest);
            }}
          />
        </div>
      </main>
    </div>
  );
};

export default AnonymousAudit;
