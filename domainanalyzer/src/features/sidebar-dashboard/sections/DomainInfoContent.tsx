/**
 * DomainInfoContent — what the "Domain Info" sidebar tab actually renders.
 *
 * Previously the page showed nothing because SidebarDashboard wired
 * `resultsContent: null` into <CompanySection/>. This component fills that
 * slot with the real content: domain card + keywords list with proper
 * empty/error states and a Retry button (handles the case where the
 * /api/user/company-domain fetch returned a domain but zero keywords —
 * common after the foundational rewrite, since the legacy Keyword table
 * was dropped and the user has to re-run the wizard to repopulate).
 */
import { ExternalLink, Globe, Loader2, RefreshCw, AlertCircle, KeyRound, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

export type DomainInfoKeyword = {
  id: number;
  term: string;
  intent?: string | null;
  volume?: number | null;
  difficulty?: string | null;
  cpc?: number | null;
};

export type DomainInfoContentProps = {
  companyDomain: string;
  domainContext: string;
  domainId: number | null;
  keywords: DomainInfoKeyword[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
};

export function DomainInfoContent({
  companyDomain,
  domainContext,
  domainId,
  keywords,
  loading,
  error,
  onRetry,
}: DomainInfoContentProps) {
  const navigate = useNavigate();

  const host = companyDomain.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
  const visitUrl = companyDomain.startsWith('http') ? companyDomain : `https://${companyDomain}`;

  return (
    <div className="w-full max-w-7xl space-y-6 px-4 py-4 sm:px-6">
      {/* Domain card */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 shrink-0 text-slate-500" />
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Company Domain
              </p>
            </div>
            <a
              href={visitUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1.5 text-lg font-semibold text-slate-900 hover:text-blue-600"
            >
              {host}
              <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
            </a>
            {domainContext ? (
              <p className="mt-2 text-sm leading-[1.55] text-slate-600">{domainContext}</p>
            ) : (
              <p className="mt-2 text-sm italic text-slate-400">
                No company context summary yet.
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              disabled={loading}
              className="gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </section>

      {/* Keywords */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-slate-500" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Tracked Keywords
            </h2>
            {keywords.length > 0 ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                {keywords.length}
              </span>
            ) : null}
          </div>
        </div>

        <div className="mt-4">
          {loading ? (
            <KeywordsLoading />
          ) : error ? (
            <KeywordsError message={error} onRetry={onRetry} />
          ) : keywords.length === 0 ? (
            <KeywordsEmpty
              onRetry={onRetry}
              onRunWizard={() => {
                if (!domainId) {
                  // Fall back to the generic wizard entry; it'll resolve the
                  // company domain itself when no domainId is known.
                  navigate('/ai-checker-v2');
                  return;
                }
                navigate(`/ai-checker-v2?domainId=${domainId}`);
              }}
            />
          ) : (
            <KeywordsTable keywords={keywords} />
          )}
        </div>
      </section>
    </div>
  );
}

const KeywordsLoading = () => (
  <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
    <Loader2 className="h-4 w-4 animate-spin" />
    Loading keywords…
  </div>
);

const KeywordsError = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-rose-200 bg-rose-50/40 px-6 py-8 text-center">
    <AlertCircle className="h-6 w-6 text-rose-500" />
    <p className="text-sm text-slate-700">{message}</p>
    <Button variant="outline" size="sm" onClick={onRetry} className="gap-1.5">
      <RefreshCw className="h-3.5 w-3.5" />
      Retry
    </Button>
  </div>
);

const KeywordsEmpty = ({
  onRetry,
  onRunWizard,
}: {
  onRetry: () => void;
  onRunWizard: () => void;
}) => (
  <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-slate-300 bg-slate-50/60 px-6 py-10 text-center">
    <KeyRound className="h-6 w-6 text-slate-400" />
    <div className="space-y-1">
      <p className="text-sm font-medium text-slate-700">No keywords tracked yet</p>
      <p className="text-xs text-slate-500">
        Run the AI visibility wizard to discover and track keywords for this domain.
      </p>
    </div>
    <div className="flex flex-wrap items-center justify-center gap-2">
      <Button variant="outline" size="sm" onClick={onRetry} className="gap-1.5">
        <RefreshCw className="h-3.5 w-3.5" />
        Refresh
      </Button>
      <Button size="sm" onClick={onRunWizard} className="gap-1.5">
        Run Wizard
        <ArrowRight className="h-3.5 w-3.5" />
      </Button>
    </div>
  </div>
);

const KeywordsTable = ({ keywords }: { keywords: DomainInfoKeyword[] }) => (
  <div className="overflow-hidden rounded-md border border-slate-200">
    <table className="w-full text-sm">
      <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        <tr>
          <th className="px-3 py-2">Keyword</th>
          <th className="px-3 py-2">Intent</th>
          <th className="px-3 py-2 text-right">Volume</th>
          <th className="px-3 py-2 text-right">Difficulty</th>
          <th className="px-3 py-2 text-right">CPC</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {keywords.map((k) => (
          <tr key={k.id} className="hover:bg-slate-50">
            <td className="px-3 py-2 text-slate-800">{k.term}</td>
            <td className="px-3 py-2 text-slate-600">{k.intent ?? '—'}</td>
            <td className="px-3 py-2 text-right tabular-nums text-slate-600">
              {typeof k.volume === 'number' ? k.volume.toLocaleString() : '—'}
            </td>
            <td className="px-3 py-2 text-right text-slate-600">{k.difficulty ?? '—'}</td>
            <td className="px-3 py-2 text-right tabular-nums text-slate-600">
              {typeof k.cpc === 'number' ? `$${k.cpc.toFixed(2)}` : '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
