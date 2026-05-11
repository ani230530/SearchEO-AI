import React, { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  Calendar,
  ChevronDown,
  ChevronRight,
  Info,
  Plus,
  Search,
  Sparkles,
  Users,
} from 'lucide-react';
import { Drawer } from '@/components/Drawer';
import { CompetitorDetail } from '@/components/competitors/CompetitorDetail';
import { AiResponseAnalysis } from '@/components/competitors/AiResponseAnalysis';
import { AHREFS_COMPETITOR_DETAIL, type CompetitorDetailData } from '@/components/competitors/competitorDetailData';
import type { PromptGapContext } from '@/components/competitors/aiResponseAnalysisData';
import { MOCK_ANALYSIS_DATA } from '@/data/competitorMockData';
import type { MetricTrend } from '@/types/competitor';
import { apiGet } from '../services/apiClient';
import { AIResultsLayout } from '@/features/ai-results/components/AIResultsLayout';
import { maskDomainId, unmaskDomainId } from '@/lib/domainUtils';
import { useNavigate } from 'react-router-dom';

const data = MOCK_ANALYSIS_DATA;

type AnalysisResult = {
  name: string;
  marketShare: string;
  threat: string;
  threatTone: 'high' | 'medium';
  logo: string;
  logoBg: string;
};

const competitors = [
  { name: 'semrush.com', color: '#F26B57', logo: 'https://img.logo.dev/semrush.com?token=pk_DTdFFG1JT9WOCjATvZEzIA&size=32' },
  { name: 'ahrefs.com', color: '#3B82F6', logo: 'https://img.logo.dev/ahrefs.com?token=pk_DTdFFG1JT9WOCjATvZEzIA&size=32' },
  { name: 'moz.com', color: '#7BC7ED', logo: 'https://img.logo.dev/moz.com?token=pk_DTdFFG1JT9WOCjATvZEzIA&size=32' },
  { name: 'serpstat.com', color: '#2BB673', logo: 'https://img.logo.dev/serpstat.com?token=pk_DTdFFG1JT9WOCjATvZEzIA&size=32' },
  { name: 'spyfu.com', color: '#29384A', logo: 'https://img.logo.dev/spyfu.com?token=pk_DTdFFG1JT9WOCjATvZEzIA&size=32' },
];

const opportunities = [
  { badge: 'High Impact', importance: '92/100', title: 'How to track competitor backlinks prompts effectively?', competitors: ['ahrefs.com', 'semrush.com', 'moz.com'] },
  { badge: 'High Impact', importance: '92/100', title: 'How to track competitor backlinks prompts effectively?', competitors: ['ahrefs.com', 'semrush.com'] },
  { badge: 'High Impact', importance: '92/100', title: 'How to track competitor backlinks prompts effectively?', competitors: ['ahrefs.com', 'semrush.com'] },
  { badge: 'High Impact', importance: '92/100', title: 'How to track competitor backlinks prompts effectively?', competitors: ['ahrefs.com', 'semrush.com'] },
];

const analysisResults: AnalysisResult[] = [
  {
    name: 'SEMrush',
    marketShare: '24%',
    threat: 'High Threat',
    threatTone: 'high',
    logo: 'https://img.logo.dev/semrush.com?token=pk_DTdFFG1JT9WOCjATvZEzIA&size=64',
    logoBg: '#FF642F',
  },
  {
    name: 'Ahrefs',
    marketShare: '24%',
    threat: 'High Threat',
    threatTone: 'high',
    logo: 'https://img.logo.dev/ahrefs.com?token=pk_DTdFFG1JT9WOCjATvZEzIA&size=64',
    logoBg: '#0B5CFF',
  },
  {
    name: 'Serpstat',
    marketShare: '24%',
    threat: 'Medium Threat',
    threatTone: 'medium',
    logo: 'https://img.logo.dev/serpstat.com?token=pk_DTdFFG1JT9WOCjATvZEzIA&size=64',
    logoBg: '#EAF8F1',
  },
  {
    name: 'Spyfu',
    marketShare: '24%',
    threat: 'Medium Threat',
    threatTone: 'medium',
    logo: 'https://img.logo.dev/spyfu.com?token=pk_DTdFFG1JT9WOCjATvZEzIA&size=64',
    logoBg: '#F0F2F5',
  },
];

