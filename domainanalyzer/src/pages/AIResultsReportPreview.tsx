import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiPatch, apiPost } from '../services/apiClient';
import { logoUrl as logoUrlHelper } from '@/lib/logoUrl';
import { cn } from '@/lib/utils';
import { AIResultsBreadcrumbs } from '@/features/ai-results/components/AIResultsBreadcrumbs';
import { resolveAIResultsNavigation, resolveSidebarNavigation } from '@/features/sidebar-dashboard/navigation';
import { useScrollSpyBreadcrumbs } from '@/features/ai-results/useScrollSpyBreadcrumbs';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  BarChart3,
  Bot,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  Filter,
  ArrowUp,
  Globe2,
  LayoutDashboard,
  LineChart,
  Languages,
  LayoutGrid,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Table2,
  Target,
  Upload,
  UserRound,
  Users,
  Info,
  TrendingUp,
  X,
  FileText,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/use-toast';
import { maskDomainId, unmaskDomainId } from '../lib/domainUtils';
import { useShellContext } from '@/features/ai-results/AIResultsShell';
import { useCampaigns, useGscStatus, useReport, useRuns, useTrackedPrompts, useTrends } from '@/features/ai-results/queries';
import { useQueryClient } from '@tanstack/react-query';
import { aiResultsKeys } from '@/features/ai-results/queries';
import type { PromptTableRow } from '@/features/ai-results/components/PromptTrackingTable';
import { TrackToggleButton } from '@/features/ai-results/components/TrackToggleButton';
import {
  buildProjectsWorksheetPath,
  openWorksheetInNewTab,
  openWorksheetPlaceholderTab,
  WorksheetPickerModal,
  CreateWorksheetModal,
  writeWorksheetHandoff,
  type WorksheetOption,
} from '@/features/ai-results/components/WorksheetPickerModals';

const getDomainHost = (rawUrl: string | undefined): string => {
  if (!rawUrl) return '';
  return rawUrl.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0];
};

const getDomainLogo = (rawUrl: string | undefined): string | null => {
  const host = getDomainHost(rawUrl);
  return logoUrlHelper(host, 64);
};

const getHostFromAnyUrl = (value?: string): string | null => {
  if (!value) return null;
  try {
    const target = value.startsWith('http') ? value : `https://${value}`;
    const host = new URL(target).hostname.replace(/^www\./, '');
    return host || null;
  } catch {
    return null;
  }
};

const getFaviconUrl = (value?: string): string | null => {
  const host = getHostFromAnyUrl(value);
  return logoUrlHelper(host, 64);
};

const MODEL_ICON_SRC: Array<{ match: RegExp; src: string; label: string }> = [
  { match: /(gpt|chatgpt|openai)/i, src: '/report-icons/chat-gpt.svg', label: 'ChatGPT' },
  { match: /claude/i, src: '/report-icons/claude.svg', label: 'Claude' },
  { match: /gemini/i, src: '/report-icons/gemini.svg', label: 'Gemini' },
  { match: /(google|gre|overview)/i, src: '/report-icons/google.svg', label: 'Google AI Overview' },
];

const resolveModelMeta = (model?: string) => {
  if (!model) return null;
  return MODEL_ICON_SRC.find((entry) => entry.match.test(model)) ?? null;
};

const getModelLabel = (model?: string) => {
  if (!model) return 'Model';
  return resolveModelMeta(model)?.label ?? model;
};

const getModelIconNode = (model?: string, size: 'sm' | 'md' = 'sm') => {
  const dim = size === 'md' ? 'h-[18px] w-[18px]' : 'h-4 w-4';
  const meta = resolveModelMeta(model);
  if (meta) {
    return (
      <img
        src={meta.src}
        alt={meta.label}
        className={`${dim} object-contain`}
        loading="lazy"
      />
    );
  }
  return <Bot className={`${dim} text-slate-400`} />;
};

const sentimentTone = (sentiment?: number | null) => {
  if (sentiment == null || Number.isNaN(Number(sentiment))) {
    return 'border-slate-200 bg-white text-slate-600';
  }
  const value = Number(sentiment);
  if (value > 2) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (value < -2) return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
};

