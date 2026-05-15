import { ArrowRight, Calendar, Sparkles, Users, BadgeCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  competitorPriorityStyles,
  type CompetitorDetailData,
  type CompetitorInsightPriority,
} from './competitorDetailData';

interface CompetitorDetailProps {
  competitor: CompetitorDetailData;
}

function DetailHeader({ competitor }: { competitor: CompetitorDetailData }) {
  return (
    <div className="border-b border-slate-200 px-5 pb-4 pt-6 sm:px-6">
      <div className="flex items-start gap-4 pr-10">
        <span
          className="grid h-12 w-12 shrink-0 place-items-center rounded-xl"
          style={{ backgroundColor: competitor.logoBackground }}
        >
          <img src={competitor.logo} alt="" className="h-8 w-8 object-contain" />
        </span>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold leading-tight text-slate-900">{competitor.name}</h2>
            <Badge className="border-rose-200 bg-rose-50 text-[11px] font-medium text-rose-600 hover:bg-rose-50">
              {competitor.badgeLabel}
            </Badge>
          </div>
          <p className="mt-2 text-sm text-slate-500">{competitor.subtitle}</p>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[#EEF4FF] px-4 py-3">
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold leading-none text-slate-900">{value}</p>
    </div>
  );
}

function PerformanceCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-medium leading-5 text-slate-900">{value}</p>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: CompetitorInsightPriority }) {
  return (
    <Badge className={cn('rounded-full px-2.5 py-0.5 text-[10px] font-medium shadow-none', competitorPriorityStyles[priority])}>
      {priority.charAt(0).toUpperCase() + priority.slice(1)}
    </Badge>
  );
}

function TableCategoryCell({
  category,
  rowSpan,
}: {
  category: CompetitorDetailData['insights'][number]['category'];
  rowSpan: number;
}) {
  const categoryStyles: Record<CompetitorDetailData['insights'][number]['category'], string> = {
    Strength: 'bg-emerald-100 text-emerald-700',
    Weakness: 'bg-rose-100 text-rose-700',
    'Competitive Edge': 'bg-blue-100 text-blue-700',
  };

  return (
    <td rowSpan={rowSpan} className="min-w-[120px] border-r border-slate-200 px-4 py-4 align-middle">
      <span className={cn('inline-flex rounded-full px-3 py-1 text-xs font-semibold', categoryStyles[category])}>
        {category}
      </span>
    </td>
  );
}

function InsightsTable({ competitor }: { competitor: CompetitorDetailData }) {
  const rows = competitor.insights;

  const getRowSpan = (index: number) => {
    const category = rows[index]?.category;
    let count = 1;
    for (let nextIndex = index + 1; nextIndex < rows.length; nextIndex += 1) {
      if (rows[nextIndex].category !== category) break;
      count += 1;
    }
    return count;
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-[760px] w-full border-collapse text-left">
        <thead className="bg-slate-50">
          <tr className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <th className="px-4 py-3">Category</th>
            <th className="px-4 py-3">Insights</th>
            <th className="px-4 py-3">AI Prompt Source</th>
            <th className="px-4 py-3">Priority</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {rows.map((row, index) => {
            const isFirstInGroup = index === 0 || rows[index - 1].category !== row.category;

            return (
              <tr key={`${row.category}-${row.insight}-${index}`} className="align-top">
                {isFirstInGroup ? <TableCategoryCell category={row.category} rowSpan={getRowSpan(index)} /> : null}
                <td className="px-4 py-4 text-sm font-medium text-slate-700">{row.insight}</td>
                <td className="px-4 py-4 text-sm leading-5 text-slate-500">{row.aiPromptSource}</td>
                <td className="px-4 py-4">
                  <PriorityBadge priority={row.priority} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StrategyCallCard({ competitor }: { competitor: CompetitorDetailData }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#355DAA] via-[#416FBF] to-[#5C86D8] px-5 py-5 text-white shadow-[0_18px_40px_rgba(41,73,137,0.25)]">
      <div className="absolute right-0 top-0 h-28 w-28 translate-x-8 -translate-y-8 rounded-full bg-white/10" />
      <div className="absolute bottom-0 right-5 h-20 w-20 rounded-full bg-cyan-300/20 blur-xl" />

      <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-end">
        <div className="min-w-0">
          <p className="text-lg font-semibold">{competitor.cta.title}</p>
          <p className="mt-2 max-w-xl text-sm leading-6 text-white/85">{competitor.cta.description}</p>

          <div className="mt-4 flex flex-wrap gap-2">
            {['30 min session', 'Expert team', 'Custom action plan'].map((item) => (
              <span
                key={item}
                className="inline-flex items-center gap-1 rounded-full border border-white/25 bg-white/10 px-2.5 py-1 text-[10px] font-medium text-white"
              >
                <BadgeCheck className="h-3.5 w-3.5" />
                {item}
              </span>
            ))}
          </div>

          <button
            type="button"
            className="mt-5 inline-flex h-10 items-center gap-2 rounded-md bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-100"
          >
            {competitor.cta.buttonLabel}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        <div className="relative flex justify-center lg:justify-end">
          <div className="grid h-44 w-44 place-items-center rounded-full bg-white/10 backdrop-blur-sm">
            <div className="grid h-32 w-32 place-items-center rounded-full bg-white/15">
              <Users className="h-12 w-12 text-white/90" />
            </div>
          </div>
          <div className="absolute bottom-4 right-8 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-lg">
            <span className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-blue-600" />
              15 min intro call
            </span>
          </div>
          <div className="absolute left-6 top-6 rounded-xl bg-white/15 px-3 py-2 text-xs font-semibold text-white">
            <Sparkles className="mr-1 inline h-3.5 w-3.5" />
            Strategy review
          </div>
        </div>
      </div>
    </div>
  );
}

export function CompetitorDetail({ competitor }: CompetitorDetailProps) {
  const hasInsights = competitor.insights.length > 0;
  return (
    <div className="flex min-h-full flex-col">
      <DetailHeader competitor={competitor} />

      <div className="space-y-6 px-5 py-5 sm:px-6">
        <section>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {competitor.stats.map((stat) => (
              <StatCard key={stat.label} label={stat.label} value={stat.value} />
            ))}
          </div>
        </section>

        <section>
          <h3 className="text-base font-semibold text-slate-900">Performance Overview</h3>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            {competitor.performanceOverview.map((item) => (
              <PerformanceCard key={item.label} label={item.label} value={item.value} />
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-base font-semibold text-slate-900">Competitive Insights</h3>
          {hasInsights ? (
            <InsightsTable competitor={competitor} />
          ) : (
            <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              No insights yet — re-run the audit to generate strength / weakness analysis for this competitor.
            </p>
          )}
        </section>

        <section>
          <StrategyCallCard competitor={competitor} />
        </section>
      </div>
    </div>
  );
}

export default CompetitorDetail;
