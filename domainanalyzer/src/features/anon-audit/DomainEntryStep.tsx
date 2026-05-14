/**
 * Step 1 of the anonymous audit funnel.
 *
 * UX: large primary card, single domain input, "Run audit" CTA. On submit
 * we POST /api/wizard/validate; on a valid+reachable response, the
 * orchestrator transitions to the preview step. The wizard cookie is
 * minted server-side as a side effect of this call.
 *
 * Design system: card uses dashboard tokens (rounded-3xl, border-gray-100,
 * bg-white, p-6 sm:p-8). Primary button is bg-[#2D4059] rounded-md h-12.
 * Headings text-2xl font-light tracking-tight. Body text-sm font-light
 * text-gray-600. Error badge uses the red-50/700/100 pill style.
 */

import { useState, type FormEvent } from 'react';
import { ArrowRight, Globe, Loader2, AlertCircle } from 'lucide-react';

import { AnonAuditApiError, validateDomain } from './api';
import type { DomainSnapshot } from './types';

interface DomainEntryStepProps {
  /** Fired after the host validates and is reachable. The orchestrator
   *  advances to the preview step with this snapshot. */
  onValidated: (snapshot: DomainSnapshot) => void;
}

export function DomainEntryStep({ onValidated }: DomainEntryStepProps) {
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = url.trim();
    if (!trimmed) {
      setError('Enter your website URL to start the audit.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await validateDomain(trimmed);
      if (!result.ok) {
        setError(result.reason || 'That URL did not look valid.');
        setSubmitting(false);
        return;
      }
      if (!result.reachable) {
        setError(
          result.reason ||
            "We couldn't reach that site. Double-check the URL and try again."
        );
        setSubmitting(false);
        return;
      }
      // We rely on canonicalUrl / normalizedUrl. Backend populates both.
      const canonicalUrl = result.canonicalUrl ?? result.normalizedUrl ?? trimmed;
      const host = result.host ?? new URL(canonicalUrl).host;
      onValidated({
        canonicalUrl,
        host,
        reachable: true,
        finalUrl: result.finalUrl,
      });
    } catch (err) {
      const message =
        err instanceof AnonAuditApiError
          ? err.message
          : 'Something went wrong starting your audit. Try again in a moment.';
      setError(message);
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl p-6 sm:p-8 lg:p-10 border border-gray-100 shadow-sm">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center">
          <Globe className="h-6 w-6 text-gray-500" />
        </div>
        <div>
          <h2 className="text-2xl font-light text-black tracking-tight">
            Audit your site
          </h2>
          <p className="text-sm font-light text-gray-600">
            See how AI assistants talk about your brand.
          </p>
        </div>
      </div>

      <p className="text-sm font-light text-neutral-500 max-w-xl mb-8">
        We&apos;ll check how visible your site is across ChatGPT, Claude, and
        Gemini for the questions your customers actually ask. No card, no
        signup needed to start.
      </p>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="relative">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none">
            <Globe className="h-4 w-4" />
          </div>
          <input
            type="text"
            inputMode="url"
            autoComplete="url"
            autoFocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="yourdomain.com"
            disabled={submitting}
            className="w-full h-14 pl-11 pr-4 text-base rounded-md border border-neutral-200 bg-neutral-50 focus:bg-white focus:border-black/20 focus:ring-4 focus:ring-black/5 outline-none transition-all placeholder:text-neutral-400 font-light disabled:opacity-60"
          />
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-red-100 bg-red-50 px-4 py-3 text-sm font-light text-red-700">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="h-12 px-6 w-full inline-flex items-center justify-center gap-2 rounded-md bg-[#2D4059] text-md font-medium text-white shadow-md hover:shadow-lg active:scale-[0.99] transition disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking your site…
            </>
          ) : (
            <>
              Start free audit
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>

        <p className="text-xs font-light text-gray-500 text-center pt-1">
          One audit free. We&apos;ll ask you to sign up before showing the full
          report.
        </p>
      </form>
    </div>
  );
}