const CompetitorPill = ({ mention }: { mention: any }) => {
  if (!mention) return null;
  const brand = (mention.brand || mention.name || '').toString().trim();
  if (!brand) return null;
  const sentiment = mention.sentiment ?? null;
  const favicon = mention.logoUrl || getFaviconUrl(mention.url || mention.domain || brand);
  const tone = sentimentTone(sentiment);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-medium ${tone}`}
    >
      {favicon ? (
        <img
          src={favicon}
          alt={brand}
          className="h-3.5 w-3.5 flex-shrink-0 rounded-full border border-white bg-white object-cover"
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : null}
      {brand}
    </span>
  );
};

const sidebarItems = [
  { id: 'ai-results', label: 'AI Results', icon: Sparkles },
  { id: 'competitors', label: 'Competitors', icon: Users },
  { id: 'top-prompts', label: 'Top Prompts', icon: Target },
  { id: 'top-keywords', label: 'Top Keywords', icon: Star },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
];

const getSentimentColor = (sentiment: string) => {
  const s = sentiment.toLowerCase();
  if (s === 'positive') return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  if (s === 'neutral') return 'bg-blue-50 text-blue-700 border-blue-100';
  if (s === 'negative') return 'bg-amber-50 text-amber-700 border-amber-100';
  return 'bg-gray-50 text-gray-700 border-slate-200';
};



const promptRows = [
  {
    prompt: 'Compare Semrush, Ahrefs, Advanced AI Results',
    type: 'Prompt',
    profile: 'Profile',
    ranking: '2/15',
    position: '12',
    sov: '42%',
    competitors: ['Semrush', 'Ahrefs', 'G2'],
  },
  {
    prompt: 'Keyword research software',
    type: 'Prompt',
    profile: 'Profile',
    ranking: '2/13',
    position: '14',
    sov: '42%',
    competitors: ['Semrush', 'Ahrefs', 'Moz'],
  },
  {
    prompt: 'SEO tools platform',
    type: 'Prompt',
    profile: 'Profile',
    ranking: '2/15',
    position: '12',
    sov: '42%',
    competitors: ['Semrush', 'Ahrefs', 'G2'],
  },
  {
    prompt: 'Best local SEO app and plan',
    type: 'Prompt',
    profile: 'Profile',
    ranking: '2/16',
    position: '12',
    sov: '42%',
    competitors: ['Semrush', 'Ahrefs', 'G2'],
  },
  {
    prompt: 'Digital marketing analytics',
    type: 'Prompt',
    profile: 'Profile',
    ranking: '2/13',
    position: '14',
    sov: '42%',
    competitors: ['Semrush', 'Ahrefs', 'G2'],
  },
];

// Phrase Visibility Map + Opportunities are now derived from
// reportData.phraseVisibility / reportData.opportunities — see
// the inline mappers in the page render below. The mock arrays
// that used to live here ("Best SaaS analytics tools", etc.) are gone.

/** Map analytics severity bucket → display string. */
const SEVERITY_LABEL: Record<string, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

/** Map analytics traffic potential bucket → display string. */
const TRAFFIC_LABEL: Record<string, string> = {
  very_high: 'Very High',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

// Trend chart data is now derived from /trends inside the page component —
// shareOfVoice, citations, and mentions arrays used to live here as static
// mocks (Semrush/Ahref/Athena HQ/Scrunch competitors, dates running into
// May 26). Removed in favor of real per-AiRun rollups so the dashboard
// can't lie about progress over time.

const formatChartTick = (value: string | number) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return `${value}`;
  if (numericValue === 0) return '0';
  return numericValue >= 1000 ? `${Math.round(numericValue / 1000)}k` : `${numericValue}`;
};

const formatDateTick = (value: string | number) =>
  `${value}`
    .replace('April', 'Apr')
    .replace('June', 'Jun')
    .replace('July', 'Jul')
    .replace('August', 'Aug')
    .replace('September', 'Sept')
    .replace('October', 'Oct')
    .replace('November', 'Nov')
    .replace('December', 'Dec');

type IconButtonProps = {
  label: string;
  icon: typeof Search;
};

type HeaderIconButtonProps = {
  label: string;
  icon?: typeof Search;
  children?: React.ReactNode;
};

const BackArrowIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="cursor-pointer">
    <path d="M5.25 11.25H20.25C20.4489 11.25 20.6397 11.329 20.7803 11.4697C20.921 11.6103 21 11.8011 21 12C21 12.1989 20.921 12.3897 20.7803 12.5303C20.6397 12.671 20.4489 12.75 20.25 12.75H5.25C5.05109 12.75 4.86032 12.671 4.71967 12.5303C4.57902 12.3897 4.5 12.1989 4.5 12C4.5 11.8011 4.57902 11.6103 4.71967 11.4697C4.86032 11.329 5.05109 11.25 5.25 11.25Z" fill="black" />
    <path d="M5.56184 12L11.7823 18.219C11.9232 18.3598 12.0023 18.5508 12.0023 18.75C12.0023 18.9491 11.9232 19.1401 11.7823 19.281C11.6415 19.4218 11.4505 19.5009 11.2513 19.5009C11.0522 19.5009 10.8612 19.4218 10.7203 19.281L3.97034 12.531C3.9005 12.4613 3.84508 12.3785 3.80727 12.2874C3.76946 12.1963 3.75 12.0986 3.75 12C3.75 11.9013 3.76946 11.8036 3.80727 11.7125C3.84508 11.6214 3.9005 11.5386 3.97034 11.469L10.7203 4.71897C10.8612 4.57814 11.0522 4.49902 11.2513 4.49902C11.4505 4.49902 11.6415 4.57814 11.7823 4.71897C11.9232 4.8598 12.0023 5.05081 12.0023 5.24997C12.0023 5.44913 11.9232 5.64014 11.7823 5.78097L5.56184 12Z" fill="black" />
  </svg>
);

const HelperIcon = () => (
  <svg width="19" height="19" viewBox="0 0 19 19" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M6.65833 6.58333C6.85425 6.02639 7.24096 5.55676 7.74996 5.25761C8.25896 4.95847 8.85741 4.84912 9.43931 4.94893C10.0212 5.04874 10.549 5.35127 10.9292 5.80294C11.3094 6.25461 11.5175 6.82627 11.5167 7.41667C11.5167 9.08333 9.01667 9.91667 9.01667 9.91667M9.08333 13.25H9.09167M17.4167 9.08333C17.4167 13.6857 13.6857 17.4167 9.08333 17.4167C4.48096 17.4167 0.75 13.6857 0.75 9.08333C0.75 4.48096 4.48096 0.75 9.08333 0.75C13.6857 0.75 17.4167 4.48096 17.4167 9.08333Z" stroke="#8D9199" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const BellIcon = () => (
  <svg width="17" height="19" viewBox="0 0 17 19" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M5.82767 16.5833C6.41528 17.102 7.18716 17.4167 8.03253 17.4167C8.8779 17.4167 9.64977 17.102 10.2374 16.5833M13.0325 5.75C13.0325 4.42392 12.5057 3.15215 11.5681 2.21447C10.6304 1.27678 9.35861 0.75 8.03253 0.75C6.70645 0.75 5.43468 1.27678 4.49699 2.21447C3.55931 3.15215 3.03253 4.42392 3.03253 5.75C3.03253 8.32515 2.38292 10.0883 1.65725 11.2545C1.04513 12.2382 0.739075 12.7301 0.750298 12.8673C0.762724 13.0192 0.79491 13.0772 0.91734 13.168C1.02791 13.25 1.52635 13.25 2.52324 13.25H13.5418C14.5387 13.25 15.0371 13.25 15.1477 13.168C15.2701 13.0772 15.3023 13.0192 15.3148 12.8673C15.326 12.7301 15.0199 12.2382 14.4078 11.2545C13.6821 10.0883 13.0325 8.32515 13.0325 5.75Z" stroke="#8D9199" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IntegrateSiteIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path
      d="M10.5883 15.3034L9.40982 16.4819C7.78264 18.1091 5.14445 18.1091 3.51726 16.4819C1.89008 14.8547 1.89008 12.2165 3.51726 10.5893L4.69577 9.4108M15.3024 10.5893L16.4809 9.4108C18.1081 7.78361 18.1081 5.14542 16.4809 3.51824C14.8537 1.89106 12.2155 1.89106 10.5883 3.51824L9.40982 4.69675M7.08241 12.9167L12.9157 7.08337"
      stroke="white"
      strokeWidth="1.66667"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const IconButton = ({ label, icon: Icon }: IconButtonProps) => (
  <button
    type="button"
    aria-label={label}
    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-900"
  >
    <Icon className="h-4 w-4" />
  </button>
);

const HeaderIconButton = ({ label, icon: Icon, children }: HeaderIconButtonProps) => (
  <button
    type="button"
    aria-label={label}
    className="inline-flex h-5 w-5 items-center justify-center bg-transparent text-[#8D9199]"
  >
    {children || (Icon ? <Icon className="h-8 w-8" strokeWidth={1.8} /> : null)}
  </button>
);

const HeaderProfileButton = () => (
  <button
    type="button"
    aria-label="Profile"
    className="inline-flex h-8 w-8 items-center justify-center gap-1 rounded-lg border-2 border-[#F9F9F9] bg-[#F9F9F9] text-[#2f4462] shadow-[0_1px_2px_0_#1018280D]"
  >
    <UserRound className="h-5 w-5" strokeWidth={2} />
  </button>
);

const ReportDownloadIcon = () => (
  <img src="/report-icons/download-button.svg" alt="" className="h-10 w-10 shrink-0" />
);

const ReportSortIcon = () => (
  <svg width="17" height="12" viewBox="0 0 17 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path
      d="M3.25 5.75H13.25M0.75 0.75H15.75M5.75 10.75H10.75"
      stroke="#717680"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

type MetricCardDetail = {
  label: string;
  value: string;
  subValue?: string;
  iconSrc?: string;
  barWidth?: number;
};

interface MetricCardData {
  title: string;
  kind: 'modelPerformance' | 'citations' | 'summary' | 'promptSummary';
  details: MetricCardDetail[];
}

/**
 * Plain "i" badge — used as the trigger inside MetricInfoTooltip below.
 * Kept as a separate component so we can also drop a tip-less version for
 * places where the design wants the badge but no help text.
 */
const MetricInfoBadge = () => (
  <span
    aria-hidden="true"
    className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[#717680] text-[9px] font-semibold leading-none text-[#717680] cursor-help"
  >
    i
  </span>
);

/**
 * Hover-help tooltip for every dashboard card title.
 *
 * Each card gets a short, plain-English explanation of what the number
 * actually means and how to read it — no jargon, no marketing fluff. The
 * goal is the same as a friendly product-tour caption: in two breaths the
 * user understands what they're looking at and what they should do about it.
 */
const MetricInfoTooltip = ({ tip }: { tip: string }) => (
  <Tooltip delayDuration={150}>
    <TooltipTrigger asChild>
      <button type="button" className="focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded-full">
        <MetricInfoBadge />
        <span className="sr-only">More info</span>
      </button>
    </TooltipTrigger>
    <TooltipContent
      side="top"
      align="start"
      className="max-w-[280px] bg-white text-[#414651] text-[12px] leading-relaxed font-normal px-3 py-2 rounded-lg shadow-xl"
    >
      {tip}
    </TooltipContent>
  </Tooltip>
);

/**
 * Plain-English explanation per card title. Keep these short (~30-50 words),
 * answer "what is this and how do I read it", and avoid acronyms unless
 * already familiar to a marketer (SOV, AI Overview, etc.).
 */
const CARD_TOOLTIPS: Record<string, string> = {
  'Performance Across AI Models':
    'See how often your brand appears across AI platforms and which models mention you most.',
  'Top AI Search Prompts':
    'Total prompts tracked for your brand, including queries used to measure visibility across AI answers.',
  'Mentions':
    'Compares how often your brand is mentioned against competitor mentions across tracked AI prompts.',
  'Overall Sentiment':
    'Summarizes how AI responses describe your brand, based on positive, neutral, or negative language.',
  'Brand Accuracy Score':
    'Measures how correctly AI platforms describe your brand, services, positioning, and key information.',
  'AI Share of Voice':
    'Shows your brand’s share of visibility for this prompt compared with other mentioned brands.',
  'Opportunities to Outrank Competitors':
    'Suggested content ideas designed to help your brand appear more often than competitors in AI answers.',
};

/** Convenience — wraps a card title + tip badge inline. */
const CardTitleWithTip = ({ title, className }: { title: string; className?: string }) => (
  <div className="flex items-center gap-1.5">
    <CardTitle className={className ?? 'text-base font-semibold leading-[135%] tracking-normal text-[#535862]'}>
      {title}
    </CardTitle>
    {CARD_TOOLTIPS[title] ? <MetricInfoTooltip tip={CARD_TOOLTIPS[title]} /> : <MetricInfoBadge />}
  </div>
);

const TABLE_HEADER_TOOLTIPS: Record<string, string> = {
  Prompts: 'The AI search query used to check your brand visibility, sentiment, ranking, and competitor mentions.',
  Sentiment: 'Shows whether the AI response presents your brand in a positive, neutral, or negative way.',
  Ranking: 'Shows your brand’s rank among all brands mentioned in the AI response for that prompt.',
  Position: 'Placeholder tooltip copy for the position column. Replace this with final product copy.',
  'AI SOV': 'Shows your brand’s share of visibility for this prompt compared with other mentioned brands..',
  Competitors: 'Lists the competing brands that appear with your brand in the same AI response.',
  Action: 'Track prompt or draft content to improve visibility for that query.',
};

const TABLE_HEADER_TOOLTIPS_RESOLVED: Record<string, string> = {
  ...TABLE_HEADER_TOOLTIPS,
  'AI SOV': 'Shows how visible your brand is within this specific prompt compared with other brands mentioned in the response.',
};

type TableHeaderWithTipProps = {
  label: keyof typeof TABLE_HEADER_TOOLTIPS;
  align?: 'left' | 'right';
  showSortArrow?: boolean;
};

const TableHeaderWithTip = ({ label, align = 'left', showSortArrow = false }: TableHeaderWithTipProps) => (
  <div className={cn('flex items-center gap-1', align === 'right' && 'justify-end')}>
    <span>{label}</span>
    <MetricInfoTooltip tip={TABLE_HEADER_TOOLTIPS_RESOLVED[label]} />
    {showSortArrow ? <ArrowUp className="h-3 w-3 text-slate-600" /> : null}
  </div>
);

const CHART_TOOLTIPS: Record<string, string> = {
  Citations: 'Monitor citation trends across AI models and see whether your sources are gaining authority.',
  'Mentions rate trend': 'Shows how frequently your brand is mentioned in AI responses over the selected time period.',
};

const CHART_TOOLTIPS_RESOLVED: Record<string, string> = {
  ...CHART_TOOLTIPS,
  'Share of Voice': 'Track how your brand’s AI visibility changes over time against selected competitors.',
};

const MetricCard = ({ card }: { card: MetricCardData }) => (
  <Card
    className={cn(
      'rounded-xl border border-[#D5D7DA] bg-white shadow-[0_1px_2px_0_#1018280D]',
      card.kind === 'modelPerformance' ? 'h-full sm:col-span-2 xl:col-span-1 xl:row-span-2 xl:min-h-[310px]' : 'h-full',
    )}
  >
    <CardContent
      className={cn(
        'flex flex-col p-4 sm:p-6',
        card.kind === 'modelPerformance'
          ? 'gap-3 sm:gap-4 md:gap-5 xl:gap-[34px] p-4 sm:p-5 xl:min-h-[310px]'
          : card.kind === 'promptSummary'
            ? 'min-h-[130px] gap-4 p-5 sm:p-6'
            : card.kind === 'citations'
              ? 'min-h-[228px] gap-5'
              : 'min-h-[112px] gap-3.5 p-4 sm:p-5',
      )}
    >
      <CardTitleWithTip title={card.title} />

      {card.kind === 'modelPerformance' ? (
        <div className="flex flex-1 flex-col gap-3 sm:gap-3.5 md:gap-4 xl:gap-[45px] pt-0.5">
          {card.details.map((item) => (
            <div
              key={item.label}
              className="grid grid-cols-[minmax(0,88px)_minmax(0,1fr)_auto] items-center gap-2.5 sm:grid-cols-[minmax(0,104px)_minmax(0,1fr)_auto]"
            >
              <div className="flex min-w-0 items-center gap-2">
                {item.iconSrc ? <img src={item.iconSrc} alt="" className="h-4 w-4 shrink-0 object-contain" /> : null}
                <span className="truncate text-[12px] font-medium leading-none text-[#535862]">{item.label}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[#D0D5DD]">
                <div
                  className="h-full rounded-full bg-[#8AA4E8]"
                  style={{ width: `${item.barWidth ?? 0}%` }}
                />
              </div>
              <span className="min-w-[20px] text-right text-[12px] font-medium tabular-nums text-[#2F6BFF]">
                {item.value}
              </span>
            </div>
          ))}
        </div>
      ) : card.kind === 'promptSummary' ? (
        <div className="mt-1 grid flex-1 grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8">
          {card.details.map((item) => (
            <div key={item.label} className="min-w-0">
              <p className="text-[14px] font-semibold leading-[150%] tracking-normal text-[#535862]">{item.label}</p>
              <p className="mt-2 text-[27px] font-semibold leading-none tracking-normal text-[#3393F2]">
                {item.value}
              </p>
            </div>
          ))}
        </div>
      ) : card.kind === 'citations' ? (
        <div className="grid flex-1 grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-2">
          {card.details.map((item) => (
            <div key={item.label} className="min-w-0">
              <p className="text-sm font-semibold leading-[150%] tracking-normal text-[#535862]">{item.label}</p>
              <div className="mt-2 flex items-start gap-3">
                {item.iconSrc ? <img src={item.iconSrc} alt="" className="h-6 w-6 shrink-0 object-contain" /> : null}
                <span className="text-[27px] font-semibold leading-[1] tracking-normal text-[#3393F2]">
                  {item.value}
                </span>
              </div>
              <p className="mt-1 text-[10px] font-normal leading-[150%] tracking-normal text-[#717680]">
                Pages <span className="text-[#3393F2]">{item.subValue ?? '1'}</span>
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid flex-1 grid-cols-2 gap-4">
          {card.details.map((item) => (
            <div key={item.label} className="min-w-0">
              <p className="text-sm font-semibold leading-[150%] tracking-normal text-[#535862]">{item.label}</p>
              <p className="mt-2 text-[27px] font-semibold leading-[1] tracking-normal text-[#3393F2]">
                {item.value}
              </p>
            </div>
          ))}
        </div>
      )}
    </CardContent>
  </Card >
);

const ModelComparisonGrid = ({ results }: { results: any[] }) => {
  const metrics = [
    { label: 'Domain Presence', key: 'presence', type: 'badge' },
    { label: 'Overall Score', key: 'displayOverall', type: 'number' },
    { label: 'Relevance', key: 'displayRelevance', type: 'number' },
    { label: 'Accuracy', key: 'displayAccuracy', type: 'number' },
    { label: 'Sentiments', key: 'displaySentiment', type: 'number' }
  ];

  return (
    <div className="flex flex-col gap-2 lg:px-4 lg:pt-3 lg:pb-4">
      <div className="flex items-center min-h-9 px-1">
        <h4 className="text-[16px] sm:text-[18px] font-medium text-slate-900">Compare Model response</h4>
      </div>
      <div className="overflow-hidden rounded-none border border-slate-300 bg-white shadow-sm min-h-[280px] h-auto lg:h-[320px]">
        <div className="overflow-x-auto lg:h-full">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-slate-300">
                <th className="bg-white text-[12px] font-medium text-slate-500 py-4 px-4 text-center border-r border-slate-200 w-[160px]">
                  Models
                  Models
                </th>
                {metrics.map((metric) => (
                  <th key={metric.key} className="py-4 px-4 border-r border-slate-200 last:border-r-0">
                    <span className="text-[12px] font-medium text-slate-700 whitespace-nowrap">{metric.label}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.id} className="border-b border-slate-200 last:border-b-0">
                  <td className="bg-slate-50 py-4 px-4 text-center border-r border-slate-200">
                    <div className="flex items-center justify-center gap-2">
                      {getModelIconNode(r.model, 'sm')}
                      <span className="text-[12px] font-medium text-slate-700 whitespace-nowrap">{getModelLabel(r.model)}</span>
                    </div>
                  </td>
                  {metrics.map((metric) => (
                    <td key={metric.key} className="text-center py-4 px-4 border-r border-slate-200 last:border-r-0">
                      {metric.type === 'badge' ? (
                        <div className="flex justify-center">
                          <span className={`${r.presence > 0 ? 'bg-[#f0fdf4] text-[#16a34a] border-[#dcfce7]' : 'bg-gray-50 text-gray-500 border-slate-200'} border text-[10px] font-medium px-3 py-1 rounded-full whitespace-nowrap`}>
                            {r.presence > 0 ? 'Mentioned' : 'Not Mentioned'}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[13px] font-normal text-slate-500">
                          {r[metric.key] !== null && r[metric.key] !== undefined
                            ? Number(r[metric.key]).toFixed(1)
                            : 'N/A'}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const AIResponseViewer = ({
  results,
  selectedModel,
  setSelectedModel
}: {
  results: any[],
  selectedModel: string,
  setSelectedModel: (m: string) => void
}) => {
  const activeResult = results.find(r => r.model === selectedModel) || results[0];

  if (!activeResult) return null;

  const competitorMentions = Array.isArray(activeResult.competitorMentions)
    ? activeResult.competitorMentions
    : [];

  return (
    <div className="flex flex-col gap-2 lg:px-4 lg:pt-3 lg:pb-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between min-h-9 px-1">
        <h4 className="text-[16px] sm:text-[18px] font-medium text-slate-900">AI Response</h4>
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="text-[11px] text-gray-400 font-medium">Select Model</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-9 min-w-[138px] sm:min-w-[150px] justify-between gap-2 rounded-lg border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50">
                <span className="flex items-center gap-2">
                  {getModelIconNode(selectedModel, 'sm')}
                  {getModelLabel(selectedModel)}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[180px] p-1">
              {results.map((r) => (
                <DropdownMenuItem
                  key={r.id}
                  onClick={() => setSelectedModel(r.model)}
                  className={`flex items-center gap-2 px-2 py-2 text-xs font-medium cursor-pointer ${r.model === selectedModel ? 'bg-gray-50' : ''
                    }`}
                >
                  {getModelIconNode(r.model, 'sm')}
                  {getModelLabel(r.model)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Card className="flex flex-col rounded-none border border-slate-300 bg-white shadow-sm min-h-[320px] h-auto lg:h-[320px] overflow-hidden">

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1.25fr_0.75fr] divide-y lg:divide-y-0 lg:divide-x divide-slate-100 min-h-0">
          {/* Left Column: Response Content (INTERNAL SCROLL HERE) */}
          <div className="flex flex-col min-h-0 bg-slate-50/50 overflow-hidden">
            <div className="flex-1 overflow-y-auto px-8 py-7 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
              <h3 className="text-[20px] font-medium text-slate-800 leading-tight mb-4 tracking-tight">
                {activeResult.phrase || 'Analysis Result'}
              </h3>
              <div className="prose prose-slate prose-sm max-w-none prose-headings:font-semibold prose-headings:text-slate-800 prose-h1:text-[18px] prose-h2:text-[15px] prose-h3:text-[14px] prose-p:text-slate-600/95 prose-p:leading-relaxed prose-strong:text-slate-800 prose-strong:font-semibold prose-ul:list-disc prose-ul:pl-5 prose-ol:pl-5 prose-li:text-slate-600/95 prose-li:my-0.5 prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline prose-code:rounded prose-code:bg-slate-100 prose-code:px-1 prose-code:py-0.5 prose-code:text-[12px] prose-code:before:content-[''] prose-code:after:content-[''] prose-pre:rounded-md prose-pre:bg-slate-900 prose-pre:text-slate-100">
                <ReactMarkdown>{activeResult.response || 'No response available.'}</ReactMarkdown>
              </div>

              {competitorMentions.length > 0 && (
                <div className="mt-7 border-t border-slate-200 pt-5">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Competitors mentioned
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {competitorMentions.map((mention: any, idx: number) => (
                      <CompetitorPill key={`${mention?.brand || mention?.name || idx}-${idx}`} mention={mention} />
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-7 flex flex-wrap items-center gap-2 pb-2">
                {Array.isArray(activeResult.sources) && activeResult.sources.length > 0 ? (
                  activeResult.sources.slice(0, 3).map((source: string, idx: number) => {
                    const favicon = getFaviconUrl(source);
                    return (
                      <a
                        key={idx}
                        href={getHref(source)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-50/50 border border-blue-100/50 text-[10.5px] font-medium text-blue-600 hover:bg-blue-100/80 transition-all group"
                      >
                        {favicon ? (
                          <img
                            src={favicon}
                            alt=""
                            className="h-3.5 w-3.5 rounded-full border border-white bg-white object-cover"
                            loading="lazy"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : null}
                        {getDisplayUrl(source)}
                        <ExternalLink className="h-2.5 w-2.5 opacity-60 group-hover:opacity-100" />
                      </a>
                    );
                  })
                ) : (
                  <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400">
                    System Analysis
                    <ShieldCheck className="h-3 w-3" />
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Citations & Evidence (FIXED OR INDEPENDENT SCROLL) */}
          <div className="bg-white flex flex-col min-h-0 overflow-y-auto px-5 py-6 scrollbar-thin scrollbar-thumb-slate-200">
            <CitationSidebar activeResult={activeResult} />
          </div>
        </div>
      </Card>
    </div>
  );
};

const ExpandedDetails = ({ results }: { results: any[] }) => {
  // Deduplicate and average results by model
  const processedResults = useMemo(() => {
    const grouped: Record<string, any> = {};
    results.forEach(r => {
      if (!r || !r.model) return;
      if (!grouped[r.model]) {
        grouped[r.model] = {
          ...r,
          _count: 1,
          _mentionCount: r.presence > 0 ? 1 : 0,
          relevance: r.presence > 0 ? (r.relevance || 0) : 0,
          accuracy: r.presence > 0 ? (r.accuracy || 0) : 0,
          sentiment: r.presence > 0 ? (r.sentiment || 0) : 0,
          overall: r.presence > 0 ? (r.overall || 0) : 0,
        };
      } else {
        const g = grouped[r.model];
        g.presence = (g.presence || 0) + (r.presence || 0);
        if (r.presence > 0) {
          g.relevance = (g.relevance || 0) + (r.relevance || 0);
          g.accuracy = (g.accuracy || 0) + (r.accuracy || 0);
          g.sentiment = (g.sentiment || 0) + (r.sentiment || 0);
          g.overall = (g.overall || 0) + (r.overall || 0);
          g._mentionCount = (g._mentionCount || 0) + 1;
        }
        g._count += 1;
      }
    });

    return Object.values(grouped).map((g: any) => {
      // Phase 1: Comprehensive Aggregation
      // Collect all unique sources across all result chunks for this model
      const allSources: string[] = [];
      const allCitations: any[] = [];
      const allMentions: any[] = [];
      const seenMentionKeys = new Set<string>();

      results.forEach(r => {
        if (r.model !== g.model) return;

        // Handle competitor mentions (from scorer JSON)
        const rawMentions = Array.isArray(r.competitorMentions)
          ? r.competitorMentions
          : Array.isArray(r.competitorMentions?.mentions)
            ? r.competitorMentions.mentions
            : [];
        rawMentions.forEach((m: any) => {
          if (!m) return;
          const brand = (m.brand || m.name || '').toString().trim();
          if (!brand) return;
          const key = brand.toLowerCase();
          if (seenMentionKeys.has(key)) return;
          seenMentionKeys.add(key);
          allMentions.push(m);
        });

        // Helper to validate basic URL structure (must have a dot, no spaces)
        const isValidUrl = (str: string) => {
          if (!str) return false;
          const s = String(str);
          return s.startsWith('http') && s.includes('.') && !s.includes(' ');
        };

        // Handle sources (flat URLs)
        if (r.sources) {
          if (Array.isArray(r.sources)) {
            r.sources.forEach((s: any) => isValidUrl(s) && !allSources.includes(String(s)) && allSources.push(String(s)));
          } else if (typeof r.sources === 'string' && isValidUrl(r.sources) && !allSources.includes(r.sources)) {
            allSources.push(r.sources);
          }
        }

        // Handle citations - Preserving structured objects
        const rawCitations = Array.isArray(r.citations) ? r.citations : [];
        rawCitations.forEach((c: any) => {
          if (!c) return;
          const url = typeof c === 'object' ? c.url : String(c);
          if (!isValidUrl(url)) return;

          // Add to allSources for global source tracking if not present
          if (!allSources.includes(url)) allSources.push(url);

          // Deduplicate allCitations by URL while merging metadata
          const existingIdx = allCitations.findIndex((existing: any) =>
            (typeof existing === 'object' ? existing.url : existing) === url
          );

          if (existingIdx === -1) {
            allCitations.push(typeof c === 'object' ? c : { url, title: url });
          } else {
            // If already exists, try to enrich with better metadata if current 'c' is an object
            if (typeof c === 'object' && typeof allCitations[existingIdx] === 'object') {
              const existing = allCitations[existingIdx];
              if (!existing.title && c.title) existing.title = c.title;
              if (!existing.citedText && c.citedText) existing.citedText = c.citedText;
              if (!existing.snippet && c.snippet) existing.snippet = c.snippet;
            }
          }
        });
      });

      const presence = g.presence / g._count;
      const mentionCount = g._mentionCount || 0;
      const mentioned = mentionCount > 0;
      const displayRelevance = mentioned ? g.relevance / mentionCount : null;
      const displayAccuracy = mentioned ? g.accuracy / mentionCount : null;
      const displaySentiment = mentioned ? g.sentiment / mentionCount : null;
      const overallInputs = [displayRelevance, displayAccuracy, displaySentiment].filter(
        (score): score is number => typeof score === 'number' && Number.isFinite(score),
      );

      return {
        ...g,
        presence,
        mentioned,
        displayRelevance,
        displayAccuracy,
        displaySentiment,
        displayOverall: overallInputs.length > 0
          ? overallInputs.reduce((sum, score) => sum + score, 0) / overallInputs.length
          : mentioned ? g.overall / mentionCount : null,
        sources: allSources.length > 0 ? allSources : null,
        citations: allCitations.length > 0 ? allCitations : null,
        competitorMentions: allMentions.length > 0 ? allMentions : []
      };
    });
  }, [results]);

  const [selectedModel, setSelectedModel] = useState(processedResults[0]?.model || '');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[0.62fr_1.38fr] lg:divide-x lg:divide-slate-300">
      <ModelComparisonGrid results={processedResults} />
      <AIResponseViewer
        results={processedResults}
        selectedModel={selectedModel}
        setSelectedModel={setSelectedModel}
      />
    </div>
  );
};

const getDisplayUrl = (s: string) => {
  try {
    let text = s;
    if (s.startsWith('http')) {
      const url = new URL(s);
      text = url.hostname.replace('www.', '');
      if (url.hostname.includes('google.com')) {
        text = url.searchParams.get('q') || text;
      }
    }
    return decodeURIComponent(text).length > 25
      ? decodeURIComponent(text).substring(0, 25) + '...'
      : decodeURIComponent(text);
  } catch {
    return decodeURIComponent(s).length > 25
      ? decodeURIComponent(s).substring(0, 25) + '...'
      : decodeURIComponent(s);
  }
};

const getHref = (s: string) => {
  if (!s) return '#';

  let target = s;
  if (!s.startsWith('http')) {
    // If it looks like a domain, prepend https
    if (s.includes('.') && !s.includes(' ') && !s.includes('%20')) {
      target = `https://${s}`;
    } else {
      // Otherwise search
      return `https://www.google.com/search?q=${encodeURIComponent(decodeURIComponent(s))}`;
    }
  }

  // Deep Validation: Catch junk URLs like https://domino's pizza
  try {
    const url = new URL(target);
    if (url.hostname.includes(' ') || url.hostname.includes('%20') || !url.hostname.includes('.')) {
      throw new Error('Invalid hostname');
    }
    return target;
  } catch {
    // If invalid URL structure, strip the protocol and treat as search
    const query = s.includes('://') ? s.split('://')[1] : s;
    return `https://www.google.com/search?q=${encodeURIComponent(decodeURIComponent(query))}`;
  }
};

