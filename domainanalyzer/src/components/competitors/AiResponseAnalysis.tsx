import { Loader2, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { AiResponseAnalysisData, PromptGapContext } from './aiResponseAnalysisData';

interface AiResponseAnalysisProps {
  data: AiResponseAnalysisData | null;
  prompt?: PromptGapContext | null;
  loading?: boolean;
  onRetry?: () => void;
  retrying?: boolean;
  retryError?: string | null;
}

const appendUtmSource = (value: string): string => {
  try {
    const url = new URL(value.startsWith('http://') || value.startsWith('https://') ? value : `https://${value}`);
    url.searchParams.set('utm_source', 'searcheo_ai');
    return url.toString();
  } catch {
    return value;
  }
};

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'blue' | 'green' | 'red' | 'slate';
}) {
  const toneClasses = {
    blue: 'bg-[#EFF5FF] text-[#2D5B93]',
    green: 'bg-[#E8FBE8] text-[#227A3F]',
    red: 'bg-[#FFF0F0] text-[#CC2E2E]',
    slate: 'bg-slate-50 text-slate-700',
  }[tone];

  return (
    <div className={cn('rounded-lg px-3 py-3', toneClasses)}>
      <p className="text-[11px] font-medium opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-semibold leading-none">{value}</p>
    </div>
  );
}

function StatusBadge({ status, tone }: { status: string; tone: 'green' | 'yellow' | 'red' }) {
  const toneClasses = {
    green: 'border-emerald-200 bg-emerald-50 text-emerald-600',
    yellow: 'border-amber-200 bg-amber-50 text-amber-600',
    red: 'border-rose-200 bg-rose-50 text-rose-600',
  }[tone];

  return <Badge className={cn('rounded-full px-2.5 py-0.5 text-[10px] font-medium shadow-none', toneClasses)}>{status}</Badge>;
}

function RankingRow({
  item,
}: {
  item: AiResponseAnalysisData['rankings'][number];
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2.2fr)_72px_54px] items-center gap-3 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-md border border-slate-200 bg-white">
          <img src={item.logo} alt="" className="h-6 w-6 object-contain" />
        </span>
        <a
          href={appendUtmSource(item.domain)}
          target="_blank"
          rel="noreferrer"
          className="truncate text-sm font-medium text-slate-700 transition hover:text-[#2D5B93] hover:underline"
        >
          {item.domain}
        </a>
      </div>

      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 rounded-full bg-slate-200">
          <div className="h-1.5 rounded-full bg-[#3B82F6]" style={{ width: `${item.barWidth}%` }} />
        </div>
        <span className="w-16 shrink-0 text-right text-sm font-medium text-[#5171A7]">{item.score}</span>
      </div>

      <div className="text-right text-sm font-medium text-slate-600">{item.score}</div>
      <div className="flex justify-end">
        <StatusBadge status={item.status} tone={item.statusTone} />
      </div>
    </div>
  );
}

function PerformanceRow({ item }: { item: AiResponseAnalysisData['performance'][number] }) {
  const statusClass =
    item.status === 'failed'
      ? 'border-rose-200 bg-rose-50 text-rose-700'
      : item.mentioned
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : 'border-slate-200 bg-slate-50 text-slate-600';
  const statusLabel = item.status === 'failed' ? 'Failed' : item.mentioned ? 'Mentioned' : 'Not mentioned';

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate text-[14px] font-medium text-[#2D4059]">{item.name}</span>
          <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold', statusClass)}>
            {statusLabel}
          </span>
          {item.rankPosition ? (
            <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
              Rank #{item.rankPosition}
            </span>
          ) : null}
        </div>
        <span className="shrink-0 text-[14px] font-medium text-[#2D4059]">{item.value}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-200">
        <div className="h-2 rounded-full bg-[#6D8ED8]" style={{ width: `${item.barWidth}%` }} />
      </div>
      {item.competitors.length > 0 ? (
        <p className="text-[11px] text-slate-500">
          Competitors detected: {item.competitors.slice(0, 4).join(', ')}
        </p>
      ) : null}
    </div>
  );
}

function ModelResponseCard({ item }: { item: AiResponseAnalysisData['performance'][number] }) {
  const excerpt = item.status === 'failed'
    ? item.errorMessage ?? 'Provider failed before returning a usable answer.'
    : item.response.trim() || 'No response text was stored for this model.';
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800">{item.name}</p>
        <p className="text-xs font-medium text-slate-500">{item.value}</p>
      </div>
      <p className="mt-2 line-clamp-4 text-xs leading-5 text-slate-600">{excerpt}</p>
    </div>
  );
}

