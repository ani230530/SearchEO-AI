import { ArrowRight, Calendar, Sparkles, Users } from 'lucide-react';
import type { ReactNode } from 'react';
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

function SessionIcon() {
  return (
    <svg viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
      <path
        d="M5 0C7.7615 0 10 2.2385 10 5C10 7.7615 7.7615 10 5 10C2.2385 10 0 7.7615 0 5C0 2.2385 2.2385 0 5 0ZM5 2C4.86739 2 4.74021 2.05268 4.64645 2.14645C4.55268 2.24021 4.5 2.36739 4.5 2.5V5C4.50003 5.1326 4.55273 5.25975 4.6465 5.3535L6.1465 6.8535C6.2408 6.94458 6.3671 6.99498 6.4982 6.99384C6.6293 6.9927 6.75471 6.94011 6.84741 6.84741C6.94011 6.75471 6.9927 6.6293 6.99384 6.4982C6.99498 6.3671 6.94458 6.2408 6.8535 6.1465L5.5 4.793V2.5C5.5 2.36739 5.44732 2.24021 5.35355 2.14645C5.25979 2.05268 5.13261 2 5 2Z"
        fill="currentColor"
      />
    </svg>
  );
}

function TeamIcon() {
  return (
    <svg viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
      <path
        d="M5 4C5.53043 4 6.03914 3.78929 6.41421 3.41421C6.78929 3.03914 7 2.53043 7 2C7 1.46957 6.78929 0.960859 6.41421 0.585786C6.03914 0.210714 5.53043 0 5 0C4.46957 0 3.96086 0.210714 3.58579 0.585786C3.21071 0.960859 3 1.46957 3 2C3 2.53043 3.21071 3.03914 3.58579 3.41421C3.96086 3.78929 4.46957 4 5 4ZM1.75 5.5C2.08152 5.5 2.39946 5.3683 2.63388 5.13388C2.8683 4.89946 3 4.58152 3 4.25C3 3.91848 2.8683 3.60054 2.63388 3.36612C2.39946 3.1317 2.08152 3 1.75 3C1.41848 3 1.10054 3.1317 0.866117 3.36612C0.631696 3.60054 0.5 3.91848 0.5 4.25C0.5 4.58152 0.631696 4.89946 0.866117 5.13388C1.10054 5.3683 1.41848 5.5 1.75 5.5ZM9.5 4.25C9.5 4.58152 9.3683 4.89946 9.13388 5.13388C8.89946 5.3683 8.58152 5.5 8.25 5.5C7.91848 5.5 7.60054 5.3683 7.36612 5.13388C7.1317 4.89946 7 4.58152 7 4.25C7 3.91848 7.1317 3.60054 7.36612 3.36612C7.60054 3.1317 7.91848 3 8.25 3C8.58152 3 8.89946 3.1317 9.13388 3.36612C9.3683 3.60054 9.5 3.91848 9.5 4.25ZM5 4.5C5.66304 4.5 6.29893 4.76339 6.76777 5.23223C7.23661 5.70107 7.5 6.33696 7.5 7V10H2.5V7C2.5 6.33696 2.76339 5.70107 3.23223 5.23223C3.70107 4.76339 4.33696 4.5 5 4.5ZM1.5 7C1.5 6.6535 1.55 6.319 1.644 6.003L1.559 6.01C1.13044 6.05706 0.734332 6.26065 0.446631 6.58176C0.158931 6.90286 -0.000111879 7.31886 5.90488e-08 7.75V10H1.5V7ZM10 10V7.75C10.0001 7.30418 9.82996 6.87515 9.52444 6.55049C9.21891 6.22582 8.801 6.03 8.356 6.003C8.4495 6.319 8.5 6.6535 8.5 7V10H10Z"
        fill="currentColor"
      />
    </svg>
  );
}

function PlanIcon() {
  return (
    <svg viewBox="0 0 11 11" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
      <path
        d="M5.5 11C2.4625 11 0 8.5375 0 5.5C0 2.4625 2.4625 0 5.5 0C8.5375 0 11 2.4625 11 5.5C11 8.5375 8.5375 11 5.5 11ZM6 2.26V1.667H5V2.26C4.31149 2.36651 3.67478 2.68949 3.18213 3.18213C2.68949 3.67478 2.36651 4.31149 2.26 5H1.6665V6H2.26C2.36651 6.68851 2.68949 7.32522 3.18213 7.81787C3.67478 8.31051 4.31149 8.63349 5 8.74V9.3335H6V8.74C6.68851 8.63349 7.32522 8.31051 7.81787 7.81787C8.31051 7.32522 8.63349 6.68851 8.74 6H9.333V5H8.74C8.63349 4.31149 8.31051 3.67478 7.81787 3.18213C7.32522 2.68949 6.68851 2.36651 6 2.26Z"
        fill="currentColor"
      />
    </svg>
  );
}

function CalloutChip({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-semibold leading-none text-[#0A6D0E] shadow-[0_0_0_1px_rgba(10,109,14,0.08)]"
      style={{
        background: 'var(--Success-base, #E5FFE6)',
        borderWidth: '0.8px',
        borderStyle: 'solid',
        borderColor: 'transparent',
        borderImageSource: 'linear-gradient(180deg, #09FF11 0%, #139818 100%)',
        borderImageSlice: 1,
      }}
    >
      <span className="text-[#0A6D0E]">{icon}</span>
      <span>{children}</span>
    </span>
  );
}

function StrategyCallCard({ competitor }: { competitor: CompetitorDetailData }) {
  const calloutChips = [
    { label: '30 min session', icon: <SessionIcon /> },
    { label: 'Expert team', icon: <TeamIcon /> },
    { label: 'Custom action plan', icon: <PlanIcon /> },
  ];

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#355DAA] via-[#416FBF] to-[#5C86D8] px-5 py-5 text-white shadow-[0_18px_40px_rgba(41,73,137,0.25)]">
      <div className="absolute right-0 top-0 h-28 w-28 translate-x-8 -translate-y-8 rounded-full bg-white/10" />
      <div className="absolute bottom-0 right-5 h-20 w-20 rounded-full bg-cyan-300/20 blur-xl" />

      <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-end">
        <div className="min-w-0">
          <p className="text-lg font-semibold">{competitor.cta.title}</p>
          <p className="mt-2 max-w-xl text-sm leading-6 text-white/85">{competitor.cta.description}</p>

          <div className="mt-4 flex flex-wrap gap-2">
            {calloutChips.map((item) => (
              <CalloutChip key={item.label} icon={item.icon}>
                {item.label}
              </CalloutChip>
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