const contentOpportunities = Array.from({ length: 5 }, (_, index) => ({
  id: index + 1,
  title: 'Create comprehensive backlink analysis guide',
  priority: 'Critical',
  impact: 'Very High',
  relatedTo: 'ahrefs.com',
}));

const toDomain = (name: string) => `${name.replace(/[^a-z0-9]/gi, '').toLowerCase()}.com`;

const buildCompetitorDetailFromAnalysisResult = (result: AnalysisResult): CompetitorDetailData => {
  if (result.name.toLowerCase() === 'ahrefs') {
    return AHREFS_COMPETITOR_DETAIL;
  }

  return {
    ...AHREFS_COMPETITOR_DETAIL,
    name: result.name,
    domain: toDomain(result.name),
    logo: result.logo,
    logoBackground: result.logoBg,
  };
};

const buildPromptGapContext = (item: (typeof opportunities)[number]): PromptGapContext => ({
  title: item.title,
  importance: item.importance,
  competitors: item.competitors,
});

function GenerateContentButton({ className = '' }: { className?: string }) {
  return (
    <button
      type="button"
      className={`inline-flex h-10 min-w-0 items-center justify-center gap-2.5 rounded-md border-2 border-[#F1F6FF] bg-white px-4 text-[14px] font-semibold leading-[150%] tracking-[0%] shadow-[0_1px_2px_0_#1018280D] transition hover:bg-[#F9FBFF] ${className}`}
    >
      <img src="/icons/target-04.svg" alt="" aria-hidden="true" className="h-5 w-5 shrink-0" />
      <span className="whitespace-nowrap bg-gradient-to-r from-[#2D4059] to-[#4C74C2] bg-clip-text text-transparent">
        Generate Content
      </span>
    </button>
  );
}

function InfoIcon({ label }: { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-[#7B8494] transition hover:text-[#2D4059]"
    >
      <Info className="h-3 w-3" strokeWidth={2} />
    </button>
  );
}

function TrendPill({ trend }: { trend: MetricTrend }) {
  const isPositive = trend.sentiment === 'positive';
  const styles = isPositive
    ? 'border-[#BCECC5] bg-[#DFFBE4] text-[#087B25]'
    : 'border-[#FFC9C9] bg-[#FFE5E5] text-[#D83A3A]';

  return (
    <span className={`inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs font-medium ${styles}`}>
      <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2} />
      {trend.value}
    </span>
  );
}