function PromptInsightsCard({ insights }: { insights: string[] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
      <h3 className="text-base font-medium text-slate-800">Key Insights - Prompts Tracking</h3>
      <ul className="mt-3 space-y-3 text-sm leading-6 text-slate-700">
        {insights.map((insight) => (
          <li key={insight} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#3B82F6]" />
            <span>{insight}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AnalysisHeader({
  title,
  subtitle,
  onRetry,
  retrying,
}: {
  title: string;
  subtitle: string;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-blue-200 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {retrying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {retrying ? 'Retrying' : 'Retry'}
        </button>
      ) : null}
    </div>
  );
}

function PromptContextLine({ prompt, fallback }: { prompt?: PromptGapContext | null; fallback: string }) {
  const text = prompt?.title ?? fallback;
  return (
    <p className="text-sm text-slate-600">
      Prompt : <span className="italic text-slate-900">{text}</span>
    </p>
  );
}

export function AiResponseAnalysis({ data, prompt, loading, onRetry, retrying = false, retryError }: AiResponseAnalysisProps) {
  if (loading || !data) {
    return (
      <div className="flex min-h-full flex-col px-4 py-4 sm:px-5">
        <AnalysisHeader
          title={loading ? 'Loading AI Response Analysis…' : 'AI Response Analysis'}
          subtitle={loading ? 'Aggregating mentions, sentiment, and ranking across this prompt.' : 'No response data available for this opportunity yet.'}
          onRetry={onRetry}
          retrying={retrying}
        />
        {prompt ? (
          <div className="mt-3">
            <PromptContextLine prompt={prompt} fallback="" />
          </div>
        ) : null}
        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 rounded-lg bg-slate-100" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col px-4 py-4 sm:px-5">
      <AnalysisHeader title={data.title} subtitle={data.subtitle} onRetry={data.sourcePromptId ? onRetry : undefined} retrying={retrying} />
      {retryError ? (
        <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
          {retryError}
        </p>
      ) : null}

      <div className="mt-3">
        <PromptContextLine prompt={prompt} fallback={data.promptLabel} />
        <p className="mt-1 text-xs text-slate-500">
          {data.successfulResponses} successful of {data.attemptedResponses} attempted model responses analyzed.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {data.metrics.map((metric) => (
          <StatCard key={metric.label} label={metric.label} value={metric.value} tone={metric.tone} />
        ))}
      </div>

      <section className="mt-5 rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
        <h3 className="text-base font-medium text-slate-800">Competitors Detected In Responses</h3>
        {data.rankings.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm leading-6 text-slate-500">
            {data.emptyState ?? 'No competitor mentions were detected in the successful model responses for this prompt.'}
          </p>
        ) : (
          <div className="mt-2 divide-y divide-slate-100">
            {data.rankings.map((item) => (
              <div key={item.domain} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.8fr)_56px] items-center gap-3 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-md border border-slate-200 bg-white">
                  <img src={item.logo} alt="" className="h-6 w-6 object-contain" />
                </span>
                <a
                  href={appendUtmSource(item.domain)}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-sm font-medium text-slate-700 transition hover:text-[#2D5B93] hover:underline"
                >
                  {item.domain}
                </a>
              </div>

              <div className="flex items-center gap-3">
                <div className="h-1.5 flex-1 rounded-full bg-slate-200">
                  <div className="h-1.5 rounded-full bg-[#3B82F6]" style={{ width: `${item.barWidth}%` }} />
                </div>
                <span className="w-14 shrink-0 text-right text-sm font-medium text-[#5171A7]">{item.score}</span>
              </div>

              <div className="flex justify-end">
                <StatusBadge status={item.status} tone={item.statusTone} />
              </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-5 rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
        <h3 className="text-base font-medium text-slate-800">Model-Level Brand Visibility</h3>
        {data.performance.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm leading-6 text-slate-500">
            No model-level responses are stored for this prompt yet.
          </p>
        ) : (
          <div className="mt-4 space-y-6">
            {data.performance.map((item) => (
              <PerformanceRow key={item.name} item={item} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-5 rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
        <h3 className="text-base font-medium text-slate-800">Model Responses</h3>
        {data.performance.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm leading-6 text-slate-500">
            Use Retry to collect fresh model responses for the linked prompt.
          </p>
        ) : (
          <div className="mt-3 grid gap-3">
            {data.performance.map((item) => (
              <ModelResponseCard key={`${item.name}-response`} item={item} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-5">
        <PromptInsightsCard insights={data.insights} />
      </section>

    </div>
  );
}

export default AiResponseAnalysis;