const CitationSidebar = ({ activeResult }: { activeResult: any }) => {
  const citations = useMemo(() => {
    // Primary: use structured citations if available
    if (activeResult?.citations && Array.isArray(activeResult.citations) && activeResult.citations.length > 0) {
      return activeResult.citations;
    }
    // Fallback: build cards from sources if citations is empty
    if (activeResult?.sources && Array.isArray(activeResult.sources) && activeResult.sources.length > 0) {
      return activeResult.sources.map((s: any) => ({
        url: typeof s === 'string' ? s : s.url,
        title: getDisplayUrl(typeof s === 'string' ? s : s.url)
      }));
    }
    return [];
  }, [activeResult]);

  if (citations.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-gray-50/50 p-6 flex flex-col items-center text-center justify-center min-h-[220px]">
        <Target className="h-6 w-6 text-gray-300 mb-2" />
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">No Evidence Found</p>
        <p className="mt-2 text-[10px] text-gray-400 max-w-[160px] leading-relaxed">
          No specific citations or verified sources were returned for this analysis.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 max-h-[280px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Sources cited
        </p>
        <span className="text-[10px] font-medium text-slate-400">{citations.length}</span>
      </div>

      {citations.slice(0, 4).map((citation: any, idx: number) => {
        const url = typeof citation === 'object' ? citation.url : String(citation);
        const host = getHostFromAnyUrl(url) || getDisplayUrl(url);
        const favicon = getFaviconUrl(url);
        const title = (typeof citation === 'object' ? (citation.title || citation.hostname) : null) || host;
        const text = typeof citation === 'object' ? (citation.citedText || citation.snippet || citation.content) : null;
        const isDirect = typeof citation === 'object'
          && (citation.type || '').toString().toLowerCase() === 'direct';
        const typeLabel = isDirect ? 'Direct' : 'Indirect';

        return (
          <a
            key={idx}
            href={getHref(url)}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm transition-all hover:border-slate-300 hover:shadow-md group flex flex-col gap-1.5"
          >
            <div className="flex items-center gap-2">
              {favicon ? (
                <img
                  src={favicon}
                  alt={host}
                  className="h-5 w-5 flex-shrink-0 rounded-full border border-slate-200 bg-white object-cover"
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <Globe2 className="h-5 w-5 flex-shrink-0 text-slate-400" />
              )}
              <span className="truncate text-[10.5px] font-medium text-slate-500">{host}</span>
              <span
                className={`ml-auto inline-flex flex-shrink-0 items-center rounded-full px-2 py-0.5 text-[9px] font-semibold ${isDirect
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-blue-50 text-blue-700'
                  }`}
              >
                {typeLabel}
              </span>
            </div>

            <h5 className="text-[12.5px] font-semibold text-slate-800 leading-snug line-clamp-2">
              {title}
            </h5>

            {text ? (
              <p className="text-[10.5px] text-slate-500 leading-relaxed line-clamp-3">
                {text}
              </p>
            ) : null}

            <div className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-blue-600">
              Visit source
              <ExternalLink className="h-2.5 w-2.5" />
            </div>
          </a>
        );
      })}

      {citations.length > 4 && (
        <div className="text-center py-1">
          <p className="text-[9.5px] font-medium text-slate-400 italic">
            + {citations.length - 4} more sources cited
          </p>
        </div>
      )}
    </div>
  );
};

type PromptTableProps = {
  data: any[];
  selectedRowIds: Set<string>;
  onToggleRow: (id: string) => void;
  onSetSelectedRows: (ids: Set<string>) => void;
  onOpenWorksheetModal: (singleRowId?: string) => void;
  title?: string;
  reportRunId?: number | null;
  /** Real Domain.id. Required for the Add & Analyze button to call
   *  POST /api/wizard/domain/:id/prompts/analyze. Null when the report
   *  hasn't loaded yet — in that case the button stays disabled. */
  domainId?: number | null;
};

export const PromptTable = ({
  data,
  selectedRowIds,
  onToggleRow,
  onSetSelectedRows,
  onOpenWorksheetModal,
  title = 'Your Top Performing Prompts',
  reportRunId = null,
  domainId,
}: PromptTableProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const selectedCount = selectedRowIds.size;
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Prompt rows whose full text is revealed (click the prompt to toggle).
  const [openPhrases, setOpenPhrases] = useState<Set<string>>(new Set());
  const togglePhrase = (id: string) =>
    setOpenPhrases((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const [tableMetric, setTableMetric] = useState<string | null>(null);
  const [showAllQueries, setShowAllQueries] = useState(false);
  const trackedPromptsQuery = useTrackedPrompts<{ prompts?: PromptTableRow[] }>(domainId ?? null);
  const trackedPromptRows = useMemo(
    () => (Array.isArray(trackedPromptsQuery.data?.prompts) ? trackedPromptsQuery.data!.prompts : []),
    [trackedPromptsQuery.data],
  );
  const trackedRowsByRawId = useMemo(() => {
    const map = new Map<number, PromptTableRow>();
    for (const row of trackedPromptRows) {
      if (typeof row.rawId === 'number') map.set(row.rawId, row);
    }
    return map;
  }, [trackedPromptRows]);

  // Add & Analyze state.
  //   - `analyzeText`     the input value
  //   - `analyzing`       button → spinner + disabled while in flight
  //   - `pendingRows`     optimistic skeleton rows at the top of the
  //                       table during the request
  //   - `newlyAnalyzedRows` permanent newest-on-top list, dedupe'd
  //                         against parent /report data by rawId
  const [analyzeText, setAnalyzeText] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [newlyAnalyzedRows, setNewlyAnalyzedRows] = useState<any[]>([]);
  const [pendingRows, setPendingRows] = useState<
    Array<{ id: string; phrase: string }>
  >([]);
  const [trackOverrides, setTrackOverrides] = useState<Record<string, boolean>>({});
  const [trackPending, setTrackPending] = useState<Record<string, boolean>>({});
  const [bulkPending, setBulkPending] = useState(false);

  useEffect(() => {
    setTrackOverrides({});
    setTrackPending({});
    setBulkPending(false);
  }, [domainId]);

  const invalidateTracking = useCallback(() => {
    if (domainId == null) return;
    queryClient.invalidateQueries({ queryKey: aiResultsKeys.trackedPrompts(domainId) });
    queryClient.invalidateQueries({ queryKey: aiResultsKeys.report(domainId, reportRunId) });
  }, [domainId, queryClient, reportRunId]);

  const mergeTrackedRow = useCallback(
    (row: any): PromptTableRow => {
      const tracked = typeof row?.rawId === 'number' ? trackedRowsByRawId.get(row.rawId) : undefined;
      const merged: PromptTableRow = tracked
        ? {
          ...row,
          isTracked: tracked.isTracked ?? true,
          lastTestedAt: tracked.lastTestedAt ?? row.lastTestedAt ?? null,
          nextTestAt: tracked.nextTestAt ?? row.nextTestAt ?? null,
          weekTrend: tracked.weekTrend ?? row.weekTrend ?? null,
        }
        : row;

      return {
        ...merged,
        isTracked: trackOverrides[merged.id] ?? merged.isTracked ?? false,
      };
    },
    [trackOverrides, trackedRowsByRawId],
  );

  const isRowTracked = useCallback(
    (row: PromptTableRow) => trackOverrides[row.id] ?? row.isTracked ?? false,
    [trackOverrides],
  );

  const toggleTracking = useCallback(
    async (row: PromptTableRow, next: boolean) => {
      const keywordChildIds = row.type === 'keyword' ? row.childPromptIds ?? [] : [];
      const canToggle = row.type === 'prompt' ? row.rawId != null : keywordChildIds.length > 0;
      if (domainId == null || !canToggle || trackPending[row.id]) return;

      setTrackOverrides((p) => ({ ...p, [row.id]: next }));
      setTrackPending((p) => ({ ...p, [row.id]: true }));

      try {
        if (row.type === 'keyword') {
          await apiPatch<{ updated: number }>(
            `/wizard/domain/${domainId}/prompts/track`,
            { promptIds: keywordChildIds, tracked: next },
          );
        } else {
          await apiPatch<{ prompt: { id: number; isTracked: boolean } }>(
            `/wizard/domain/${domainId}/prompts/${row.rawId}/track`,
            { tracked: next },
          );
        }
        invalidateTracking();
        toast({
          title: next ? 'Tracking weekly' : 'Tracking stopped',
          description: next
            ? 'This prompt is re-tested automatically every week.'
            : 'Removed from weekly tests.',
        });
      } catch (err) {
        setTrackOverrides((p) => {
          const copy = { ...p };
          delete copy[row.id];
          return copy;
        });
        toast({
          title: "Couldn't update tracking",
          description: err instanceof Error ? err.message : 'Try again.',
          variant: 'destructive',
        });
      } finally {
        setTrackPending((p) => {
          const copy = { ...p };
          delete copy[row.id];
          return copy;
        });
      }
    },
    [domainId, invalidateTracking, trackPending],
  );

  const bulkTrack = useCallback(
    async (rows: PromptTableRow[], next: boolean) => {
      if (domainId == null || bulkPending) return;

      const promptIds = Array.from(
        new Set(
          rows.flatMap((r) =>
            r.type === 'prompt'
              ? (typeof r.rawId === 'number' ? [r.rawId] : [])
              : (r.childPromptIds ?? []),
          ),
        ),
      );
      if (promptIds.length === 0) return;

      setBulkPending(true);
      setTrackOverrides((p) => {
        const copy = { ...p };
        for (const r of rows) copy[r.id] = next;
        return copy;
      });

      try {
        await apiPatch<{ updated: number }>(
          `/wizard/domain/${domainId}/prompts/track`,
          { promptIds, tracked: next },
        );
        invalidateTracking();
        onSetSelectedRows(new Set());
        toast({
          title: next ? `Tracking ${promptIds.length} prompt${promptIds.length === 1 ? '' : 's'}` : 'Tracking stopped',
          description: next ? 'Re-tested automatically every week.' : 'Removed from weekly tests.',
        });
      } catch (err) {
        setTrackOverrides((p) => {
          const copy = { ...p };
          for (const r of rows) delete copy[r.id];
          return copy;
        });
        toast({
          title: "Couldn't update tracking",
          description: err instanceof Error ? err.message : 'Try again.',
          variant: 'destructive',
        });
      } finally {
        setBulkPending(false);
      }
    },
    [bulkPending, domainId, invalidateTracking, onSetSelectedRows],
  );

  const handleAnalyzePrompt = async () => {
    const text = analyzeText.trim();
    if (!text || analyzing) return;
    if (!domainId) {
      toast({
        title: 'No domain loaded',
        description: 'Wait for the report to finish loading before analyzing a prompt.',
        variant: 'destructive',
      });
      return;
    }
    const phrases = text
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    if (phrases.length === 0) return;

    const optimisticRows = phrases.map((phrase, idx) => ({
      id: `pending-${Date.now()}-${idx}`,
      phrase,
    }));
    setAnalyzing(true);
    setPendingRows((prev) => [...optimisticRows, ...prev]);
    try {
      const addedRows: any[] = [];
      for (const phrase of phrases) {
        const res = await apiPost<{
          runId: number;
          prompt: { id: number; keywordId: number | null; text: string };
          row: any;
        }>(`/wizard/domain/${domainId}/prompts/analyze`, { text: phrase });
        addedRows.push(res.row);
      }
      if (addedRows.length > 0) {
        setNewlyAnalyzedRows((prev) => [...addedRows.reverse(), ...prev]);
      }
      setAnalyzeText('');
      toast({
        title: 'Prompt analyzed',
        description:
          phrases.length === 1
            ? `Tracked across ${addedRows[0]?.results?.length ?? 3} model${(addedRows[0]?.results?.length ?? 3) === 1 ? '' : 's'}.`
            : `${addedRows.length} phrases analyzed successfully.`,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Could not analyze prompt. Try again.';
      toast({
        title: 'Analyze failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      const pendingIds = new Set(optimisticRows.map((p) => p.id));
      setPendingRows((prev) => prev.filter((p) => !pendingIds.has(p.id)));
      setAnalyzing(false);
    }
  };

  // ───────────────────────────────────────────────────────────────────────
  // Pagination. We replaced the prior "View all / Show less" toggle with
  // page-based controls so users can navigate large result sets in a
  // predictable way (Prev / Next / page indicator) rather than dumping
  // everything into one infinite-scrolling card.
  //
  //   PAGE_SIZE — fixed at 10 rows. Most dashboards converge on 10/25/50;
  //               10 is the smallest sane page that still feels useful.
  //   currentPage — 1-indexed.
  //
  // Filter/sort changes reset currentPage to 1 via the useEffect below.
  // ───────────────────────────────────────────────────────────────────────
  const PAGE_SIZE = 10;
  const [currentPage, setCurrentPage] = useState(1);

  // Full sorted/filtered list, before pagination. We split this from the
  // paginated `displayData` so we know `totalCount` for the pager.
  const fullSortedData = useMemo(() => {
    let items = [...data]
      .map(mergeTrackedRow)
      .filter((item) => item.type?.toLowerCase() === 'prompt');

    // Dedupe parent rows that match a row we just analyzed — the
    // newly-analyzed copy has the fresher result data and wins.
    const newRawIds = new Set(
      newlyAnalyzedRows
        .map((r) => r?.rawId)
        .filter((id): id is number => typeof id === 'number'),
    );
    if (newRawIds.size > 0) {
      items = items.filter(
        (item) => !(typeof item?.rawId === 'number' && newRawIds.has(item.rawId)),
      );
    }

    if (tableMetric) {
      const numericFor = (row: any): number => {
        switch (tableMetric) {
          case 'Sentiment': return Number(row?.avgSentiment ?? 0);
          case 'Position': {
            const rank = Number(row?.bestRank);
            return Number.isFinite(rank) && rank > 0 ? rank : Number.POSITIVE_INFINITY;
          }
          default: return 0;
        }
      };
      if (tableMetric === 'Alphabetical') {
        items.sort((a, b) =>
          String(a?.phrase ?? '').localeCompare(String(b?.phrase ?? ''), undefined, {
            sensitivity: 'base',
          }),
        );
      } else if (tableMetric === 'Alphabetical Z-A') {
        items.sort((a, b) =>
          String(b?.phrase ?? '').localeCompare(String(a?.phrase ?? ''), undefined, {
            sensitivity: 'base',
          }),
        );
      } else if (tableMetric === 'Position') {
        items.sort((a, b) => numericFor(a) - numericFor(b));
      } else {
        items.sort((a, b) => numericFor(b) - numericFor(a));
      }
    }

    // newlyAnalyzedRows pin to the top of the full list — they're the
    // freshest data the user just produced. We DON'T pin them above
    // the metric-sort (that would lie about the sort).
    if (!tableMetric) {
      return [...newlyAnalyzedRows.map(mergeTrackedRow), ...items];
    }
    return items;
  }, [data, tableMetric, newlyAnalyzedRows, mergeTrackedRow]);

  const totalCount = fullSortedData.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // Clamp currentPage if filter/sort shrinks the list below it. Also
  // reset to page 1 when filter/sort changes so the user lands on the
  // top of the new view.
  useEffect(() => {
    setCurrentPage(1);
  }, [tableMetric]);
useEffect(() => {
  if (currentPage > totalPages) setCurrentPage(totalPages);
}, [currentPage, totalPages]);

const displayData = useMemo(() => {
  const start = (currentPage - 1) * PAGE_SIZE;
  return fullSortedData.slice(start, start + PAGE_SIZE);
}, [fullSortedData, currentPage]);
const selectedRows = useMemo(
  () => fullSortedData.filter((row) => selectedRowIds.has(row.id)),
  [fullSortedData, selectedRowIds],
);
const visibleRowIds = useMemo(
  () => displayData.map((row) => String(row.id)),
  [displayData]
);
const allVisibleSelected =
  visibleRowIds.length > 0 && visibleRowIds.every((id) => selectedRowIds.has(id));
// Reference unused legacy state so the lint stays clean — showAllQueries
// / setShowAllQueries are kept for now in case other branches rely on
// them; once this PR ships they can be removed entirely.
void showAllQueries; void setShowAllQueries;

return (
  <Card className="rounded-xl border-slate-300 shadow-sm overflow-hidden">
    <CardHeader className="space-y-6 px-6 pt-6 pb-4">
      <div className="flex flex-col gap-1">
        <CardTitle className="text-xl font-bold text-[#1e293b]">{title}</CardTitle>
        <p className="text-sm text-slate-500">
          Compare how AI models respond, cite sources, and identify competitors across search queries
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Left side: Search and Add & Analyze */}
        <div className="flex items-center gap-2 flex-1 min-w-0 max-w-[450px]">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Enter your custom prompt to analyze"
              value={analyzeText}
              onChange={(e) => setAnalyzeText(e.target.value)}
              disabled={analyzing}
              title="Add one or more prompts. Use commas to analyze multiple prompts at once."
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleAnalyzePrompt();
                }
              }}
              className="h-10 w-full placeholder:text-xs rounded-lg border border-slate-300 pl-10 pr-4 text-sm outline-none focus:ring-1 focus:ring-slate-300 transition-all placeholder:text-gray-300 disabled:bg-slate-50 disabled:cursor-not-allowed"
            />
          </div>
          <Button
            type="button"
            onClick={() => void handleAnalyzePrompt()}
            disabled={analyzing || !analyzeText.trim() || !domainId}
            className="h-10 bg-[#2d3748] text-white hover:bg-[#1a202c] gap-2 rounded-lg px-4 shrink-0 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {analyzing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm font-medium">Analyzing…</span>
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                <span className="text-sm font-medium">Add &amp; Analyze</span>
              </>
            )}
          </Button>
        </div>

        {/* Right side: Icons and Filters */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 mr-2">
            <Button variant="outline" size="icon" className="h-9 w-9 border-slate-300 bg-gray-50/50 hover:bg-gray-100 rounded-lg">
              <Languages className="h-4 w-4 text-slate-600" />
            </Button>
            <Button variant="outline" size="icon" className="h-9 w-9 border-slate-300 bg-gray-50/50 hover:bg-gray-100 rounded-lg">
              <RefreshCw className="h-4 w-4 text-slate-600" />
            </Button>
            <Button variant="outline" size="icon" className="h-9 w-9 border-slate-300 bg-gray-50/50 hover:bg-gray-100 rounded-lg">
              <Download className="h-4 w-4 text-slate-600" />
            </Button>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-9 gap-2 border-slate-300 text-slate-600 rounded-lg px-3">
                <BarChart3 className="h-4 w-4" />
                <span className="text-sm font-medium">{tableMetric ? `Sort: ${tableMetric}` : 'Sort'}</span>
                <ChevronDown className="h-4 w-4 opacity-50 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[180px]">
              <DropdownMenuItem onClick={() => setTableMetric(null)}>Default order</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setTableMetric('Alphabetical')}>Alphabetical A-Z</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTableMetric('Alphabetical Z-A')}>Alphabetical Z-A</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTableMetric('Sentiment')}>Sentiment</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTableMetric('Position')}>Position</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            type="button"
            disabled={selectedCount === 0}
            onClick={() => onOpenWorksheetModal()}
            className={cn(
              'h-9 gap-2 text-white border-none rounded-lg px-4 transition-all ml-1',
              selectedCount === 0
                ? 'bg-[#94a3b8] hover:bg-[#94a3b8] cursor-not-allowed'
                : 'bg-[#2D4059] hover:bg-[#24364d]'
            )}
          >
            <LayoutGrid className="h-4 w-4" />
            <span className="text-sm font-medium">
              Add to Worksheet{selectedCount > 0 ? ` (${selectedCount})` : ''}
            </span>
          </Button>

          <Button
            type="button"
            onClick={() => void bulkTrack(selectedRows.length > 0 ? selectedRows : fullSortedData, true)}
            disabled={bulkPending || domainId == null || fullSortedData.length === 0}
            className="h-[38px] gap-2 rounded-lg border-none bg-[#4b6eb8] px-4 text-white shadow-none transition-all hover:bg-[#3f5d9c] disabled:opacity-60"
          >
            {bulkPending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : selectedRows.length > 0
                ? <Sparkles className="h-4 w-4" />
                : <ShieldCheck className="h-4 w-4" />
            }
            <span className="text-[13px] font-medium">
              {selectedRows.length > 0
                ? `Track selected (${selectedRows.length})`
                : 'Track all'}
            </span>
          </Button>
        </div>
      </div>
    </CardHeader>

    <CardContent className="px-0 pb-3">
      <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-gray-200">
        <Table>
          <TableHeader>
            <TableRow className="border-b-0 bg-[#f1f1f1] hover:bg-[#f1f1f1]">
              <TableHead className="w-8 px-4 rounded-tl-lg">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={() => {
                    const next = new Set(selectedRowIds);
                    if (allVisibleSelected) {
                      visibleRowIds.forEach((id) => next.delete(id));
                    } else {
                      visibleRowIds.forEach((id) => next.add(id));
                    }
                    onSetSelectedRows(next);
                  }}
                  aria-label="Select all visible prompts"
                  className="h-3.5 w-3.5 rounded border-gray-300 accent-blue-600"
                />
              </TableHead>
              <TableHead className="px-2 text-[11px] font-semibold text-[#31415f]">
                <TableHeaderWithTip label="Prompts" showSortArrow />
              </TableHead>
              <TableHead className="px-2 text-[11px] font-semibold text-[#31415f]">
                <TableHeaderWithTip label="Sentiment" showSortArrow />
              </TableHead>
              <TableHead className="px-2 text-[11px] font-semibold text-[#31415f]">
                <TableHeaderWithTip label="Ranking" showSortArrow />
              </TableHead>
              <TableHead className="px-2 text-[11px] font-semibold text-[#31415f]">
                <TableHeaderWithTip label="Position" showSortArrow />
              </TableHead>
              <TableHead className="px-2 text-[11px] font-semibold text-[#31415f]">
                <TableHeaderWithTip label="AI SOV" showSortArrow />
              </TableHead>
              <TableHead className="px-2 text-[11px] font-semibold text-[#31415f]">
                <TableHeaderWithTip label="Competitors" showSortArrow />
              </TableHead>
              <TableHead className="px-4 text-right text-[11px] font-semibold text-[#31415f] rounded-tr-lg">
                <TableHeaderWithTip label="Action" align="right" />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/*
                Optimistic skeleton rows for prompts currently being
                analyzed via the Add & Analyze button. Sits above the
                real rows so the user sees immediate feedback. Replaced
                by a real row once the backend returns (the real row is
                prepended via `newlyAnalyzedRows`).
              */}
            {pendingRows.map((p) => (
              <TableRow
                key={p.id}
                className="border-b border-slate-200 bg-slate-50/60"
              >
                <TableCell className="w-8 px-4 py-3">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
                </TableCell>
                <TableCell className="max-w-[340px] px-2 py-3">
                  <div className="flex flex-col gap-1">
                    <span className="truncate text-[12px] italic text-slate-500">
                      {p.phrase}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Asking ChatGPT, Claude, and Gemini…
                    </span>
                  </div>
                </TableCell>
                <TableCell colSpan={6} className="px-2 py-3">
                  <div className="flex items-center gap-2 text-[12px] font-light text-slate-400">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Running across models — typically 15–30s
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {displayData.map((row) => (
              <Fragment key={row.id}>
                <TableRow
                  key={row.id}
                  className={`group transition-all duration-200 border-b hover:bg-slate-50/80 ${expandedId === row.id ? 'bg-slate-50 shadow-sm border-slate-300' : 'border-slate-200'
                    }`}
                >
                  <TableCell className="w-8 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedRowIds.has(String(row.id))}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => onToggleRow(String(row.id))}
                      aria-label={`Select ${row.phrase ?? 'row'}`}
                      className="h-3.5 w-3.5 rounded border-gray-300 accent-blue-600"
                    />
                  </TableCell>
                  <TableCell className="max-w-[340px] px-2 py-2">
                    <div className="flex flex-col gap-1">
                      {row.type === 'keyword' ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            aria-label={expandedId === row.id ? "Collapse row details" : "Expand row details"}
                            aria-expanded={expandedId === row.id}
                            onClick={(event) => {
                              event.stopPropagation();
                              setExpandedId(expandedId === row.id ? null : row.id);
                            }}
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] border border-slate-200 bg-[#f8f9fc] text-slate-500 transition-colors hover:bg-slate-100"
                          >
                            {expandedId === row.id ? (
                              <ChevronDown className="h-[14px] w-[14px]" />
                            ) : (
                              <ChevronRight className="h-[14px] w-[14px]" />
                            )}
                          </button>
                          <span
                            onClick={(e) => { e.stopPropagation(); togglePhrase(String(row.id)); }}
                            title={openPhrases.has(String(row.id)) ? 'Click to collapse' : 'Click to show full prompt'}
                            className={cn(
                              'cursor-pointer text-[12px] text-[#58606f] italic',
                              openPhrases.has(String(row.id)) ? 'whitespace-normal break-words' : 'truncate'
                            )}
                          >
                            {row.phrase}
                          </span>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              aria-label={expandedId === row.id ? "Collapse row details" : "Expand row details"}
                              aria-expanded={expandedId === row.id}
                              onClick={(event) => {
                                event.stopPropagation();
                                setExpandedId(expandedId === row.id ? null : row.id);
                              }}
                              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] border border-slate-200 bg-[#f8f9fc] text-slate-500 transition-colors hover:bg-slate-100"
                            >
                              {expandedId === row.id ? (
                                <ChevronDown className="h-[14px] w-[14px]" />
                              ) : (
                                <ChevronRight className="h-[14px] w-[14px]" />
                              )}
                            </button>
                            <span
                              onClick={(e) => { e.stopPropagation(); togglePhrase(String(row.id)); }}
                              title={openPhrases.has(String(row.id)) ? 'Click to collapse' : 'Click to show full prompt'}
                              className={cn(
                                'cursor-pointer text-[12px] text-[#58606f] italic',
                                openPhrases.has(String(row.id)) ? 'whitespace-normal break-words' : 'truncate'
                              )}
                            >
                              {row.phrase}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-3 px-2">
                    <Badge variant="outline" className={`rounded-full border-0 px-2.5 py-0.5 text-[10px] font-bold ${getSentimentColor(row.avgSentiment > 7 ? 'Positive' : row.avgSentiment > 4 ? 'Neutral' : 'Negative')}`}>
                      {row.avgSentiment > 7 ? 'Positive' : row.avgSentiment > 4 ? 'Neutral' : 'Negative'}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-3 px-2 text-[11px] font-medium text-slate-600">
                    {row.mentions}/{row.results?.length || 0}
                  </TableCell>
                  <TableCell className="py-3 px-2">
                    <Badge className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-600 hover:bg-emerald-50 border-0">
                      #{row.bestRank || '-'}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-3 px-2 text-[11px] font-medium text-slate-600">{row.sov}</TableCell>
                  <TableCell className="max-w-[160px] py-2 px-2">
                    <div className="flex flex-wrap items-center gap-1">
                      {row.competitors?.slice(0, 2).map((name: string) => {
                        const favicon = getFaviconUrl(name);
                        return (
                          <span
                            key={name}
                            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[9.5px] font-medium text-slate-600"
                          >
                            {favicon ? (
                              <img
                                src={favicon}
                                alt={name}
                                className="h-3 w-3 flex-shrink-0 rounded-full border border-white bg-white object-cover"
                                loading="lazy"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            ) : null}
                            <span className="truncate max-w-[80px]">{name}</span>
                          </span>
                        );
                      })}
                      {row.competitorCount > 2 && (
                        <span className="text-[10px] text-gray-400">+{row.competitorCount - 2} more</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-3 px-4 text-right">
                    <div className="flex justify-end gap-2">
                      <TrackToggleButton
                        tracked={isRowTracked(row)}
                        loading={trackPending[row.id]}
                        disabled={
                          (row.type === 'prompt'
                            ? row.rawId == null
                            : (row.childPromptIds?.length ?? 0) === 0)
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          void toggleTracking(row, !isRowTracked(row));
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenWorksheetModal(String(row.id));
                        }}
                        className="h-[38px] rounded-[14px] border-[#e8eef8] bg-[#eff4ff] px-3.5 text-[11px] font-semibold text-[#3b5d9c] shadow-none hover:bg-[#e7efff]"
                      >
                        <FileText className="mr-1.5 h-3.5 w-3.5" />
                        Generate
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                {expandedId === row.id && (
                  <TableRow className="bg-gray-50/30 hover:bg-gray-50/30 border-b border-slate-300">
                    <TableCell colSpan={8} className="p-0">
                      <ExpandedDetails results={row.results} />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between gap-3 px-6 py-3 border-t border-slate-200 mt-2">
        <span className="text-[11px] text-gray-500 font-medium tracking-tight">
          {totalCount === 0
            ? 'No rows'
            : `Showing ${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, totalCount)} of ${totalCount}`}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Prev
          </button>
          <span className="px-2 text-[11px] font-medium text-slate-500 tabular-nums">
            {currentPage} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </CardContent>
  </Card>
);
};

const FilterPill = ({
  label,
  icon,
  removable = false,
}: {
  label: string;
  icon?: 'sort' | 'filter';
  removable?: boolean;
}) => (
  <Button
    variant="outline"
    className="h-8 rounded-lg border border-[#D5D7DA] bg-white px-2.5 text-[11px] font-normal text-[#717680] shadow-[0_1px_2px_0_#1018280D] hover:bg-white"
  >
    {icon === 'sort' ? (
      <img src="/report-icons/ascending-arrow.svg" alt="" className="mr-1.5 h-3.5 w-3.5 shrink-0" />
    ) : icon === 'filter' ? (
      <Filter className="mr-1.5 h-3.5 w-3.5 shrink-0 text-[#717680]" strokeWidth={1.8} />
    ) : null}
    {label}
    {icon ? <ChevronDown className="ml-1.5 h-3.5 w-3.5 shrink-0 text-[#717680]" strokeWidth={1.8} /> : null}
    {removable ? <X className="ml-1.5 h-3.5 w-3.5 shrink-0 text-[#717680]" strokeWidth={1.8} /> : null}
  </Button>
);

type GenerationState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'running'; jobId: string; progress: number; phase: string | null }
  | { kind: 'done'; draftId: number | null }
  | { kind: 'failed'; error: string };

const VisibilityRow = ({
  title,
  meta,
  status,
  actionLabel,
  onAction,
  generation,
}: {
  title: string;
  meta: string;
  status: 'positive' | 'danger' | 'warn';
  actionLabel?: string;
  onAction?: () => void;
  generation?: GenerationState;
}) => {
  const StatusIcon = status === 'positive' ? CheckCircle2 : Target;
  const statusIconColor =
    status === 'positive' ? 'text-[#0A6D0E]' : status === 'warn' ? 'text-[#B54708]' : 'text-[#B42318]';
  const wrapperClass =
    status === 'positive'
      ? 'border border-[#B9F8CF] bg-[#E5FFE6]'
      : status === 'warn'
        ? 'border border-[#FEDF89] bg-[#FFFAEB]'
        : 'border border-[#D5D7DA] bg-white shadow-[0_1px_2px_0_#1018280D]';
  const titleColor =
    status === 'positive' ? 'text-[#2D4059]' : status === 'warn' ? 'text-[#93370D]' : 'text-[#B23131]';
  return (
    <div className={cn('rounded-lg px-5 py-4', wrapperClass)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <StatusIcon className={cn('h-4 w-4 shrink-0', statusIconColor)} strokeWidth={2} />
            <p className={cn('truncate text-[14px] italic leading-[150%]', titleColor)}>{title}</p>
          </div>
          <p className="mt-1.5 text-[12.5px] leading-[150%] text-[#717680]">{meta}</p>
        </div>
        {actionLabel && onAction ? (
          <GenerateInlineButton onClick={onAction} state={generation ?? { kind: 'idle' }} label={actionLabel} />
        ) : null}
      </div>
    </div>
  );
};

const OpportunityRow = ({
  title,
  severity,
  priority,
  rationale,
  recommendedAngle,
  brief,
  onAction,
  generation,
}: {
  title: string;
  severity: string;
  priority: string;
  rationale?: string;
  recommendedAngle?: string;
  brief?: {
    audience?: string;
    tone?: string;
    structure?: string;
    keyPoints?: string[];
    wordCount?: number;
    cta?: string;
  };
  onAction?: () => void;
  generation?: GenerationState;
}) => {
  const sevClass =
    severity.toLowerCase() === 'critical'
      ? 'border-[#FDA29B] bg-[#FEF3F2] text-[#B42318]'
      : severity.toLowerCase() === 'high'
        ? 'border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]'
        : severity.toLowerCase() === 'medium'
          ? 'border-[#B9E6FE] bg-[#F0F9FF] text-[#026AA2]'
          : 'border-[#D5D7DA] bg-[#F9FAFB] text-[#475467]';

  const [expanded, setExpanded] = useState(false);
  const hasDetail = Boolean(
    recommendedAngle ||
    brief?.structure ||
    (brief?.keyPoints && brief.keyPoints.length > 0) ||
    brief?.audience
  );

  return (
    <div className="rounded-lg border-l-[3px] border-l-[#7E9BD7] bg-white px-3 py-3 shadow-[0_1px_4px_0_#0000000D]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium leading-[150%] text-[#2D4059] break-words">{title}</p>
          {rationale ? (
            <p className="mt-0.5 text-[11px] leading-[150%] text-[#717680] break-words">{rationale}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px]', sevClass)}>
              {severity}
            </span>
            <span className="inline-flex items-center gap-1 text-[12px] font-medium text-[#0A6D0E]">
              <TrendingUp className="h-3.5 w-3.5" strokeWidth={2} />
              {priority}
            </span>
            {hasDetail ? (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="text-[11px] font-medium text-blue-600 hover:text-blue-700 transition-colors"
              >
                {expanded ? 'Hide brief' : 'View brief'}
              </button>
            ) : null}
          </div>
          {expanded && hasDetail ? (
            // Expanded brief — surfaces the LLM's strategic detail (angle,
            // audience, structure, key points, CTA) without exporting them
            // to a modal. Keeps the user in flow.
            <div className="mt-3 space-y-1.5 rounded-md bg-slate-50 px-3 py-2.5 text-[11px] leading-[160%] text-[#475467]">
              {recommendedAngle ? (
                <p>
                  <span className="font-semibold text-[#2D4059]">Angle:</span> {recommendedAngle}
                </p>
              ) : null}
              {brief?.audience ? (
                <p>
                  <span className="font-semibold text-[#2D4059]">Audience:</span> {brief.audience}
                </p>
              ) : null}
              {brief?.structure ? (
                <p>
                  <span className="font-semibold text-[#2D4059]">Structure:</span> {brief.structure}
                  {brief.tone ? ` · ${brief.tone}` : ''}
                  {brief.wordCount ? ` · ~${brief.wordCount} words` : ''}
                </p>
              ) : null}
              {brief?.keyPoints && brief.keyPoints.length > 0 ? (
                <div>
                  <p className="font-semibold text-[#2D4059]">Cover:</p>
                  <ul className="mt-1 list-disc pl-4 space-y-0.5">
                    {brief.keyPoints.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {brief?.cta ? (
                <p>
                  <span className="font-semibold text-[#2D4059]">CTA:</span> {brief.cta}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
        {onAction ? (
          <GenerateInlineButton onClick={onAction} state={generation ?? { kind: 'idle' }} label="Generate Content" />
        ) : null}
      </div>
    </div>
  );
};

/** Shared CTA — swaps to a status pill while the generation job is running. */
const GenerateInlineButton = ({
  onClick,
  state,
  label,
}: {
  onClick: () => void;
  state: GenerationState;
  label: string;
}) => {
  if (state.kind === 'submitting') {
    return (
      <span className="inline-flex h-[37px] items-center gap-1.5 rounded-lg bg-slate-100 px-3 text-[12px] font-medium text-slate-500">
        <Sparkles className="h-3.5 w-3.5 animate-pulse" /> Adding to worksheet…
      </span>
    );
  }
  if (state.kind === 'running') {
    return (
      <span className="inline-flex h-[37px] items-center gap-1.5 rounded-lg bg-blue-50 px-3 text-[12px] font-medium text-blue-700">
        <Sparkles className="h-3.5 w-3.5 animate-pulse" />
        Generating · {state.progress}%
      </span>
    );
  }
  if (state.kind === 'done') {
    return (
      <span className="inline-flex h-[37px] items-center gap-1.5 rounded-lg bg-emerald-50 px-3 text-[12px] font-medium text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" /> Draft ready
      </span>
    );
  }
  if (state.kind === 'failed') {
    return (
      <Button
        variant="outline"
        onClick={onClick}
        className="h-[37px] shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-[10px] text-[12px] font-medium text-rose-700 shadow-[0_1px_2px_0_#1018280D] hover:bg-rose-100"
        title={state.error}
      >
        <Sparkles className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.8} />
        Retry
      </Button>
    );
  }
  return (
    <Button
      variant="outline"
      onClick={onClick}
      className="h-[37px] shrink-0 rounded-lg border border-[#D5D7DA] bg-[#F9F9F9] px-[10px] text-[12px] font-medium text-[#2D4059] shadow-[0_1px_2px_0_#1018280D] hover:bg-[#F9F9F9]"
    >
      <Sparkles className="mr-1.5 h-3.5 w-3.5 text-[#2D4059]" strokeWidth={1.8} />
      {label}
    </Button>
  );
};

type ChartSeries = {
  key: string;
  label: string;
  stroke: string;
};

const ChartLegendItem = ({ series }: { series: ChartSeries }) => (
  <span className="inline-flex items-center gap-1.5 text-[10px] leading-none text-[#2D4059]">
    <span className="inline-flex h-3 w-3 items-center justify-center rounded-[2px] border bg-white" style={{ borderColor: series.stroke }}>
      <span className="h-1.5 w-1.5 rounded-[1px]" style={{ backgroundColor: series.stroke }} />
    </span>
    {series.label}
  </span>
);

const ChartTooltip = ({
  active,
  payload,
  title,
  series,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string; value?: number | string }>;
  title: string;
  series: readonly ChartSeries[];
}) => {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-xl border border-[#D5D7DA] bg-white px-3 py-2.5 shadow-[0_12px_30px_rgba(15,23,42,0.12)]">
      <p className="text-xs font-semibold leading-[150%] text-[#2D4059]">{title}</p>
      <div className="mt-2 space-y-1">
        {series.map((item) => {
          const value = payload.find((entry) => entry.dataKey === item.key)?.value ?? 0;
          return (
            <div key={item.key} className="flex items-center justify-between gap-6 text-[10px] leading-[150%] text-[#535862]">
              <span>{item.label}</span>
              <span className="font-medium text-[#2D4059]">{formatChartTick(value)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const AreaChartCard = ({
  title,
  subtitle,
  data,
  series,
  tooltipTitle,
  yMax,
  emptyMessage,
}: {
  title: string;
  subtitle: string;
  data: Array<Record<string, string | number>>;
  series: readonly ChartSeries[];
  tooltipTitle?: string;
  /** Optional manual cap. When omitted, auto-scales from the actual data
   *  so a 12-citation chart doesn't get rendered as a flat line under the
   *  old hardcoded 8000 ceiling. */
  yMax?: number;
  /** Rendered as a centered overlay when the chart has 0 or 1 data points. */
  emptyMessage?: string;
}) => {
  const chartId = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  // Auto-scale: find the max stacked total (areas are stackId="coverage"),
  // round up to a friendly ceiling, and cap at 10 if everything is tiny so
  // the chart doesn't try to render a 0-1 axis with no resolution.
  const computedMax = (() => {
    if (typeof yMax === 'number' && yMax > 0) return yMax;
    let max = 0;
    for (const row of data) {
      let stackTotal = 0;
      for (const s of series) stackTotal += Number(row[s.key] ?? 0);
      if (stackTotal > max) max = stackTotal;
    }
    if (max <= 0) return 10;
    // Round up to a nice tick (1, 2, 5, 10, 20, 50, 100, 200, 500, ...).
    const niceCeiling = (n: number) => {
      const exp = Math.floor(Math.log10(n));
      const base = Math.pow(10, exp);
      const fraction = n / base;
      const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
      return niceFraction * base;
    };
    return niceCeiling(max * 1.15);
  })();
  const ticks = [0, computedMax * 0.25, computedMax * 0.5, computedMax * 0.75, computedMax];

  return (
    <div className="w-full min-w-0">
      <div className="px-0.5">
        <div className="flex items-center gap-1.5">
          <h3 className="text-[20px] font-semibold leading-[135%] text-[#414651]">{title}</h3>
          {/* Chart title gets the same per-title tooltip lookup; falls back
              to a plain badge if the title isn't in CARD_TOOLTIPS. */}
          {CHART_TOOLTIPS_RESOLVED[title]
            ? <MetricInfoTooltip tip={CHART_TOOLTIPS_RESOLVED[title]} />
            : CARD_TOOLTIPS[title]
              ? <MetricInfoTooltip tip={CARD_TOOLTIPS[title]} />
              : <MetricInfoBadge />}
        </div>
        <p className="mt-2 text-sm leading-[150%] text-[#535862]">{subtitle}</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          {series.map((item) => (
            <ChartLegendItem key={item.key} series={item} />
          ))}
          <span className="text-[12px] font-semibold leading-none text-[#2D4059]">+</span>
        </div>
      </div>

      <div className="relative mt-2 h-[240px] w-full overflow-x-auto">
        {emptyMessage ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <span className="rounded-full bg-white/90 border border-slate-200 px-3 py-1.5 text-[11px] text-slate-500 shadow-sm">
              {emptyMessage}
            </span>
          </div>
        ) : null}
        <div className="h-full min-w-[520px] sm:min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <defs>
                {series.map((item) => (
                  <linearGradient key={item.key} id={`${chartId}-${item.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={item.stroke} stopOpacity={0.42} />
                    <stop offset="95%" stopColor={item.stroke} stopOpacity={0.18} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid stroke="#D5D7DA" strokeDasharray="2 3" vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={16}
                tick={{ fontSize: 11, fill: '#717680' }}
                tickFormatter={formatDateTick}
              />
              <YAxis
                orientation="right"
                domain={[0, computedMax]}
                ticks={ticks}
                tickLine={false}
                axisLine={false}
                width={34}
                tick={{ fontSize: 11, fill: '#D5D7DA' }}
                tickFormatter={formatChartTick}
              />
              <RechartsTooltip
                cursor={{ stroke: '#A8C4F6', strokeWidth: 1 }}
                content={({ active, payload }) => (
                  <ChartTooltip
                    active={active}
                    payload={payload as Array<{ dataKey?: string; value?: number | string }> | undefined}
                    title={tooltipTitle ?? title}
                    series={series}
                  />
                )}
              />
              {series.map((item) => (
                <Area
                  key={item.key}
                  type="monotone"
                  dataKey={item.key}
                  stackId="coverage"
                  stroke={item.stroke}
                  fill={`url(#${chartId}-${item.key})`}
                  strokeWidth={0}
                  activeDot={{ r: 4, fill: item.stroke, stroke: '#fff', strokeWidth: 2 }}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};


// WORKSHEET_* constants, buildProjectsWorksheetPath, WorksheetOption,
// WorksheetPickerModal and CreateWorksheetModal now live in the shared
// WorksheetPickerModals module (imported above) so the Prompts-page table can
// reuse the same popup.

// Payload threaded from a phrase / opportunity row click through the
// worksheet picker into the actual /from-opportunity + n8n calls.
// Defined at module scope so the useState for pendingGeneration can
// reference it without TDZ ordering issues inside the component.
type GenerationPayload = {
  kind: 'opportunity' | 'phrase';
  title: string;
  rationale: string;
  primaryKeyword: string | null;
  longtailKeywords: string[];
  suggestedTemplate: 'blog' | 'landing_page' | 'case_study' | 'faq';
  category: string | null;
  intentStage: string | null;
  recommendedAngle?: string;
  brief?: {
    audience?: string;
    tone?: 'Authoritative' | 'Helpful' | 'Conversational' | 'Technical';
    structure?: string;
    keyPoints?: string[];
    wordCount?: number;
    cta?: string;
  };
};



const AIResultsReportPreview = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentDomain, allDomains, maskedDomainId } = useShellContext();
  const domainId = currentDomain?.id ?? null;
  const {
    currentTitle: currentReportSectionTitle,
  } = useScrollSpyBreadcrumbs({
  });

  const [promptSort, setPromptSort] = useState<'alphabetical' | 'alphabetical-desc' | 'sentiment' | 'position'>('alphabetical');

  // Filter state — drives header dropdowns + per-card / table scoping.
  // pastRuns = list for the run picker; selectedRunId = which one we're viewing
  // (null = latest). modelFilter / categoryFilter are client-side scopers.
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [modelFilter, setModelFilter] = useState<Set<string>>(new Set()); // empty = all
  const [categoryFilter, setCategoryFilter] = useState<Set<string>>(new Set()); // empty = all

  // Per-run trend data for the three Visibility-section charts. Fetched
  // separately from /trends so the page can render the static cards before
  // the trend rollup completes (it reads every result row across runs).
  type TrendRun = {
    runId: number;
    startedAt: string;
    endedAt: string | null;
    perModel: Record<string, { cites: number; presenceCount: number }>;
    brandMentions: number;
    competitorMentions: number;
    perCompetitor: Record<string, number>;
  };
  // trendsData is now derived from the useTrends hook below.

  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [activeWorksheetId, setActiveWorksheetId] = useState<string | null>(null);
  const [isWorksheetModalOpen, setIsWorksheetModalOpen] = useState(false);
  const [isCreateWorksheetModalOpen, setIsCreateWorksheetModalOpen] = useState(false);
  const [newWorksheetName, setNewWorksheetName] = useState('');
  const [createWorksheetError, setCreateWorksheetError] = useState<string | null>(null);
  const [isCreatingWorksheet, setIsCreatingWorksheet] = useState(false);

  // Campaigns + GSC status are both session-scoped (not domain-scoped) and
  // cached for 10 min via the queries module — moving here means we don't
  // refetch them when the user switches tabs.
  const campaignsQuery = useCampaigns<{ campaigns: Array<{ id: number; title: string; description?: string | null }> }>();
  const worksheetOptions: WorksheetOption[] = useMemo(() => {
    const campaigns = Array.isArray(campaignsQuery.data?.campaigns) ? campaignsQuery.data!.campaigns : [];
    return campaigns.map((c) => ({
      id: String(c.id),
      name: c.title,
      description: c.description?.trim() ? c.description.trim() : null,
    }));
  }, [campaignsQuery.data]);
  const worksheetOptionsLoading = campaignsQuery.isLoading;

  const gscQuery = useGscStatus<{ connected?: boolean }>();
  const gscConnected = Boolean(gscQuery.data?.connected);

  // Report / runs / trends flow through React Query — switching tabs hits
  // the cache instead of refetching, and other AI Checker pages that
  // request the same (domainId, runId) tuple reuse this data.
  const reportQuery = useReport<any>(domainId, selectedRunId);
  const runsQuery = useRuns<{ runs: Array<{ id: number; status: string; startedAt: string; visibilityScore: number | null; totalQueries: number | null }> }>(domainId);
  const trendsQuery = useTrends<{ runs: TrendRun[]; topCompetitors: string[] }>(domainId);

  const reportData: any = reportQuery.data ?? null;
  const loading = reportQuery.isLoading;
  const reportPrompts = (reportData?.topAiSearchPrompts ?? reportData?.topPrompts ?? []) as any[];
  const pastRuns = useMemo(
    () =>
      (runsQuery.data?.runs ?? [])
        .filter((r) => r.status === 'completed')
        .map((r) => ({ id: r.id, startedAt: r.startedAt, visibilityScore: r.visibilityScore, totalQueries: r.totalQueries })),
    [runsQuery.data],
  );
  const trendsData = useMemo(
    () => ({
      runs: trendsQuery.data?.runs ?? [],
      topCompetitors: trendsQuery.data?.topCompetitors ?? [],
    }),
    [trendsQuery.data],
  );

  const selectedCount = selectedRowIds.size;

  const scrollToSection = useCallback((sectionId: string) => {
    const target = document.getElementById(sectionId);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const suggestedNextActions = useMemo(
    () => [
      {
        title: 'Connect Website',
        description: 'Integrate your website to automate content publishing and optimization.',
        iconSrc: '/suggested-actions/connect-website.svg',
        onClick: () => navigate('/dashboard?tab=integration'),
      },
      {
        title: 'Explore Opportunities',
        description: 'Discover high-impact prompts, uncover content gaps, and identify opportunities to improve AI visibility.',
        iconSrc: '/suggested-actions/explore-opportunities.svg',
        onClick: () => scrollToSection('ai-results-opportunities'),
      },
      {
        title: 'Analyze Competitors',
        description: 'Identify the content strategies helping competitors appear more frequently in AI-generated responses.',
        iconSrc: '/suggested-actions/analyze-competitors.svg',
        onClick: () => scrollToSection('ai-results-visibility-coverage'),
      },
    ],
    [navigate, scrollToSection],
  );

  const handleToggleRow = useCallback((id: string) => {
    setSelectedRowIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSetSelectedRows = useCallback((ids: Set<string>) => {
    setSelectedRowIds(ids);
  }, []);

  const handleOpenWorksheetModal = useCallback(
    (singleRowId?: string) => {
      if (singleRowId) {
        setSelectedRowIds(new Set([singleRowId]));
      } else if (selectedRowIds.size === 0) {
        return;
      }
      setActiveWorksheetId(null);
      setIsWorksheetModalOpen(true);
    },
    [selectedRowIds]
  );

  // Open the worksheet modal automatically when the URL has
  // ?openWorksheet=<rowId>. The tracking table (PromptsPage)
  // navigates here with that param so the existing
  // modal handles the worksheet flow — saves ~200 lines of duplicated
  // orchestration. The param is consumed once and cleared from the
  // URL so refresh doesn't re-open the modal.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const openWorksheet = searchParams.get('openWorksheet');
    if (!openWorksheet || loading) return;
    // "1" is the no-row-id form (top-of-table Add to Worksheet). For a
    // specific row, pass the id; otherwise just open the picker with
    // whatever selection is already active.
    if (openWorksheet === '1') {
      setActiveWorksheetId(null);
      setIsWorksheetModalOpen(true);
    } else {
      handleOpenWorksheetModal(openWorksheet);
    }
    // Strip the param so a refresh doesn't loop us back into the modal.
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('openWorksheet');
        return next;
      },
      { replace: true }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, loading]);

  // ── Generate-Content lifecycle ─────────────────────────────────────────
  // Each opportunity / Lost-or-At-risk phrase row carries a stable `key`
  // (opportunity.key for opportunities, `phrase:${promptId}` for phrases).
  // We track per-key generation state so multiple rows can run in parallel.
  // NOTE: declared HERE (above handleAddToWorksheet) so the worksheet
  // handlers can read pendingGeneration / runGeneration without TDZ
  // ("Cannot access 'qe' before initialization") in the deps array.
  const [generationByKey, setGenerationByKey] = useState<Record<string, GenerationState>>({});
  const [pendingGeneration, setPendingGeneration] = useState<{ key: string; payload: GenerationPayload } | null>(null);

  // Adds the opportunity / phrase as a new topic + keywords row in the
  // chosen worksheet, then redirects the user to the dashboard so they can
  // handle generation from the worksheet just like any other table row.
  // We DO NOT fire n8n here — generation is driven from the worksheet.
  const runGeneration = useCallback(
    async (
      key: string,
      payload: GenerationPayload,
      campaignId: number | null,
      worksheetTab: Window | null = null
    ) => {
      if (!reportData?.domainInfo?.id) return false;
      setGenerationByKey((prev) => ({ ...prev, [key]: { kind: 'submitting' } }));
      try {
        const built = await apiPost<{ topicId: number; campaignId: number }>(
          '/campaigns/topics/from-opportunity',
          {
            domainId: reportData.domainInfo.id,
            opportunityKey: key,
            campaignId,
            title: payload.title,
            rationale: payload.rationale,
            primaryKeyword: payload.primaryKeyword,
            longtailKeywords: payload.longtailKeywords,
            suggestedTemplate: payload.suggestedTemplate,
            recommendedAngle: payload.recommendedAngle,
            brief: payload.brief,
          }
        );

        // Hand off to the worksheet page. The topic + keywords are already
        // persisted by /from-opportunity, so we only need the target campaign.
        writeWorksheetHandoff({ worksheetId: built.campaignId });
        localStorage.setItem('activeTab', 'projects');
        setGenerationByKey((prev) => ({ ...prev, [key]: { kind: 'done', draftId: null } }));
        const worksheetPath = buildProjectsWorksheetPath(built.campaignId);
        if (worksheetTab) {
          worksheetTab.location.href = worksheetPath;
        } else {
          navigate(worksheetPath);
        }
        return true;
      } catch (err) {
        if (worksheetTab) {
          worksheetTab.close();
        }
        setGenerationByKey((prev) => ({
          ...prev,
          [key]: { kind: 'failed', error: err instanceof Error ? err.message : 'Failed to add to worksheet' },
        }));
        return false;
      }
    },
    [navigate, reportData]
  );

  const handleGenerateContent = useCallback(
    (key: string, payload: GenerationPayload) => {
      if (!reportData?.domainInfo?.id) return;
      setPendingGeneration({ key, payload });
      setActiveWorksheetId(null);
      setIsWorksheetModalOpen(true);
    },
    [reportData]
  );

  const handleWorksheetModalOpenChange = useCallback((open: boolean) => {
    setIsWorksheetModalOpen(open);
    if (!open) {
      setActiveWorksheetId(null);
      setPendingGeneration(null);
    }
  }, []);

  const handleAddToWorksheet = useCallback(() => {
    if (!activeWorksheetId) return;

    // Branch 1: a phrase / opportunity Generate-Content click is waiting on
    // this pick — close the modal, fire the topic+keywords build into the
    // chosen worksheet (campaignId), then n8n.
    if (pendingGeneration) {
      const { key, payload } = pendingGeneration;
      const campaignId = Number(activeWorksheetId);
      const worksheetTab = openWorksheetPlaceholderTab();
      if (!worksheetTab) return;
      void runGeneration(
        key,
        payload,
        Number.isFinite(campaignId) ? campaignId : null,
        worksheetTab
      ).then((success) => {
        if (!success) return;
        setIsWorksheetModalOpen(false);
        setPendingGeneration(null);
        setActiveWorksheetId(null);
      });
      return;
    }

    // Branch 2 (existing): table multi-select → hand off to the worksheet
    // page via sessionStorage.
    const rowsById = new Map<string, any>(
      (reportData?.topPrompts || []).map((p: any) => [String(p.id), p])
    );
    const selectedItemIds = Array.from(selectedRowIds);
    const selectedRows = selectedItemIds
      .map((id) => rowsById.get(id))
      .filter(Boolean)
      .map((row: any) => {
        // Pass through the source keyword (when the row is a prompt with a
        // parent keyword, or when the row IS a keyword) so the worksheet
        // importer can seed the topic's primary keyword. This stops the
        // worksheet from regenerating long phrase-style keywords from the
        // prompt text alone.
        const primaryKeyword =
          row.type === 'keyword'
            ? (row.phrase ?? row.text ?? null)
            : (row.keyword ?? null);
        const primaryIntent =
          row.type === 'keyword'
            ? (row.intent ?? null)
            : (row.keywordIntent ?? row.intent ?? null);
        return {
          id: String(row.id),
          prompt: row.phrase ?? row.prompt ?? '',
          type: row.type ?? null,
          primaryKeyword: primaryKeyword || null,
          primaryIntent: primaryIntent || null,
        };
      });

    const payload = { activeWorksheetId, selectedItemIds, selectedRows };
    const worksheetTab = openWorksheetInNewTab(activeWorksheetId, payload);
    if (!worksheetTab) return;
    localStorage.setItem('activeTab', 'projects');
    setIsWorksheetModalOpen(false);
    setActiveWorksheetId(null);
  }, [activeWorksheetId, pendingGeneration, reportData, runGeneration, selectedRowIds]);

  const handleCreateNewWorksheet = useCallback(() => {
    setCreateWorksheetError(null);
    setNewWorksheetName('');
    setIsCreateWorksheetModalOpen(true);
  }, []);

  const handleCreateWorksheetModalOpenChange = useCallback((open: boolean) => {
    if (!isCreatingWorksheet) {
      setIsCreateWorksheetModalOpen(open);
    }
    if (!open) {
      setCreateWorksheetError(null);
      setNewWorksheetName('');
    }
  }, [isCreatingWorksheet]);

  const handleConfirmCreateWorksheet = useCallback(async () => {
    const name = newWorksheetName.trim();
    if (!name || isCreatingWorksheet) return;
    setIsCreatingWorksheet(true);
    setCreateWorksheetError(null);
    try {
      const created = await apiPost<{ campaign?: { id: number; title: string } }>(
        '/campaigns',
        { title: name }
      );
      const newId = created?.campaign?.id;
      const newTitle = created?.campaign?.title?.trim() || name;
      if (!newId) return;
      const newWorksheetId = String(newId);
      // Refetch /campaigns so worksheetOptions picks up the new entry. The
      // new worksheet remains the active one via setActiveWorksheetId below.
      await queryClient.invalidateQueries({ queryKey: aiResultsKeys.campaigns() });
      setIsCreateWorksheetModalOpen(false);
      setNewWorksheetName('');

      if (pendingGeneration) {
        const { key, payload } = pendingGeneration;
        setIsWorksheetModalOpen(false);
        setPendingGeneration(null);
        setActiveWorksheetId(null);
        void runGeneration(key, payload, newId);
        return;
      }

      // Table-row flow: map selected prompts into the newly created worksheet
      // exactly like "Add to Worksheet" does, then hand off to dashboard.
      const rowsById = new Map<string, any>(
        (reportData?.topPrompts || []).map((p: any) => [String(p.id), p])
      );
      const selectedItemIds = Array.from(selectedRowIds);
      const selectedRows = selectedItemIds
        .map((id) => rowsById.get(id))
        .filter(Boolean)
        .map((row: any) => {
          const primaryKeyword =
            row.type === 'keyword'
              ? (row.phrase ?? row.text ?? null)
              : (row.keyword ?? null);
          const primaryIntent =
            row.type === 'keyword'
              ? (row.intent ?? null)
              : (row.keywordIntent ?? row.intent ?? null);
          return {
            id: String(row.id),
            prompt: row.phrase ?? row.prompt ?? '',
            type: row.type ?? null,
            primaryKeyword: primaryKeyword || null,
            primaryIntent: primaryIntent || null,
          };
        });

      const payload = {
        activeWorksheetId: newWorksheetId,
        selectedItemIds,
        selectedRows,
      };

      writeWorksheetHandoff({ worksheetId: newWorksheetId, importPayload: payload });
      localStorage.setItem('activeTab', 'projects');
      setIsWorksheetModalOpen(false);
      setActiveWorksheetId(null);
      navigate(buildProjectsWorksheetPath(newId));
    } catch (err) {
      console.error('[AIResults] Create worksheet failed:', err);
      setCreateWorksheetError('Failed to create worksheet. Please try again.');
    } finally {
      setIsCreatingWorksheet(false);
    }
  }, [isCreatingWorksheet, navigate, newWorksheetName, pendingGeneration, reportData, runGeneration, selectedRowIds]);

  // Derived metrics for the 4×2 dashboard cards.
  //
  // The cards re-derive whenever the page-header Sort / Filters dropdowns
  // change — narrowing the row set (categoryFilter) and the
  // change — narrowing the row set (categoryFilter) and the
  // per-result model set (modelFilter) so headline numbers reflect what the
  // user is actually scoping to. Empty filter sets = show everything.
  const metricCards = useMemo<MetricCardData[]>(() => {
    if (!reportData) return [];

    const allItems = reportPrompts;

    // Apply the same filter chain that PromptTable uses, so the cards and
    // the table tell a consistent story.
    let scoped = allItems.filter(
      (p: any) => p.type?.toLowerCase() === 'prompt' && Array.isArray(p?.results) && p.results.length > 0,
    );
    if (categoryFilter.size > 0) scoped = scoped.filter((p: any) => p.category && categoryFilter.has(p.category));
    if (modelFilter.size > 0) {
      scoped = scoped
        .map((p: any) => ({ ...p, results: (p.results ?? []).filter((r: any) => modelFilter.has(r.model)) }))
        .filter((p: any) => p.results.length > 0);
    }

    const prompts = scoped.filter((p) => p.type === 'prompt');
    const trackedPrompts = prompts.filter((p: any) => Boolean(p.isTracked));
    const totalPromptCount = prompts.length;
    const trackedPromptCount = trackedPrompts.length;

    // Visibility within the scoped set — recomputed from the rows the user
    // is actually looking at, not the static server-side rollup.
    const allResults = scoped.flatMap((p: any) => p.results ?? []);
    const presenceCount = allResults.reduce((s: number, r: any) => s + Number(r.presence ?? 0), 0);
    const visibilityPct = allResults.length > 0
      ? Math.round((presenceCount / allResults.length) * 100)
      : 0;

    // Mentions: brand presence count vs competitor host count across scoped rows.
    const brandPages = presenceCount;
    const competitorPages = allResults.reduce((s: number, r: any) => {
      const arr = Array.isArray(r.competitorHosts) ? r.competitorHosts : [];
      return s + arr.length;
    }, 0);
    const mentionsTotal = brandPages + competitorPages;
    const brandSharePct = mentionsTotal > 0 ? Math.round((brandPages / mentionsTotal) * 100) : 0;

    return [
      {
        title: 'Performance Across AI Models',
        kind: 'modelPerformance',
        details: [
          { label: 'AI Overview', value: '13', iconSrc: '/report-icons/google.svg', barWidth: 59 },
          { label: 'ChatGPT', value: '7', iconSrc: '/report-icons/chat-gpt.svg', barWidth: 32 },
          { label: 'Claude', value: '6', iconSrc: '/report-icons/claude.svg', barWidth: 27 },
          { label: 'Gemini', value: '22', iconSrc: '/report-icons/gemini.svg', barWidth: 100 },
        ],
      },
      {
        title: 'Top AI Search Prompts',
        kind: 'promptSummary',
        details: [
          { label: 'Total', value: totalPromptCount.toString() },
          { label: 'Tracked', value: trackedPromptCount.toString() },
        ],
      },
      {
        title: 'Citations',
        kind: 'summary',
        details: [
          { label: 'Total', value: prompts.length.toString(), subValue: trackedPrompts.length.toString() },
          { label: 'Tracked', value: trackedPrompts.length > 0 ? `${visibilityPct}%` : '—', subValue: trackedPrompts.length > 0 ? `${trackedPrompts.length} of ${prompts.length}` : 'no run yet' },
        ],
      },
      {
        title: 'Mentions',
        kind: 'summary',
        details: [
          { label: 'Brand', value: mentionsTotal > 0 ? `${brandSharePct}%` : '—', subValue: brandPages.toString() },
          { label: 'Competitors', value: mentionsTotal > 0 ? `${100 - brandSharePct}%` : '—', subValue: competitorPages.toString() },
        ],
      },
    ];
  }, [reportData, categoryFilter, modelFilter]);

// Sentiment / Accuracy / Share of Voice cards — three single-number cards.
// Threshold scale fix: backend returns avgSentiment on a 0-10 displayed
// scale (or null when there are zero measurable rows). Old code used
// 70/40 thresholds → every real number fell into "Negative".
const scoreCards = useMemo(() => {
  if (!reportData) return [];

  // Apply same filter scope as metricCards so all dashboard headlines tell
  // a single consistent story when the user narrows by model / category.
  const allItems = reportPrompts;
  let scoped = allItems.filter(
    (p: any) => p.type?.toLowerCase() === 'prompt' && Array.isArray(p?.results) && p.results.length > 0,
  );
  if (categoryFilter.size > 0) scoped = scoped.filter((p: any) => p.category && categoryFilter.has(p.category));
  if (modelFilter.size > 0) {
    scoped = scoped
      .map((p: any) => ({ ...p, results: (p.results ?? []).filter((r: any) => modelFilter.has(r.model)) }))
      .filter((p: any) => p.results.length > 0);
  }

  const allResults = scoped.flatMap((p: any) => p.results ?? []);
  const totalRows = allResults.length;
  const presenceRows = allResults.filter((r: any) => Number(r.presence ?? 0) === 1);

  // Sentiment: only rows where the brand was mentioned AND sentiment is
  // non-null contribute to the average. 0-10 scale per backend transform.
  const sentimentMeasurements = presenceRows
    .map((r: any) => (r.sentiment === null || r.sentiment === undefined ? null : Number(r.sentiment)))
    .filter((s: number | null): s is number => s !== null);
  const sentimentAvg = sentimentMeasurements.length > 0
    ? sentimentMeasurements.reduce((a, b) => a + b, 0) / sentimentMeasurements.length
    : null;

  let sentimentLabel = '—';
  let sentimentTone = 'text-slate-400';
  let sentimentNote: string | undefined;
  if (sentimentAvg === null) {
    sentimentLabel = 'Not measurable';
    sentimentTone = 'text-slate-400';
    sentimentNote = totalRows === 0
      ? 'No data in current filter scope'
      : 'No prompt mentioned the brand in this scope';
  } else if (sentimentAvg >= 7) {
    sentimentLabel = 'Positive';
    sentimentTone = 'text-emerald-600';
  } else if (sentimentAvg >= 4) {
    sentimentLabel = 'Neutral';
    sentimentTone = 'text-sky-600';
  } else {
    sentimentLabel = 'Negative';
    sentimentTone = 'text-amber-600';
  }
  if (sentimentLabel !== 'Not measurable') {
    sentimentNote = `Based on ${sentimentMeasurements.length} model response${sentimentMeasurements.length === 1 ? '' : 's'}`;
  }

  // Brand accuracy: average of per-result `accuracy` (0-10) across rows
  // where the brand was actually mentioned. Surface as a 0-100% figure.
  const accuracyMeasurements = presenceRows
    .map((r: any) => (r.accuracy === null || r.accuracy === undefined ? null : Number(r.accuracy)))
    .filter((a: number | null): a is number => a !== null);
  const accuracyAvg = accuracyMeasurements.length > 0
    ? accuracyMeasurements.reduce((a, b) => a + b, 0) / accuracyMeasurements.length
    : null;
  const accuracyValue = accuracyAvg === null ? '—' : `${Math.round(accuracyAvg * 10)}%`;
  const accuracyNote = presenceRows.length === 0
    ? 'No brand mentions to verify'
    : `Across ${presenceRows.length} brand mention${presenceRows.length === 1 ? '' : 's'}`;

  // Share of voice = brand presence rate within the scoped rows.
  const visibility = totalRows > 0 ? Math.round((presenceRows.length / totalRows) * 100) : 0;
  const visibilityNote = totalRows > 0
    ? `${presenceRows.length} of ${totalRows} response${totalRows === 1 ? '' : 's'} mentioned you`
    : 'No data in current filter scope';

  return [
    { label: 'Overall Sentiment', value: sentimentLabel, tone: sentimentTone, note: sentimentNote },
    { label: 'Brand Accuracy Score', value: accuracyValue, tone: 'text-[#3393F2]', note: accuracyNote },
    { label: 'AI Share of Voice', value: `${visibility}%`, tone: 'text-[#3393F2]', note: visibilityNote },
  ];
}, [reportData, categoryFilter, modelFilter]);

// ── Trend chart data ─────────────────────────────────────────────────────
//
// The three Visibility-section charts (Citations / Mentions rate / Share
// of Voice) all derive from the same /trends payload — one X point per
// completed AiRun, ordered ascending by startedAt. The frontend keeps the
// chart component dumb (it just renders rows + series); we shape the
// rows + series here so empty/single-run states are handled honestly.

const formatRunDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

// Citations chart — per-run, per-model citation totals.
const citationsChart = useMemo(() => {
  const series = [
    { key: 'chatgpt', label: 'ChatGPT', stroke: '#E9897E', match: 'gpt' },
    { key: 'claude', label: 'Claude', stroke: '#79A7F2', match: 'claude' },
    { key: 'gemini', label: 'Gemini', stroke: '#8DD9E8', match: 'gemini' },
    { key: 'google', label: 'Google AI Overview', stroke: '#4285F4', match: 'google-gre' },
  ] as const;
  // Drop series the user has filtered out via the modelFilter pill (header).
  const visibleSeries = modelFilter.size === 0
    ? series
    : series.filter((s) => {
      for (const m of modelFilter) if (m.toLowerCase().includes(s.match)) return true;
      return false;
    });
  const data = trendsData.runs.map((run) => {
    const row: Record<string, string | number> = { date: formatRunDate(run.startedAt) };
    for (const s of visibleSeries) {
      // Find any model id containing the matcher (gpt-4o-mini, claude-sonnet-4.5...).
      const found = Object.entries(run.perModel).find(([m]) => m.toLowerCase().includes(s.match));
      row[s.key] = found ? found[1].cites : 0;
    }
    return row;
  });
  return { data, series: visibleSeries.map(({ key, label, stroke }) => ({ key, label, stroke })) };
}, [trendsData, modelFilter]);

// Mentions rate trend — brand vs total competitor mentions per run.
const mentionsChart = useMemo(() => {
  const series = [
    { key: 'brand', label: 'Brand mentions', stroke: '#6EA8FF' },
    { key: 'competitors', label: 'Competitors Mentions', stroke: '#7BD8EB' },
  ] as const;
  const data = trendsData.runs.map((run) => ({
    date: formatRunDate(run.startedAt),
    brand: run.brandMentions,
    competitors: run.competitorMentions,
  }));
  return { data, series };
}, [trendsData]);

// Share of Voice — brand + the top 4 competitors observed in the latest
// run. Each series shows that host's mention count per run, so users see
// their position vs real competitors over time.
const shareOfVoiceChart = useMemo(() => {
  const palette = ['#6EA8FF', '#E9897E', '#8DD9E8', '#9D8CF4', '#FBBF77'];
  const brandKey = 'brand';
  const compKeys = trendsData.topCompetitors.slice(0, 4);
  const brandLabel = reportData?.domainInfo?.companyName
    || reportData?.domainInfo?.host
    || 'Your brand';

  const series = [
    { key: brandKey, label: brandLabel, stroke: palette[0] },
    ...compKeys.map((host, i) => ({
      key: `c_${i}`,
      label: host,
      stroke: palette[(i + 1) % palette.length],
    })),
  ];

  const data = trendsData.runs.map((run) => {
    const row: Record<string, string | number> = { date: formatRunDate(run.startedAt) };
    row[brandKey] = run.brandMentions;
    compKeys.forEach((host, i) => {
      row[`c_${i}`] = run.perCompetitor?.[host] ?? 0;
    });
    return row;
  });
  return { data, series };
}, [trendsData, reportData]);

// Empty-state copy shared by all three trend charts. Uses the same phrasing
// so the message blends with the rest of the dashboard's "honest empty"
// language elsewhere.
const trendEmptyMessage = (() => {
  if (trendsData.runs.length === 0) return 'Run an audit to see trend data';
  if (trendsData.runs.length === 1) return 'Trend appears after your next audit';
  return undefined;
})();

const filteredPrompts = useMemo(() => {
  if (!reportPrompts.length) return [];
  let items = [...reportPrompts];
  // Hide rows that were never queried — empty `results` array means no
  // AI calls ran for this prompt, so the metrics row is all zeros
  // AI calls ran for this prompt, so the metrics row is all zeros
  // and adds no signal. Only show items the user actually selected and ran.
  items = items.filter(
    (p: any) => p.type?.toLowerCase() === 'prompt' && Array.isArray(p?.results) && p.results.length > 0,
  );

  // Category filter (header Filters dropdown). Empty set = show all.
  if (categoryFilter.size > 0) {
    items = items.filter((p: any) => p.category && categoryFilter.has(p.category));
  }

  // Model filter — narrow each prompt's `results` array to only the selected
  // models. If a prompt ends up with zero matching results it disappears.
  if (modelFilter.size > 0) {
    items = items
      .map((p: any) => ({
        ...p,
        results: (p.results ?? []).filter((r: any) => modelFilter.has(r.model)),
      }))
      .filter((p: any) => p.results.length > 0);
  }

  return items.sort((a, b) => {
    if (promptSort === 'sentiment') {
      return Number(b?.avgSentiment ?? 0) - Number(a?.avgSentiment ?? 0);
    }
    if (promptSort === 'position') {
      const positionFor = (row: any) => {
        const rank = Number(row?.bestRank);
        return Number.isFinite(rank) && rank > 0 ? rank : Number.POSITIVE_INFINITY;
      };
      return positionFor(a) - positionFor(b);
    }
    const alphabeticalCompare = String(a?.phrase ?? '').localeCompare(String(b?.phrase ?? ''), undefined, {
      sensitivity: 'base',
    });
    return promptSort === 'alphabetical-desc' ? -alphabeticalCompare : alphabeticalCompare;
  });
}, [reportPrompts, promptSort, categoryFilter, modelFilter]);
// Manual refetch for the "Retry" affordance on the opportunities card —
// hits /report again so the LLM enrichment cache is exercised (or rebuilt
// if the run summary was cleared).
const [opportunitiesRetrying, setOpportunitiesRetrying] = useState(false);
const [retryError, setRetryError] = useState<string | null>(null);
const handleRetryOpportunities = useCallback(async () => {
  if (!domainId) {
    setRetryError('No domain selected.');
    return;
  }
  setOpportunitiesRetrying(true);
  setRetryError(null);
  try {
    // Invalidate the cached /report for this domain+run; the useReport
    // hook above refetches automatically and updates reportData.
    await queryClient.invalidateQueries({ queryKey: aiResultsKeys.report(domainId, selectedRunId) });
  } catch (err: any) {
    setRetryError(err?.message ?? 'Retry failed');
  } finally {
    setOpportunitiesRetrying(false);
  }
}, [domainId, selectedRunId, queryClient]);

// SSE listener — flips running rows to done/failed when n8n pings back.
useEffect(() => {
  const runningKeys = Object.entries(generationByKey).filter(([, s]) => s.kind === 'running');
  if (runningKeys.length === 0) return;

  const token = localStorage.getItem('authToken');
  if (!token) return;

  const apiBase = import.meta.env.VITE_API_URL ?? 'http://localhost:3002';
  const url = `${apiBase}/api/sse?token=${encodeURIComponent(token)}`;
  const es = new EventSource(url);
  es.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg?.type !== 'generation:update') return;
      const jobId = msg.jobId as string | undefined;
      if (!jobId) return;
      setGenerationByKey((prev) => {
        const next = { ...prev };
        for (const [key, state] of Object.entries(prev)) {
          if (state.kind !== 'running' || state.jobId !== jobId) continue;
          if (msg.status === 'completed') next[key] = { kind: 'done', draftId: msg.draftId ?? null };
          else if (msg.status === 'failed') next[key] = { kind: 'failed', error: msg.error ?? 'Generation failed' };
          else next[key] = { kind: 'running', jobId, progress: msg.progress ?? state.progress, phase: msg.phase ?? state.phase };
        }
        return next;
      });
    } catch {
      /* ignore non-JSON */
    }
  };
  return () => es.close();
}, [generationByKey]);

return (
  <>
    <div className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1530px] items-center px-4 py-3 sm:px-6">
        <AIResultsBreadcrumbs
          mode="static"
          prefixLabel="AI Visibility"
          prefixHref={resolveSidebarNavigation('ai-visibility').path}
          pageLabel="AI Results"
          pageHref={maskedDomainId ? resolveAIResultsNavigation('ai-results', maskedDomainId) : undefined}
          currentLabel={currentReportSectionTitle ?? 'Overview'}
        />
      </div>
    </div>

    <section className="flex w-full flex-col bg-white px-4 py-2 sm:px-6">
      {!gscConnected && (
        <div className="flex w-full flex-col gap-4 rounded-xl bg-[#F1F6FF] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold leading-[1.35] tracking-normal text-[#7BA0E8] sm:text-xl">
              Connect your site
            </h2>
            <p className="mt-1 text-sm font-normal leading-normal text-[#535862] sm:text-base">
              Integrate your website to automate content publishing and optimization.
            </p>
          </div>
          <Button
            onClick={() => navigate('/dashboard?tab=integration')}
            className="h-[37px] w-full shrink-0 rounded-lg bg-[#2D4059] px-4 gap-12text-sm font-semibold text-white shadow-[0_1px_2px_0_#1018280D] hover:bg-[#24364d] sm:w-auto"
          >
            <IntegrateSiteIcon />
            <span>Connect your website</span>
          </Button>
        </div>
      )}

      <div id="ai-results-summary" data-title="Overview" className="flex w-full flex-col gap-6 px-0 py-6">
        <div className="flex w-full flex-col gap-4 lg:flex-row lg:flex-nowrap lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold text-gray-950 sm:text-2xl">Your AI Visibility Report</h1>
            <p className="mt-2 max-w-3xl text-base font-normal leading-normal tracking-normal text-slate-600">
              See how your domain appears across AI platforms and identify opportunities to improve your AI visibility and performance.
            </p>
          </div>

          <div className="flex w-full flex-wrap items-center gap-[9px] lg:ml-auto lg:w-auto lg:justify-end">
            <Button
              variant="outline"
              size="icon"
              aria-label="Download"
              className="h-[41px] w-[41px] shrink-0 rounded-lg border-2 border-[#F9F9F9] bg-[#F9F9F9] p-0 shadow-[0_1px_2px_0_#1018280D]"
            >
              <ReportDownloadIcon />
            </Button>
            {/* Run picker — replaces the static "7 days" pill. Lists past
                  completed AiRuns for this domain so the user can A/B against
                  earlier audits. Hidden when only one (or zero) runs exist. */}
            {pastRuns.length > 1 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-[41px] rounded-lg border border-[#D5D7DA] bg-white px-3 text-xs text-[#374252] shadow-[0_1px_2px_0_#1018280D]"
                  >
                    <Calendar className="mr-1.5 h-3.5 w-3.5 text-[#717680]" strokeWidth={1.8} />
                    {selectedRunId
                      ? new Date(pastRuns.find((r) => r.id === selectedRunId)?.startedAt ?? Date.now()).toLocaleDateString()
                      : 'Latest run'}
                    <ChevronDown className="ml-1.5 h-3.5 w-3.5 text-[#717680]" strokeWidth={1.8} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[260px] p-1.5">
                  <DropdownMenuItem
                    className="rounded-md px-3 py-2 cursor-pointer"
                    onClick={() => setSelectedRunId(null)}
                  >
                    <span className="flex-1 text-[12px] font-medium text-slate-900">Latest run</span>
                    {!selectedRunId ? <Check className="h-3.5 w-3.5 text-blue-600" /> : null}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {pastRuns.map((r) => (
                    <DropdownMenuItem
                      key={r.id}
                      className="flex items-center gap-2 rounded-md px-3 py-2 cursor-pointer"
                      onClick={() => setSelectedRunId(r.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-medium text-slate-900">
                          {new Date(r.startedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {r.visibilityScore !== null ? `${Math.round(r.visibilityScore)}% visibility` : '—'} · {r.totalQueries ?? '—'} queries
                        </div>
                      </div>
                      {selectedRunId === r.id ? <Check className="h-3.5 w-3.5 text-blue-600" /> : null}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button
                variant="outline"
                disabled
                className="h-[41px] rounded-lg border border-[#D5D7DA] bg-white px-3 text-xs text-[#717680] shadow-[0_1px_2px_0_#1018280D] cursor-default"
              >
                <Calendar className="mr-1.5 h-3.5 w-3.5 text-[#717680]" strokeWidth={1.8} />
                Latest run
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="h-[41px] rounded-lg border border-[#D5D7DA] bg-[#FFFFFF] px-3 text-xs capitalize text-[#717680] shadow-[0_1px_2px_0_#1018280D]"
                >
                  <ReportSortIcon />
                  {promptSort === 'alphabetical'
                    ? 'Alphabetical A-Z'
                    : promptSort === 'alphabetical-desc'
                      ? 'Alphabetical Z-A'
                      : promptSort === 'sentiment'
                        ? 'Sentiment'
                        : 'Position'}
                  <ChevronDown className="ml-1.5 h-3.5 w-3.5 text-[#717680]" strokeWidth={1.8} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[180px]">
                <DropdownMenuItem onClick={() => setPromptSort('alphabetical')}>Alphabetical A-Z</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPromptSort('alphabetical-desc')}>Alphabetical Z-A</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPromptSort('sentiment')}>Sentiment</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPromptSort('position')}>Position</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {/* Filters — model + category, multi-select. Active count
                  shows on the trigger so the user can tell at a glance
                  whether they're looking at filtered or full data. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="h-[41px] rounded-lg border border-[#D5D7DA] bg-white px-3 text-xs text-[#374252] shadow-[0_1px_2px_0_#1018280D]"
                >
                  <Filter className="mr-1.5 h-3.5 w-3.5 text-[#717680]" strokeWidth={1.8} />
                  Filters
                  {modelFilter.size + categoryFilter.size > 0 ? (
                    <span className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-semibold text-white">
                      {modelFilter.size + categoryFilter.size}
                    </span>
                  ) : null}
                  <ChevronDown className="ml-1.5 h-3.5 w-3.5 text-[#717680]" strokeWidth={1.8} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[260px] p-2">
                <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Models
                </div>
                {(['gpt-4o-mini', 'claude-sonnet-4-5', 'gemini-2.0-flash'] as const).map((m) => {
                  const label = m.includes('gpt') ? 'ChatGPT' : m.includes('claude') ? 'Claude' : 'Gemini';
                  const on = modelFilter.has(m);
                  return (
                    <DropdownMenuItem
                      key={m}
                      onSelect={(e) => {
                        e.preventDefault(); // keep menu open on toggle
                        setModelFilter((prev) => {
                          const next = new Set(prev);
                          on ? next.delete(m) : next.add(m);
                          return next;
                        });
                      }}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer"
                    >
                      <span className={`flex h-4 w-4 items-center justify-center rounded border ${on ? 'border-blue-500 bg-blue-500 text-white' : 'border-slate-300 bg-white text-transparent'}`}>
                        <Check className="h-3 w-3" />
                      </span>
                      <span className="text-[12px] text-slate-700">{label}</span>
                    </DropdownMenuItem>
                  );
                })}
                <DropdownMenuSeparator />
                <div className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Categories
                </div>
                {([
                  ['unbranded_recommendation', 'Unbranded recommendation'],
                  ['top_n_listicle', 'Top-N listicle'],
                  ['alternatives_to_competitor', 'Alternatives to competitor'],
                  ['problem_statement', 'Problem statement'],
                ] as const).map(([key, label]) => {
                  const on = categoryFilter.has(key);
                  return (
                    <DropdownMenuItem
                      key={key}
                      onSelect={(e) => {
                        e.preventDefault();
                        setCategoryFilter((prev) => {
                          const next = new Set(prev);
                          on ? next.delete(key) : next.add(key);
                          return next;
                        });
                      }}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer"
                    >
                      <span className={`flex h-4 w-4 items-center justify-center rounded border ${on ? 'border-blue-500 bg-blue-500 text-white' : 'border-slate-300 bg-white text-transparent'}`}>
                        <Check className="h-3 w-3" />
                      </span>
                      <span className="text-[12px] text-slate-700">{label}</span>
                    </DropdownMenuItem>
                  );
                })}
                {(modelFilter.size + categoryFilter.size > 0) ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => { setModelFilter(new Set()); setCategoryFilter(new Set()); }}
                      className="rounded-md px-2 py-1.5 text-[12px] text-slate-500 cursor-pointer hover:text-slate-700"
                    >
                      Clear all filters
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
            {/* Start New Audit — dropdown blends with the other header
                  controls (white, slate text). Two re-audit modes: a full
                  re-crawl from Step 2, or jump straight back to picking
                  prompts on the existing crawl + competitors. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  className="h-[41px] rounded-lg bg-gradient-to-r from-[#2D4059] to-[#4C74C2] px-4 text-xs text-white shadow-[0_1px_2px_0_#1018280D] hover:opacity-95"
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Audit Brand Visibility
                  <ChevronDown className="ml-1.5 h-3.5 w-3.5" strokeWidth={1.8} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[280px] p-1.5">
                <DropdownMenuItem
                  className="flex flex-col items-start gap-0.5 rounded-md px-3 py-2.5 cursor-pointer"
                  onClick={() => {
                    const id = reportData?.domainInfo?.id;
                    if (id) navigate(`/ai-checker-v2?domain=${id}&restart=competitors`);
                  }}
                >
                  <span className="text-[12px] font-semibold text-slate-900">Re-audit from start</span>
                  <span className="text-[11px] text-slate-500 leading-snug">
                    Skip the crawl. Refresh competitors and land on the competitor selection step.
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="flex flex-col items-start gap-0.5 rounded-md px-3 py-2.5 cursor-pointer"
                  onClick={() => {
                    const id = reportData?.domainInfo?.id;
                    if (id) navigate(`/ai-checker-v2?domain=${id}&restart=topics`);
                  }}
                >
                  <span className="text-[12px] font-semibold text-slate-900">Pick new prompts</span>
                  <span className="text-[11px] text-slate-500 leading-snug">
                    Skip the crawl. Generate fresh prompts on top of the existing competitors and pick which to run.
                  </span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="rounded-md px-3 py-2 text-[12px] text-slate-600 cursor-pointer"
                  onClick={() => navigate('/ai-checker-v2')}
                >
                  Audit a different domain →
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:grid-rows-2 xl:items-stretch">
          {loading || metricCards.length === 0 ? (
            <>
              <div className="h-[230px] w-full animate-pulse rounded-xl border border-slate-200 bg-gray-50 sm:col-span-2 xl:row-span-2 xl:min-h-[310px]" />
              {Array(6).fill(0).map((_, i) => (
                <div key={i} className="h-[112px] w-full animate-pulse rounded-xl border border-slate-200 bg-gray-50" />
              ))}
            </>
          ) : (
            [...metricCards, ...scoreCards].map((card, index) =>
              'details' in card ? (
                <MetricCard
                  key={card.title}
                  card={card as MetricCardData}
                />
              ) : (
                <Card
                  key={card.label}
                  className={cn(
                    'h-full rounded-xl border border-[#D5D7DA] bg-white shadow-[0_1px_2px_0_#1018280D]',
                    index === 0 ? 'sm:col-span-2 xl:row-span-2' : '',
                  )}
                >
                  <CardContent className="flex h-full flex-col gap-3 p-4 sm:p-5">
                    <CardTitleWithTip title={card.label} />
                    {card.note ? <p className="text-sm font-medium text-[#535862]">{card.note}</p> : null}
                    <p className={cn('text-[27px] font-semibold leading-[1] tracking-normal', card.tone)}>
                      {card.value}
                    </p>
                  </CardContent>
                </Card>
              )
            )
          )}
        </div>

        <div id="ai-results-top-prompts" data-title="Top Performing Prompts">
          {loading ? (
            <div className="h-[400px] w-full animate-pulse rounded-xl border border-slate-200 bg-gray-50" />
          ) : (
            <PromptTable
              data={filteredPrompts}
              selectedRowIds={selectedRowIds}
              onToggleRow={handleToggleRow}
              onSetSelectedRows={handleSetSelectedRows}
              onOpenWorksheetModal={handleOpenWorksheetModal}
              reportRunId={selectedRunId}
              domainId={reportData?.domainInfo?.id ?? null}
            />
          )}
        </div>
      </div>
    </section>

    <section className="grid w-full grid-cols-1 gap-6 bg-white px-4 py-0 sm:px-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">

        <Card id="ai-results-visibility-coverage" data-title="Visibility Insights" className="min-w-0 rounded-xl border border-[#D5D7DA] bg-white shadow-[0_1px_2px_0_#1018280D]">
        <CardHeader className="flex flex-col gap-3 px-4 pb-2 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base font-semibold text-[#2D4059]">Visibility Insights</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="h-8 rounded-lg border border-[#D5D7DA] bg-white px-3 text-[11px] text-[#717680] shadow-[0_1px_2px_0_#1018280D] hover:bg-white"
            >
              <Calendar className="mr-1.5 h-3.5 w-3.5 text-[#717680]" strokeWidth={1.8} />
              7 days
              <ChevronDown className="ml-1.5 h-3.5 w-3.5 text-[#717680]" strokeWidth={1.8} />
            </Button>
            <FilterPill label="Sort" icon="sort" />
          </div>
        </CardHeader>
        <CardContent className="space-y-8 px-4 pb-4">
          <AreaChartCard
            title="Share of Voice"
            subtitle="Idenitfy visibility gaps and uncover opportunities to capture more AI-driven traffic."
            data={shareOfVoiceChart.data}
            series={shareOfVoiceChart.series}
            tooltipTitle="AI Share of voice"
            emptyMessage={trendEmptyMessage}
          />
          <AreaChartCard
            title="Citations"
            subtitle="Track brand citations across AI models."
            data={citationsChart.data}
            series={citationsChart.series}
            tooltipTitle="Citations"
            emptyMessage={trendEmptyMessage}
          />
          <AreaChartCard
            title="Mentions rate trend"
            subtitle="Monitor how often your brand is mentioned compared to competitors."
            data={mentionsChart.data}
            series={mentionsChart.series}
            tooltipTitle="Mentions"
            emptyMessage={trendEmptyMessage}
          />
        </CardContent>
      </Card>

      <div className="min-w-0 grid gap-6 xl:h-full xl:min-h-0 xl:grid-rows-[minmax(0,0.4fr)_minmax(0,0.6fr)]">

        <Card className="h-full rounded-xl border border-[#DDE7F5] bg-[#F1F6FF] shadow-[0_1px_2px_0_#1018280D]">
          <CardHeader className="flex flex-row items-start justify-between px-4 pb-3 pt-4">
            <div className="min-w-0">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[18px] font-semibold leading-normal text-[#414651]">
                  Suggested Next Actions
                </h3>
                <span aria-hidden="true" className="flex items-center gap-0.5 text-[#98A2B3]">
                  <ChevronRight className="h-3.5 w-3.5 -translate-x-0.5" />
                  <ChevronRight className="h-3.5 w-3.5 -translate-x-1.5" />
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 px-4 pb-4 pt-4">
            {suggestedNextActions.map((action) => {
              return (
                <button
                  key={action.title}
                  type="button"
                  onClick={action.onClick}
                  className="group flex w-full items-center gap-3 rounded-2xl border border-[#E5EEF9] bg-white px-4 py-4 text-left shadow-[0_1px_2px_0_#1018280D] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#D5D7DA] hover:shadow-[0_4px_12px_0_#10182814] focus:outline-none focus:ring-2 focus:ring-[#7BA0E8] focus:ring-offset-2"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#DDE7F5] bg-[#F7FAFF]">
                    <img src={action.iconSrc} alt="" className="h-5 w-5 object-contain" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[14px] font-medium leading-5 text-[#414651]">
                        {action.title}
                      </span>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-[#667085]">
                      {action.description}
                    </p>
                  </div>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F8FAFD] text-[#4C74C2] transition-transform duration-200 group-hover:translate-x-0.5">
                    <ChevronRight className="h-5 w-5" strokeWidth={2} />
                  </span>
                </button>
              );
            })}
          </CardContent>
        </Card>

        <Card id="ai-results-opportunities" data-title="Outrank Opportunities" className="h-full min-h-0 rounded-xl border border-[#D5D7DA] bg-white shadow-[0_1px_2px_0_#1018280D]">
          <CardHeader className="flex flex-row items-start justify-between px-4 pb-3 pt-4">
            <div className="min-w-0">
              <CardTitleWithTip title="Opportunities to Outrank Competitors" />
              <p className="mt-2 text-sm leading-[150%] text-[#535862]">
                Prioritized recommendations to improve rankings, increase citations, and outperform competitors in Al search.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRetryOpportunities}
                disabled={opportunitiesRetrying}
                className="flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 disabled:opacity-50"
                title="Re-run analysis"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', opportunitiesRetrying && 'animate-spin')} />
                Retry
              </button>
              <button className="whitespace-nowrap text-xs font-medium text-blue-600">View all</button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 px-4 pb-4 min-h-0">
            <div className="flex flex-wrap gap-2">
              <FilterPill label="Sort: By Models" icon="sort" />
              <FilterPill label="Filters" icon="filter" />
            </div>
            {/* Inner scroll container — opportunity briefs can be long and
                 *  numerous; cap the card height so the layout doesn't push the
                 *  charts column off-screen. */}
            <div className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
              {(reportData?.opportunities ?? []).length === 0 ? (
                <div className="flex flex-col items-start gap-2 rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-3">
                  <p className="text-xs text-slate-600">
                    No outrank opportunities yet. This usually means the latest run hasn't completed enrichment, or selected competitors didn't appear in any answer.
                  </p>
                  {retryError ? (
                    <p className="text-xs text-rose-600">Error: {retryError}</p>
                  ) : null}
                  <button
                    type="button"
                    onClick={handleRetryOpportunities}
                    disabled={opportunitiesRetrying}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-100 disabled:opacity-50"
                  >
                    <RefreshCw className={cn('h-3.5 w-3.5', opportunitiesRetrying && 'animate-spin')} />
                    {opportunitiesRetrying ? 'Retrying…' : 'Retry analysis'}
                  </button>
                </div>
              ) : null}
              {(reportData?.opportunities ?? []).map((opp: any) => (
                <OpportunityRow
                  key={opp.key}
                  title={opp.title}
                  rationale={opp.rationale}
                  recommendedAngle={opp.recommendedAngle}
                  brief={opp.brief}
                  severity={SEVERITY_LABEL[opp.severity] ?? opp.severity}
                  priority={TRAFFIC_LABEL[opp.trafficPotential] ?? opp.trafficPotential}
                  onAction={() =>
                    handleGenerateContent(opp.key, {
                      kind: 'opportunity',
                      title: opp.title,
                      rationale: opp.rationale,
                      primaryKeyword: opp.primaryKeyword,
                      longtailKeywords: opp.longtailKeywords ?? [],
                      suggestedTemplate: opp.suggestedTemplate ?? 'blog',
                      category: opp.category ?? null,
                      intentStage: opp.intentStage ?? null,
                      recommendedAngle: opp.recommendedAngle,
                      brief: opp.brief,
                    })
                  }
                  generation={generationByKey[opp.key]}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </section>

    <section className="mx-4 mb-6 flex flex-col items-center gap-[0.9375rem] rounded-xl bg-[#F9F9F9] px-6 py-12 text-center sm:mx-6 sm:px-12 lg:px-[7.9375rem] lg:py-[3.8125rem]">
      <h2 className="text-2xl font-semibold text-gray-950">Connect Google services</h2>
      <p className="max-w-3xl text-sm text-gray-500">
        Unlock deeper insights by connecting Google Analytics and Search Console.
      </p>
      <Button className="h-9 rounded-lg bg-[#2f4462] px-4 text-xs text-white hover:bg-[#263852]">
        <UserRound className="mr-2 h-3.5 w-3.5" />
        Connect Google
      </Button>
    </section>

    <WorksheetPickerModal
      open={isWorksheetModalOpen}
      selectedCount={pendingGeneration ? 1 : selectedCount}
      activeWorksheetId={activeWorksheetId}
      worksheets={worksheetOptions}
      loading={worksheetOptionsLoading}
      onOpenChange={handleWorksheetModalOpenChange}
      onWorksheetSelect={setActiveWorksheetId}
      onAddToWorksheet={handleAddToWorksheet}
      onCreateNewWorksheet={handleCreateNewWorksheet}
    />
    <CreateWorksheetModal
      open={isCreateWorksheetModalOpen}
      name={newWorksheetName}
      isSubmitting={isCreatingWorksheet}
      error={createWorksheetError}
      onOpenChange={handleCreateWorksheetModalOpenChange}
      onNameChange={setNewWorksheetName}
      onSubmit={handleConfirmCreateWorksheet}
    />
  </>
);
};

export default AIResultsReportPreview;