function ScoreCard({
  title,
  score,
  maxScore,
  footer,
  tooltipText,
  trend,
}: {
  title: string;
  score: number;
  maxScore: number;
  footer?: string;
  tooltipText?: string;
  trend: MetricTrend;
}) {
  return (
    <article className="flex h-[106px] min-w-0 flex-col rounded-lg border border-slate-200 bg-white px-6 py-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="truncate text-sm font-medium leading-5 text-[#5F6877]">{title}</h3>
        <InfoIcon label={tooltipText ?? title} />
      </div>

      <div className="mt-2 flex min-w-0 items-center gap-3">
        <div className="flex items-baseline whitespace-nowrap text-[#2D4059]">
          <span className="text-[26px] font-semibold leading-none">{score}</span>
          <span className="ml-0.5 text-base font-medium leading-none">/</span>
          <span className="text-base font-medium leading-none">{maxScore}</span>
        </div>
        <TrendPill trend={trend} />
      </div>

      {footer ? <p className="mt-auto truncate text-xs font-medium text-[#6E7480]">{footer}</p> : null}
    </article>
  );
}

function ValueCard({
  title,
  value,
  footer,
  tooltipText,
  badge,
}: {
  title: string;
  value: string;
  footer?: string;
  tooltipText?: string;
  badge?: string;
}) {
  return (
    <article className="flex h-[106px] min-w-0 flex-col rounded-lg border border-slate-200 bg-white px-6 py-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="truncate text-sm font-medium leading-5 text-[#5F6877]">{title}</h3>
        <InfoIcon label={tooltipText ?? title} />
      </div>

      <div className="mt-2 flex min-w-0 items-center gap-3">
        <span className="whitespace-nowrap text-[26px] font-semibold leading-none text-[#2D4059]">{value}</span>
        {badge ? (
          <span className="inline-flex h-5 items-center rounded-full border border-[#F6D985] bg-[#FFF8D9] px-2 text-[11px] font-medium text-[#D49A00]">
            {badge}
          </span>
        ) : null}
      </div>

      {footer ? <p className="mt-auto truncate text-xs font-medium text-[#6E7480]">{footer}</p> : null}
    </article>
  );
}

function InsightCard() {
  return (
    <article className="flex h-[106px] min-w-0 flex-col rounded-lg border border-slate-200 bg-white px-6 py-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="truncate text-sm font-medium leading-5 text-[#5F6877]">{data.topInsight.title}</h3>
        <InfoIcon label={data.topInsight.tooltipText ?? data.topInsight.title} />
      </div>

      <ul className="mt-3 list-disc space-y-1 pl-4 text-[11px] font-semibold leading-[1.25] text-[#2D4059]">
        {data.topInsight.insights.slice(0, 2).map((insight) => (
          <li key={insight}>{insight}</li>
        ))}
      </ul>
    </article>
  );
}

function CompetitorSelector() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-[#2D4059]">Select Competitors to Analyze</h2>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-[315px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#A0A7B2]" />
          <input
            aria-label="Search competitor"
            className="h-9 w-full rounded border border-slate-200 bg-white pl-9 pr-3 text-xs text-[#2D4059] outline-none placeholder:text-[#A0A7B2] focus:border-[#1E9BFF]"
            placeholder="Enter your website or import keyword to compare"
          />
        </div>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-2 rounded bg-[#243B5A] px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-[#1F334D]"
        >
          <Plus className="h-3.5 w-3.5" />
          Add competitors
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        {competitors.map((competitor) => (
          <button
            key={competitor.name}
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded border border-slate-200 bg-white px-3 text-xs font-semibold text-[#2D4059] shadow-sm transition hover:bg-slate-50"
          >
            <span className="grid h-6 w-6 place-items-center overflow-hidden rounded" style={{ backgroundColor: `${competitor.color}22` }}>
              <img src={competitor.logo} alt="" className="h-5 w-5 object-contain" />
            </span>
            {competitor.name}
          </button>
        ))}
      </div>
    </section>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] font-medium text-[#7B8494]">
      {competitors.slice(0, 4).map((competitor) => (
        <span key={competitor.name} className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: competitor.color }} />
          {competitor.name.split('.')[0][0].toUpperCase() + competitor.name.split('.')[0].slice(1)}
        </span>
      ))}
    </div>
  );
}

function AreaChart({
  title,
  subtitle,
  tooltip,
}: {
  title: string;
  subtitle: string;
  tooltip?: boolean;
}) {
  const dates = ['10 Apr', '11 Apr', '12 Apr', '13 Apr', '14 Apr', '15 Apr', '16 Apr', '17 Apr', '18 Apr', '19 Apr', '20 Apr'];

  return (
    <div className="min-w-0">
      <div className="mb-2">
        <h4 className="text-sm font-semibold text-[#2D4059]">{title}</h4>
        <p className="text-xs text-[#7B8494]">{subtitle}</p>
      </div>
      <Legend />
      <div className="relative mt-2 h-[170px] overflow-hidden rounded bg-white">
        <svg viewBox="0 0 700 170" preserveAspectRatio="none" className="h-full w-full">
          {[32, 68, 104, 140].map((y) => (
            <line key={y} x1="0" y1={y} x2="700" y2={y} stroke="#EEF1F5" strokeWidth="1" />
          ))}
          <path d="M0 132 C40 55 70 128 110 112 C155 96 180 120 214 76 C250 18 285 126 322 104 C370 78 408 90 444 84 C486 76 505 118 540 36 C585 132 620 42 650 84 C675 112 690 78 700 68 L700 170 L0 170 Z" fill="#E96F71" opacity="0.32" />
          <path d="M0 144 C46 136 82 145 120 118 C158 102 194 122 226 112 C268 98 302 130 336 118 C382 100 414 112 455 94 C502 74 532 124 570 104 C618 82 650 120 700 62 L700 170 L0 170 Z" fill="#7BD8EB" opacity="0.48" />
          <path d="M0 151 C58 148 94 146 130 136 C174 124 218 130 262 125 C312 120 350 134 398 126 C450 114 500 122 542 116 C596 105 642 112 700 92 L700 170 L0 170 Z" fill="#90C4F8" opacity="0.5" />
          <path d="M0 142 C70 126 128 132 188 118 C256 106 330 126 388 104 C460 82 520 112 584 88 C632 72 668 84 700 60" fill="none" stroke="#72C6E5" strokeWidth="2" />
          <path d="M0 132 C40 55 70 128 110 112 C155 96 180 120 214 76 C250 18 285 126 322 104 C370 78 408 90 444 84 C486 76 505 118 540 36 C585 132 620 42 650 84 C675 112 690 78 700 68" fill="none" stroke="#EAA0A0" strokeWidth="1.5" />
          {tooltip ? (
            <>
              <line x1="488" y1="24" x2="488" y2="156" stroke="#D5DBE4" strokeDasharray="4 4" />
              <circle cx="488" cy="84" r="4" fill="#F39C53" />
            </>
          ) : null}
        </svg>
        {tooltip ? (
          <div className="absolute right-[18%] top-8 w-[124px] rounded-md border border-slate-200 bg-white p-2 text-[10px] shadow-lg">
            <p className="mb-1 font-semibold text-[#2D4059]">{title}</p>
            <div className="space-y-1 text-[#667085]">
              <div className="flex justify-between"><span>Semrush</span><span>45%</span></div>
              <div className="flex justify-between"><span>Ahrefs</span><span>31%</span></div>
              <div className="flex justify-between"><span>Moz</span><span>27%</span></div>
            </div>
          </div>
        ) : null}
      </div>
      <div className="mt-1 grid grid-cols-6 gap-1 text-[9px] text-[#98A2B3] sm:grid-cols-11">
        {dates.map((date) => (
          <span key={date} className="truncate">{date}</span>
        ))}
      </div>
    </div>
  );
}

function TrendComparisonPanel() {
  return (
    <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-[#2D4059]">Competitor Trend Comparison</h3>
        </div>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-2.5 rounded-lg border border-[#D5D7DA] bg-white px-3.5 text-[#717680] shadow-none transition hover:bg-gray-50"
        >
          <Calendar className="h-4 w-4" />
          <span className="text-[13px] font-medium leading-none">7 days</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </button>
      </div>

      <div className="mt-3 space-y-5">
        <AreaChart title="AI Visibility Trend" subtitle="Compare competitors across prompts and citations." tooltip />
        <AreaChart title="Citation Share Comparison" subtitle="See where your competitors are getting their Authority." />
        <AreaChart title="Share of Voice" subtitle="Evaluate Competitor Prominence and Position in Market." tooltip />
      </div>
    </section>
  );
}

function OpportunityCard({
  item,
  onAiResponse,
}: {
  item: (typeof opportunities)[number];
  onAiResponse: (item: (typeof opportunities)[number]) => void;
}) {
  return (
    <article className="relative overflow-hidden rounded-xl border border-[#E8ECF2] bg-white py-5 pl-6 pr-5 shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
      <div className="absolute inset-y-0 left-0 w-1.5 bg-[#7EA6FF]" />

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_128px] sm:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex h-5 items-center rounded-full bg-[#FFE9E9] px-2.5 text-[10px] font-medium text-[#F05F5F]">
              {item.badge}
            </span>
            <span className="text-sm font-medium text-[#7B8494]">Importance: {item.importance}</span>
          </div>

          <h4 className="mt-4 max-w-[260px] text-base font-medium italic leading-6 text-[#2D4059]">
            {item.title}
          </h4>

          <p className="mt-5 text-sm font-medium leading-5 text-[#426185]">
            Appearing:{' '}
            <span className="font-bold text-[#2D4059]">
              {item.competitors.map((competitor, index) => (
                <React.Fragment key={competitor}>
                  {competitor}
                  {index < item.competitors.length - 1 ? ', ' : ''}
                </React.Fragment>
              ))}
            </span>
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-start gap-4 sm:items-end">
          <div className="whitespace-nowrap text-left sm:text-right">
            <span className="text-2xl font-semibold leading-none text-[#D49A00]">88%</span>
            <span className="ml-1 text-sm font-medium text-[#58657A]">Opportunity</span>
          </div>

          <div className="flex w-full flex-col gap-3 sm:min-w-[176px] sm:max-w-[208px]">
            <button
              type="button"
              onClick={() => onAiResponse(item)}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-[#D5D7DA] bg-[#F9F9F9] px-3 text-[14px] font-semibold leading-[150%] text-[#40516A] shadow-none transition hover:bg-[#F4F4F5]"
            >
              <Sparkles className="h-3.5 w-3.5" />
              AI Response
            </button>
            <GenerateContentButton className="w-full" />
          </div>
        </div>
      </div>
    </article>
  );
}

function PromptGapPanel({
  onAiResponse,
  onViewAll,
}: {
  onAiResponse: (item: (typeof opportunities)[number]) => void;
  onViewAll: () => void;
}) {
  return (
    <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold leading-none text-[#2D4059]">Prompt Gaps Opportunities</h3>
          <p className="mt-3 text-base text-[#7B8494]">Turn missed prompts into content</p>
        </div>
        <button
          type="button"
          onClick={onViewAll}
          className="inline-flex h-10 shrink-0 items-center gap-3 rounded-md border border-[#D7DDE6] bg-white px-4 text-xs font-semibold text-[#7B8494] shadow-sm"
        >
          View all
          <ChevronDown className="h-3.5 w-3.5 -rotate-90" />
        </button>
      </div>

      <div className="mt-8 space-y-6">
        {opportunities.map((item, index) => (
          <OpportunityCard key={`${item.title}-${index}`} item={item} onAiResponse={onAiResponse} />
        ))}
      </div>
    </section>
  );
}

function AnalysisInfoBox({ title, value }: { title: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-white px-4 py-4">
      <p className="truncate text-sm font-medium text-[#7B8494]">{title}</p>
      <p className="mt-3 truncate text-xs font-semibold text-[#1F2937]">{value}</p>
    </div>
  );
}

function AnalysisResultCard({
  result,
  onOpenDetail,
}: {
  result: (typeof analysisResults)[number];
  onOpenDetail: (result: (typeof analysisResults)[number]) => void;
}) {
  const threatStyles =
    result.threatTone === 'high'
      ? 'border-[#FFC9C9] bg-[#FFF2F2] text-[#F05F5F]'
      : 'border-[#F6D985] bg-[#FFF8D9] text-[#C99714]';

  return (
    <article className="grid min-w-0 grid-cols-[minmax(0,1fr)_56px] overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="min-w-0 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <span
              className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl"
              style={{ backgroundColor: result.logoBg }}
            >
              <img src={result.logo} alt="" className="h-10 w-10 object-contain" />
            </span>
            <div className="min-w-0">
              <h4 className="truncate text-xl font-semibold leading-6 text-[#1F2937]">{result.name}</h4>
              <p className="mt-2 truncate text-sm font-medium text-[#7B8494]">Market Share: {result.marketShare}</p>
            </div>
          </div>

          <span className={`inline-flex h-5 shrink-0 items-center rounded-full border px-2.5 text-[10px] font-medium ${threatStyles}`}>
            {result.threat}
          </span>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AnalysisInfoBox title="Strongest Prompt Cluster" value="Keyword Research (95% dominance)" />
          <AnalysisInfoBox title="Top Cited Source Types" value="Blog posts, YouTube tutorials" />
        </div>
      </div>

      <button
        type="button"
        aria-label={`View ${result.name} competitor analysis`}
        onClick={() => onOpenDetail(result)}
        className="flex h-full items-center justify-center border-l border-[#D5D7DA] bg-[#F9F9F9] text-[#8A93A3] transition hover:bg-[#F4F4F5] hover:text-[#2D4059]"
      >
        <ChevronRight className="h-9 w-9" strokeWidth={2.25} />
      </button>
    </article>
  );
}

function AICompetitorAnalysisResults({
  onOpenDetail,
}: {
  onOpenDetail: (result: (typeof analysisResults)[number]) => void;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h3 className="text-xl font-semibold leading-none text-[#2D4059]">AI-Based Competitor Analysis Results</h3>
        <p className="mt-5 text-sm text-[#7B8494]">Results from the traditional AI-based competitor analysis method</p>
      </div>

      <div className="mt-7 grid grid-cols-1 gap-6 xl:grid-cols-2">
        {analysisResults.map((result) => (
          <AnalysisResultCard key={result.name} result={result} onOpenDetail={onOpenDetail} />
        ))}
      </div>
    </section>
  );
}

function PositioningComparison() {
  const legend = [
    { name: 'Semrush', color: '#2F86D3' },
    { name: 'Ahrefs', color: '#33485E' },
    { name: 'Moz', color: '#7FADE0' },
    { name: 'Serpstat', color: '#B7D7EC' },
    { name: 'Spyfu', color: '#DDEBF3' },
  ];

  return (
    <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold leading-none text-[#2D4059]">Positioning Comparison</h3>
          <p className="mt-5 text-sm text-[#7B8494]">Strategic Placement of Competitors</p>
        </div>
        <button
          type="button"
          className="inline-flex h-9 shrink-0 items-center gap-3 rounded-md border border-slate-200 bg-white px-4 text-xs font-medium text-[#7B8494] shadow-sm"
        >
          Yearly
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-8 overflow-x-auto">
        <div className="min-w-[560px]">
          <svg viewBox="0 0 640 560" className="h-auto w-full" role="img" aria-label="Positioning comparison bubble chart">
            <defs>
              <pattern id="position-grid" width="64" height="64" patternUnits="userSpaceOnUse">
                <path d="M64 0H0V64" fill="none" stroke="#DDE3EA" strokeWidth="1" strokeDasharray="2 2" />
              </pattern>
            </defs>

            <rect x="76" y="38" width="500" height="430" fill="url(#position-grid)" stroke="#DDE3EA" strokeWidth="1" />

            {[0, 20, 40, 60, 80, 100].map((tick) => {
              const x = 76 + tick * 5;
              const y = 468 - tick * 4.3;
              return (
                <g key={tick}>
                  <text x={x} y="486" textAnchor="middle" className="fill-[#667085] text-[11px]">{tick}</text>
                  <text x="61" y={y + 4} textAnchor="end" className="fill-[#667085] text-[11px]">{tick}</text>
                </g>
              );
            })}

            <text x="326" y="526" textAnchor="middle" className="fill-[#2D5B93] text-[12px] font-semibold">Market Share %</text>
            <text x="24" y="253" textAnchor="middle" transform="rotate(-90 24 253)" className="fill-[#2D5B93] text-[12px] font-semibold">Sentiment %</text>

            <circle cx="252" cy="360" r="78" fill="#2F86D3" opacity="0.72" />
            <circle cx="354" cy="253" r="66" fill="#33485E" opacity="0.66" />
            <circle cx="438" cy="186" r="82" fill="#9EBBEA" opacity="0.78" stroke="#6F95CE" />
            <circle cx="220" cy="253" r="57" fill="#9CC5E9" opacity="0.9" />
            <circle cx="254" cy="172" r="45" fill="#DDEBF3" opacity="0.95" />

            <g filter="drop-shadow(0 10px 14px rgba(15,23,42,0.18))">
              <rect x="412" y="202" width="134" height="132" rx="6" fill="#fff" stroke="#E4E9F0" />
              <text x="426" y="226" className="fill-[#5F6877] text-[10px] font-medium">Semrush</text>
              <text x="426" y="250" className="fill-[#7B8494] text-[10px]">Sentiment</text>
              <text x="517" y="250" textAnchor="end" className="fill-[#2D4059] text-[10px] font-bold">Positive</text>
              <text x="426" y="270" className="fill-[#7B8494] text-[10px]">Role</text>
              <text x="517" y="270" textAnchor="end" className="fill-[#2D4059] text-[10px] font-bold">Market leader</text>
              <text x="426" y="290" className="fill-[#7B8494] text-[10px]">Prompts</text>
              <text x="517" y="290" textAnchor="end" className="fill-[#2D4059] text-[10px] font-bold">37%</text>
              <rect x="424" y="295" width="110" height="32" rx="5" fill="#2D4059" />
              <image href="/report-icons/file-05.svg" x="432" y="303" width="14" height="14" />
              <text x="450" y="315" textAnchor="start" className="fill-white text-[9px] font-semibold">Generate Report</text>
            </g>
          </svg>

          <div className="mt-3 flex flex-wrap items-center justify-center gap-7">
            {legend.map((item) => (
              <span key={item.name} className="inline-flex items-center gap-2 text-sm font-medium text-[#667085]">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                {item.name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ContentOpportunityCard({ item }: { item: (typeof contentOpportunities)[number] }) {
  return (
    <article className="relative overflow-hidden rounded-lg border border-[#E8ECF2] bg-white px-6 py-5 shadow-[0_8px_18px_rgba(15,23,42,0.06)]">
      <div className="absolute inset-y-0 left-0 w-1.5 bg-[#7EA6FF]" />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h4 className="truncate text-base font-semibold text-[#2D4059]">{item.title}</h4>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="inline-flex h-5 items-center rounded-full bg-[#FFE9E9] px-2.5 text-[10px] font-medium text-[#F05F5F]">
              {item.priority}
            </span>
            <span className="text-sm font-semibold text-[#2DA855]">↗ {item.impact}</span>
          </div>
          <p className="mt-5 text-sm font-medium text-[#7B8494]">
            Related to: <span className="ml-5 text-[#2D4059]">{item.relatedTo}</span>
          </p>
        </div>

        <GenerateContentButton className="w-full sm:w-auto sm:self-center" />
      </div>
    </article>
  );
}

function ContentOpportunitiesToCreate() {
  return (
    <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-xl font-semibold leading-none text-[#2D4059]">Content Opportunities to Create</h3>
        <button
          type="button"
          className="inline-flex h-9 shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-4 text-xs font-medium text-[#7B8494] shadow-sm"
        >
          View All
          <ChevronDown className="h-3.5 w-3.5 -rotate-90" />
        </button>
      </div>

      <div className="mt-6 space-y-4">
        {contentOpportunities.map((item) => (
          <ContentOpportunityCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}

function PositioningAndContentSection() {
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <PositioningComparison />
      <ContentOpportunitiesToCreate />
    </div>
  );
}

export default function CompetitorsPage() {
  const navigate = useNavigate();
  const storedSlug = localStorage.getItem('ai-visibility:lastDomainSlug');
  const [allDomains, setAllDomains] = useState<any[]>([]);
  const [currentDomain, setCurrentDomain] = useState<any | null>(null);
  const [selectedCompetitor, setSelectedCompetitor] = useState<CompetitorDetailData | null>(null);
  const [selectedPromptGap, setSelectedPromptGap] = useState<PromptGapContext | null>(null);
  const [activeDrawer, setActiveDrawer] = useState<'competitor' | 'prompt-gap' | null>(null);

  useEffect(() => {
    let alive = true;

    const loadDomains = async () => {
      try {
        const data = await apiGet<any>('/wizard/domains');
        const domains = Array.isArray(data?.domains) ? data.domains : [];
        if (!alive) return;
        setAllDomains(domains);

        let selected = storedSlug ? domains.find((domain: any) => maskDomainId(domain.id) === storedSlug) : null;
        if (!selected && domains.length > 0) {
          selected = [...domains].sort((a: any, b: any) => {
            const aTime = a.lastAnalyzed ? new Date(a.lastAnalyzed).getTime() : 0;
            const bTime = b.lastAnalyzed ? new Date(b.lastAnalyzed).getTime() : 0;
            return bTime - aTime;
          })[0];
        }
        if (selected && alive) {
          setCurrentDomain(selected);
          localStorage.setItem('ai-visibility:lastDomainSlug', maskDomainId(selected.id));
        }
      } catch (err) {
        console.error('[Competitors] Failed to load domains:', err);
      }
    };

    void loadDomains();
    return () => {
      alive = false;
    };
  }, []);

  const closeDrawer = () => {
    setActiveDrawer(null);
    setSelectedCompetitor(null);
    setSelectedPromptGap(null);
  };

  const openCompetitorDrawer = (result: AnalysisResult) => {
    setSelectedPromptGap(null);
    setSelectedCompetitor(buildCompetitorDetailFromAnalysisResult(result));
    setActiveDrawer('competitor');
  };

  const openPromptGapDrawer = (item: (typeof opportunities)[number]) => {
    setSelectedCompetitor(null);
    setSelectedPromptGap(buildPromptGapContext(item));
    setActiveDrawer('prompt-gap');
  };

  const openPromptGapsReport = () => {
    navigate('/ai-results-prompt-gaps');
  };

  return (
    <AIResultsLayout
      activeItem="competitors"
      allDomains={allDomains}
      currentDomainId={currentDomain?.id}
      currentDomainUrl={currentDomain?.url}
      currentDomainHost={currentDomain?.host}
      currentDomainName={currentDomain?.companyName ?? currentDomain?.host}
      maskedDomainId={currentDomain ? maskDomainId(currentDomain.id) : storedSlug ?? undefined}
      title="Competitors"
    >
      <div className="min-h-0 w-full flex-1 overflow-y-auto bg-white">
        <div className="mx-auto flex w-full max-w-[1530px] flex-col gap-5 px-5 py-3">
          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold leading-none text-[#2D4059]">Competitor Analysis</h2>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
              <ScoreCard
                title={data.aiVisibility.title}
                score={data.aiVisibility.score}
                maxScore={data.aiVisibility.maxScore}
                footer={data.aiVisibility.footer}
                tooltipText={data.aiVisibility.tooltipText}
                trend={data.aiVisibility.trend}
              />
              <ScoreCard
                title={data.bestCompetitor.title}
                score={data.bestCompetitor.score}
                maxScore={data.bestCompetitor.maxScore}
                footer={data.bestCompetitor.footer}
                tooltipText={data.bestCompetitor.tooltipText}
                trend={data.bestCompetitor.trend}
              />
              <ValueCard
                title={data.largestGap.title}
                value={data.largestGap.value}
                footer={data.largestGap.footer}
                badge="Prompt"
              />
              <ValueCard
                title={data.competitorSOV.title}
                value={data.competitorSOV.value}
                footer={data.competitorSOV.footer}
                tooltipText={data.competitorSOV.tooltipText}
              />
              <InsightCard />
            </div>
          </section>

          <CompetitorSelector />

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.85fr)]">
            <TrendComparisonPanel />
            <PromptGapPanel onAiResponse={openPromptGapDrawer} onViewAll={openPromptGapsReport} />
          </div>

          <AICompetitorAnalysisResults onOpenDetail={openCompetitorDrawer} />

          <PositioningAndContentSection />
        </div>
      </div>

      <Drawer open={activeDrawer !== null} onOpenChange={(open) => !open && closeDrawer()}>
        {activeDrawer === 'competitor' && selectedCompetitor ? (
          <CompetitorDetail competitor={selectedCompetitor} />
        ) : null}
        {activeDrawer === 'prompt-gap' && selectedPromptGap ? (
          <AiResponseAnalysis prompt={selectedPromptGap} />
        ) : null}
      </Drawer>
    </AIResultsLayout>
  );
}
