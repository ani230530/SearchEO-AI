import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { AiResponseAnalysisData, PromptGapContext } from './aiResponseAnalysisData';

interface AiResponseAnalysisProps {
  data: AiResponseAnalysisData | null;
  prompt?: PromptGapContext | null;
  loading?: boolean;
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
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-4">
        <span className="text-[14px] font-medium text-[#2D4059]">{item.name}</span>
        <span className="text-[14px] font-medium text-[#2D4059]">{item.value}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-200">
        <div className="h-2 rounded-full bg-[#6D8ED8]" style={{ width: `${item.barWidth}%` }} />
      </div>
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
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>
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

export function AiResponseAnalysis({ data, prompt, loading }: AiResponseAnalysisProps) {
  if (loading || !data) {
    return (
      <div className="flex min-h-full flex-col px-4 py-4 sm:px-5">
        <AnalysisHeader
          title={loading ? 'Loading AI Response Analysis…' : 'AI Response Analysis'}
          subtitle={loading ? 'Aggregating mentions, sentiment, and ranking across this prompt.' : 'No response data available for this opportunity yet.'}
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
      <AnalysisHeader title={data.title} subtitle={data.subtitle} />

      <div className="mt-3">
        <PromptContextLine prompt={prompt} fallback={data.promptLabel} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {data.metrics.map((metric) => (
          <StatCard key={metric.label} label={metric.label} value={metric.value} tone={metric.tone} />
        ))}
      </div>

      <section className="mt-5 rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
        <h3 className="text-base font-medium text-slate-800">Competitive Ranking - Prompts tracking</h3>
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
      </section>

      <section className="mt-5 rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
        <h3 className="text-base font-medium text-slate-800">Performance Metrics</h3>
        <div className="mt-4 space-y-6">
          {data.performance.map((item) => (
            <PerformanceRow key={item.name} item={item} />
          ))}
        </div>
      </section>

      <section className="mt-5">
        <PromptInsightsCard insights={data.insights} />
      </section>

    </div>
  );
}

export default AiResponseAnalysis;
