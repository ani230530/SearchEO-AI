import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { useNavigate, useParams } from 'react-router-dom';
import { apiGet } from '../services/apiClient';
import { cn } from '@/lib/utils';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  BarChart3,
  Bot,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  Filter,
  Globe2,
  LayoutDashboard,
  LineChart,
  Languages,
  LayoutGrid,
  Link2,
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
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { AIResultsLayout } from '@/features/ai-results/components/AIResultsLayout';
import { maskDomainId, unmaskDomainId } from '../lib/domainUtils';

const getDomainHost = (rawUrl: string | undefined): string => {
  if (!rawUrl) return '';
  return rawUrl.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0];
};

const getDomainLogo = (rawUrl: string | undefined): string | null => {
  const host = getDomainHost(rawUrl);
  if (!host) return null;
  return `https://img.logo.dev/${host}?token=pk_DTdFFG1JT9WOCjATvZEzIA&size=64`;
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

const privateVisibilityItems = [
  { title: 'Best SaaS analytics tools', count: 'Found in 2 competitors', status: 'positive' },
  { title: 'Enterprise analytics comparison', count: 'Found in 2 competitors', status: 'danger' },
  { title: 'Enterprise analytics comparison', count: 'Position #2, 4 competitors', status: 'danger' },
  { title: 'Best SaaS analytics tools', count: 'Found in 2 competitors', status: 'positive' },
  { title: 'Enterprise analytics comparison', count: 'Found in 2 competitors', status: 'danger' },
];

const opportunityItems = [
  { title: 'Create comparison analytics page', priority: 'Very High', severity: 'Critical' },
  { title: 'Create experimental content analysis', priority: 'High', severity: 'Critical' },
  { title: 'Create experimental content analysis', priority: 'High', severity: 'Critical' },
  { title: 'Create experimental content analysis guide', priority: 'High', severity: 'Critical' },
];

const shareOfVoiceData = [
  { date: '10 April', semrush: 620, ahref: 220, athenaHq: 120, scrunch: 80 },
  { date: '11 April', semrush: 960, ahref: 300, athenaHq: 180, scrunch: 120 },
  { date: '12 April', semrush: 1800, ahref: 520, athenaHq: 340, scrunch: 220 },
  { date: '13 April', semrush: 2300, ahref: 780, athenaHq: 460, scrunch: 320 },
  { date: '14 April', semrush: 1850, ahref: 820, athenaHq: 520, scrunch: 400 },
  { date: '15 April', semrush: 1700, ahref: 1120, athenaHq: 700, scrunch: 560 },
  { date: '16 April', semrush: 5200, ahref: 1750, athenaHq: 980, scrunch: 820 },
  { date: '17 April', semrush: 5800, ahref: 2050, athenaHq: 1300, scrunch: 1100 },
  { date: '18 April', semrush: 3400, ahref: 1120, athenaHq: 900, scrunch: 720 },
  { date: '19 April', semrush: 900, ahref: 3800, athenaHq: 1700, scrunch: 1400 },
  { date: '20 April', semrush: 1200, ahref: 5200, athenaHq: 2400, scrunch: 1900 },
];

const citationsData = [
  { date: 'April 25', chatgpt: 920, gemini: 220, claude: 110 },
  { date: 'May 25', chatgpt: 940, gemini: 260, claude: 140 },
  { date: 'June 25', chatgpt: 2100, gemini: 440, claude: 220 },
  { date: 'July 25', chatgpt: 2600, gemini: 620, claude: 320 },
  { date: 'Aug 25', chatgpt: 1550, gemini: 420, claude: 230 },
  { date: 'Sept 25', chatgpt: 1450, gemini: 380, claude: 180 },
  { date: 'Oct 25', chatgpt: 1750, gemini: 460, claude: 240 },
  { date: 'Nov 25', chatgpt: 2450, gemini: 680, claude: 300 },
  { date: 'Dec 25', chatgpt: 5200, gemini: 1350, claude: 760 },
  { date: 'Jan 26', chatgpt: 6900, gemini: 1750, claude: 980 },
  { date: 'Feb 26', chatgpt: 4400, gemini: 1600, claude: 1180 },
  { date: 'Mar 26', chatgpt: 3200, gemini: 1180, claude: 860 },
  { date: 'April 26', chatgpt: 860, gemini: 1100, claude: 760 },
  { date: 'May 26', chatgpt: 1200, gemini: 3600, claude: 2200 },
];

const mentionsData = [
  { date: 'April 25', brand: 120, competitors: 260 },
  { date: 'May 25', brand: 180, competitors: 320 },
  { date: 'June 25', brand: 260, competitors: 420 },
  { date: 'July 25', brand: 220, competitors: 380 },
  { date: 'Aug 25', brand: 80, competitors: 120 },
  { date: 'Sept 25', brand: 90, competitors: 140 },
  { date: 'Oct 25', brand: 160, competitors: 220 },
  { date: 'Nov 25', brand: 320, competitors: 620 },
  { date: 'Dec 25', brand: 1000, competitors: 2600 },
  { date: 'Jan 26', brand: 1150, competitors: 2700 },
  { date: 'Feb 26', brand: 1050, competitors: 1800 },
  { date: 'Mar 26', brand: 820, competitors: 1500 },
  { date: 'April 26', brand: 650, competitors: 1300 },
  { date: 'May 26', brand: 2100, competitors: 3200 },
];

const shareOfVoiceSeries = [
  { key: 'semrush', label: 'Semrush', stroke: '#E9897E' },
  { key: 'ahref', label: 'Ahref', stroke: '#8DD9E8' },
  { key: 'athenaHq', label: 'Athena HQ', stroke: '#79A7F2' },
  { key: 'scrunch', label: 'Scrunch', stroke: '#9D8CF4' },
] as const;

const citationsSeries = [
  { key: 'chatgpt', label: 'ChatGPT', stroke: '#E9897E' },
  { key: 'gemini', label: 'Gemini', stroke: '#8DD9E8' },
  { key: 'claude', label: 'Claude', stroke: '#79A7F2' },
] as const;

const mentionsSeries = [
  { key: 'brand', label: 'Brand mentions', stroke: '#6EA8FF' },
  { key: 'competitors', label: 'Competitors Mentions', stroke: '#7BD8EB' },
] as const;

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
  subLabel?: string;
  subValue?: string;
  iconSrc?: string;
};

interface MetricCardData {
  title: string;
  kind: 'citations' | 'summary';
  details: MetricCardDetail[];
}

const MetricInfoIcon = () => (
  <span
    aria-hidden="true"
    className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[#717680] text-[9px] font-semibold leading-none text-[#717680]"
  >
    i
  </span>
);

const MetricCard = ({ card }: { card: MetricCardData }) => (
  <Card className="h-full rounded-xl border border-[#D5D7DA] bg-white shadow-[0_1px_2px_0_#1018280D]">
    <CardContent className={cn('flex h-full flex-col p-5 sm:p-6', card.kind === 'citations' ? 'min-h-[228px] gap-5' : 'min-h-[120px] gap-4')}>
      <div className="flex items-center gap-1.5">
        <CardTitle className="text-base font-semibold leading-[135%] tracking-normal text-[#535862]">
          {card.title}
        </CardTitle>
        <MetricInfoIcon />
      </div>

      {card.kind === 'citations' ? (
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
        <div className="grid flex-1 grid-cols-2 gap-6">
          {card.details.map((item) => (
            <div key={item.label} className="min-w-0">
              <p className="text-sm font-semibold leading-[150%] tracking-normal text-[#535862]">{item.label}</p>
              <p className="mt-2 text-[27px] font-semibold leading-[1] tracking-normal text-[#3393F2]">
                {item.value}
              </p>
              {item.subLabel ? (
                <p className="mt-2 text-[10px] font-normal leading-[150%] tracking-normal text-[#717680]">
                  {item.subLabel} <span className="text-[#3393F2]">{item.subValue ?? ''}</span>
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </CardContent>
  </Card>
);

const ModelComparisonGrid = ({ results }: { results: any[] }) => {
  const metrics = [
    { label: 'Domain Presence', key: 'presence', type: 'badge' },
    { label: 'Overall Score', key: 'displayOverall', type: 'number' },
    { label: 'Relevance', key: 'displayRelevance', type: 'number' },
    { label: 'Accuracy', key: 'displayAccuracy', type: 'number' },
    { label: 'Sentiments', key: 'displaySentiment', type: 'number' }
  ];

  const getModelIcon = (model?: string) => {
    if (!model) return <Bot className="h-4 w-4 text-gray-400" />;
    const m = model.toLowerCase();
    if (m.includes('gpt')) return <Bot className="h-4 w-4 text-gray-900" />;
    if (m.includes('claude')) return <Sparkles className="h-4 w-4 text-[#d97706]" />;
    if (m.includes('gemini')) return <Globe2 className="h-4 w-4 text-[#2563eb]" />;
    if (m.includes('deep')) return <Zap className="h-4 w-4 text-[#4f46e5]" />;
    return <Zap className="h-4 w-4 text-purple-500" />;
  };

  return (
    <div className="flex flex-col gap-2 lg:px-4 lg:pt-3 lg:pb-4">
      <div className="flex items-center h-9 px-1">
        <h4 className="text-[18px] font-medium text-slate-900">Compare Model response</h4>
      </div>
      <div className="overflow-hidden rounded-none border border-slate-300 bg-white shadow-sm h-[320px]">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-slate-300">
                <th className="bg-white text-[12px] font-medium text-slate-500 py-4 px-4 text-center border-r border-slate-200 w-[160px]">
                  Performance
                </th>
                {results.map((r) => (
                  <th key={r.id} className="py-4 px-4 border-r border-slate-200 last:border-r-0">
                    <div className="flex items-center justify-center gap-2">
                      {getModelIcon(r.model)}
                      <span className="text-[12px] font-medium text-slate-700 whitespace-nowrap">{r.model}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metrics.map((metric) => (
                <tr key={metric.key} className="border-b border-slate-200 last:border-b-0">
                  <td className="bg-slate-50 text-[12px] font-medium text-slate-600 py-4 px-4 text-center border-r border-slate-200">
                    {metric.label}
                  </td>
                  {results.map((r) => (
                    <td key={r.id} className="text-center py-4 px-4 border-r border-slate-200 last:border-r-0">
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

  const getModelIcon = (model?: string) => {
    if (!model) return <Bot className="h-3.5 w-3.5 text-gray-400" />;
    const m = model.toLowerCase();
    if (m.includes('gpt')) return <Bot className="h-3.5 w-3.5 text-emerald-600" />;
    if (m.includes('claude')) return <Sparkles className="h-3.5 w-3.5 text-orange-500" />;
    if (m.includes('gemini')) return <Globe2 className="h-3.5 w-3.5 text-blue-500" />;
    return <Zap className="h-3.5 w-3.5 text-purple-500" />;
  };

  if (!activeResult) return null;

  return (
    <div className="flex flex-col gap-2 lg:px-4 lg:pt-3 lg:pb-4">
      <div className="flex items-center justify-between h-9 px-1">
        <h4 className="text-[18px] font-medium text-slate-900">AI Response</h4>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-gray-400 font-medium">Select Model</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-9 min-w-[140px] justify-between gap-2 rounded-lg border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50">
                <span className="flex items-center gap-2">
                  {getModelIcon(selectedModel)}
                  {selectedModel}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[160px] p-1">
              {results.map((r) => (
                <DropdownMenuItem
                  key={r.id}
                  onClick={() => setSelectedModel(r.model)}
                  className={`flex items-center gap-2 px-2 py-2 text-xs font-medium cursor-pointer ${r.model === selectedModel ? 'bg-gray-50' : ''
                    }`}
                >
                  {getModelIcon(r.model)}
                  {r.model}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Card className="flex flex-col rounded-none border border-slate-300 bg-white shadow-sm h-[320px] overflow-hidden">

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1.4fr_0.6fr] divide-x divide-slate-100 min-h-0">
          {/* Left Column: Response Content (INTERNAL SCROLL HERE) */}
          <div className="flex flex-col min-h-0 bg-slate-50/50 overflow-hidden">
            <div className="flex-1 overflow-y-auto px-8 py-7 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
              <h3 className="text-[20px] font-medium text-slate-800 leading-tight mb-4 tracking-tight">
                {activeResult.phrase || 'Analysis Result'}
              </h3>
              <div className="prose prose-slate prose-sm max-w-none prose-headings:font-medium prose-p:text-slate-600/90 prose-p:leading-relaxed prose-strong:text-slate-800 prose-strong:font-semibold prose-ul:list-disc prose-li:text-slate-600/90">
                <ReactMarkdown>{activeResult.response || 'No response available.'}</ReactMarkdown>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-2 pb-2">
                {Array.isArray(activeResult.sources) && activeResult.sources.length > 0 ? (
                  activeResult.sources.slice(0, 3).map((source: string, idx: number) => (
                    <a
                      key={idx}
                      href={getHref(source)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50/50 border border-blue-100/50 text-[10.5px] font-medium text-blue-600 hover:bg-blue-100/80 transition-all group"
                    >
                      {getDisplayUrl(source)}
                      <ExternalLink className="h-2.5 w-2.5 opacity-60 group-hover:opacity-100" />
                    </a>
                  ))
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

      results.forEach(r => {
        if (r.model !== g.model) return;

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

      return {
        ...g,
        presence,
        mentioned,
        displayRelevance: mentioned ? g.relevance / mentionCount : null,
        displayAccuracy: mentioned ? g.accuracy / mentionCount : null,
        displaySentiment: mentioned ? g.sentiment / mentionCount : null,
        displayOverall: mentioned ? g.overall / mentionCount : null,
        sources: allSources.length > 0 ? allSources : null,
        citations: allCitations.length > 0 ? allCitations : null
      };
    });
  }, [results]);

  const [selectedModel, setSelectedModel] = useState(processedResults[0]?.model || '');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[0.7fr_1.3fr] lg:divide-x lg:divide-slate-300">
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
      {citations.slice(0, 3).map((citation: any, idx: number) => {
        const url = typeof citation === 'object' ? citation.url : String(citation);
        const title = (typeof citation === 'object' ? (citation.title || citation.hostname) : null) || getDisplayUrl(url);
        const text = typeof citation === 'object' ? (citation.citedText || citation.snippet || citation.content) : null;

        return (
          <div key={idx} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:shadow-md group flex flex-col gap-2">
            <h5 className="text-[14px] font-semibold text-slate-800 leading-tight line-clamp-2">
              {title}
            </h5>

            <p className="text-[11px] text-slate-500 leading-relaxed mt-1 mb-3 line-clamp-4">
              {text || "Knowledge base context confirms relevance and authority for this specific analysis. Their transparency helps businesses make informed tech decisions."}
            </p>

            <div className="flex items-center gap-2 mt-auto">
              <button
                onClick={() => window.open(getHref(url), '_blank')}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#f0f7ff] text-[9px] font-bold text-[#2563eb] rounded-lg hover:bg-[#e0efff] transition-all whitespace-nowrap"
              >
                Visit Source
                <Link2 className="h-3 w-3 stroke-[2.5px]" />
              </button>
              <div className="px-2.5 py-1.5 bg-white border border-[#e2e8f0] text-[9px] font-bold text-[#64748b] rounded-lg whitespace-nowrap">
                In-Direct Citation
              </div>
            </div>
          </div>
        );
      })}

      {citations.length > 3 && (
        <div className="text-center py-1">
          <p className="text-[9px] font-medium text-slate-400 italic">
            + {citations.length - 3} more sources cited
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
  onOpenWorksheetModal: (singleRowId?: string) => void;
  title?: string;
};

export const PromptTable = ({
  data,
  selectedRowIds,
  onToggleRow,
  onOpenWorksheetModal,
  title = 'Top searched Prompts',
}: PromptTableProps) => {
  const selectedCount = selectedRowIds.size;
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tableFilter, setTableFilter] = useState<'all' | 'prompt' | 'keyword'>('all');
  const [tableMetric, setTableMetric] = useState<string | null>(null);
  const [showAllQueries, setShowAllQueries] = useState(false);

  const displayData = useMemo(() => {
    let items = [...data];

    // First apply type filter
    if (tableFilter === 'prompt') {
      items = items.filter(item => item.type?.toLowerCase() === 'prompt');
    } else if (tableFilter === 'keyword') {
      items = items.filter(item => item.type?.toLowerCase() === 'keyword');
    }

    // Then apply metric sorting if selected
    if (tableMetric) {
      items.sort((a, b) => {
        const valA = a[tableMetric.toLowerCase()] || 0;
        const valB = b[tableMetric.toLowerCase()] || 0;
        return (typeof valB === 'number' ? valB : 0) - (typeof valA === 'number' ? valA : 0);
      });
    }

    // Default mixed view slicing if no metric is chosen
    if (!showAllQueries && !tableMetric && tableFilter === 'all') {
      const prompts = items.filter(item => item.type?.toLowerCase() === 'prompt').slice(0, 3);
      const keywords = items.filter(item => item.type?.toLowerCase() === 'keyword').slice(0, 2);
      return [...prompts, ...keywords];
    }

    return showAllQueries ? items : items.slice(0, 5);
  }, [data, showAllQueries, tableFilter, tableMetric]);

  return (
    <Card className="rounded-xl border-slate-300 shadow-sm overflow-hidden">
      <CardHeader className="space-y-6 px-6 pt-6 pb-4">
        <div className="flex flex-col gap-1">
          <CardTitle className="text-xl font-bold text-[#1e293b]">{title}</CardTitle>
          <p className="text-sm text-slate-500">
            Compare how AI models respond, cite sources, and surface competitors across queries
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Left side: Search and Add & Analyze */}
          <div className="flex items-center gap-2 flex-1 min-w-0 max-w-[450px]">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Enter your custom phrase/Keyword to analyze"
                className="h-10 w-full rounded-lg border border-slate-300 pl-10 pr-4 text-sm outline-none focus:ring-1 focus:ring-slate-300 transition-all placeholder:text-gray-300"
              />
            </div>
            <Button className="h-10 bg-[#2d3748] text-white hover:bg-[#1a202c] gap-2 rounded-lg px-4 shrink-0 transition-all">
              <Plus className="h-4 w-4" />
              <span className="text-sm font-medium">Add & Analyze</span>
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
                <Button variant="outline" className="h-9 gap-2 border-slate-300 text-slate-600 rounded-lg px-3 capitalize">
                  <BarChart3 className="h-4 w-4" />
                  <span className="text-sm font-medium">{tableFilter === 'all' ? 'Sort' : tableFilter}</span>
                  <ChevronDown className="h-4 w-4 opacity-50 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[150px]">
                <DropdownMenuItem onClick={() => setTableFilter('all')}>Mixed View</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTableFilter('prompt')}>Prompts Only</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTableFilter('keyword')}>Keywords Only</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-9 gap-2 border-slate-300 text-slate-600 rounded-lg px-3">
                  <Filter className="h-4 w-4" />
                  <span className="text-sm font-medium">{tableMetric || 'Filters'}</span>
                  <ChevronDown className="h-4 w-4 opacity-50 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[180px]">
                <DropdownMenuItem onClick={() => setTableMetric(null)}>Clear Filters</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setTableMetric('Sentiment')}>Sentiment Score</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTableMetric('Ranking')}>Ranking</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTableMetric('Position')}>Position</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTableMetric('SOV')}>SOV %</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTableMetric('Competitors')}>Competitor Count</DropdownMenuItem>
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
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-0 pb-3">
        <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-gray-200">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-slate-200 hover:bg-transparent">
                <TableHead className="w-8 px-4">
                  <input type="checkbox" className="h-3.5 w-3.5 rounded border-gray-300 accent-blue-600" />
                </TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-2">Prompts & Keywords</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-2">Sentiment</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-2">Ranking</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-2">Position</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-2">SOV</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-2">Competitors</TableHead>
                <TableHead className="text-right text-[10px] font-bold uppercase tracking-wider text-slate-500 px-4">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayData.map((row) => (
                <Fragment key={row.id}>
                  <TableRow
                    key={row.id}
                    className={`group transition-all duration-200 border-b hover:bg-slate-50/80 cursor-pointer ${expandedId === row.id ? 'bg-slate-50 shadow-sm border-slate-300' : 'border-slate-200'
                      }`}
                    onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}
                  >
                    <TableCell className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={selectedRowIds.has(String(row.id))}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => onToggleRow(String(row.id))}
                          aria-label={`Select ${row.phrase ?? row.prompt ?? 'row'}`}
                          className="h-3.5 w-3.5 rounded border-gray-300 accent-blue-600"
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedId(expandedId === row.id ? null : row.id);
                          }}
                          className="text-gray-400 hover:text-gray-600 transition-transform duration-200"
                        >
                          {expandedId === row.id ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[240px] py-2 px-2">
                      <div className="flex flex-col gap-1">
                        {row.type === 'keyword' ? (
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="rounded-full bg-emerald-50/80 px-2 py-0 text-[9px] text-emerald-600 border-emerald-200">
                              Keyword
                            </Badge>
                            <span className="truncate text-xs font-medium text-gray-900 tracking-tight">{row.phrase}</span>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="rounded-full bg-blue-50/50 px-2 py-0 text-[9px] text-blue-600 border-blue-200">
                                Prompt
                              </Badge>
                              <span className="truncate text-xs font-medium text-gray-800">{row.phrase}</span>
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
                    <TableCell className="max-w-[140px] py-2 px-2">
                      <div className="flex flex-wrap items-center gap-1">
                        {row.competitors?.slice(0, 2).map((name: string) => (
                          <Badge key={name} variant="secondary" className="rounded-full bg-gray-100 px-2 py-0 text-[9px] text-gray-600">
                            {name}
                          </Badge>
                        ))}
                        {row.competitorCount > 2 && (
                          <span className="text-[10px] text-gray-400">+{row.competitorCount - 2} more</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-3 px-4 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant={expandedId === row.id ? "default" : "outline"}
                          className={`h-7 rounded-lg px-3 text-[10px] font-bold shadow-none ${expandedId === row.id ? 'bg-[#3B82F6] hover:bg-[#2563EB]' : 'border-slate-300 text-slate-600 hover:bg-gray-50'}`}
                        >
                          {expandedId === row.id ? 'Close' : 'AI Response'}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenWorksheetModal(String(row.id));
                          }}
                          className="h-7 rounded-lg px-3 text-[10px] font-bold border-slate-300 text-slate-600 hover:bg-gray-50 shadow-none"
                        >
                          Draft Blog
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
        <div className="flex items-center gap-3 px-6 py-3 border-t border-slate-200 mt-2">
          <span className="text-[11px] text-gray-500 font-medium tracking-tight">
            Showing {displayData.length} of {data.length} queries
          </span>
          <div className="h-3 w-[1px] bg-gray-300" />
          <button
            type="button"
            onClick={() => {
              setTableFilter('all');
              setTableMetric(null);
              setShowAllQueries(true);
            }}
            disabled={showAllQueries || displayData.length >= data.length}
            className="px-2.5 py-1 text-[11px] font-bold text-[#3B82F6] bg-gray-50/80 hover:bg-gray-100 rounded-lg transition-all"
          >
            View all
          </button>
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

const VisibilityRow = ({
  title,
  meta,
  status,
  actionLabel,
}: {
  title: string;
  meta: string;
  status: 'positive' | 'danger';
  actionLabel?: string;
}) => (
  <div
    className={cn(
      'rounded-lg px-3 py-3',
      status === 'positive'
        ? 'border border-[#B9F8CF] bg-[#E5FFE6]'
        : 'border border-[#D5D7DA] border-t-[0.8px] border-t-[#D5D7DA] bg-white shadow-[0_1px_2px_0_#1018280D]'
    )}
  >
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {status === 'positive' ? (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#0A6D0E]" strokeWidth={2} />
          ) : (
            <Target className="h-3.5 w-3.5 shrink-0 text-[#B42318]" strokeWidth={2} />
          )}
          <p
            className={cn(
              'truncate text-[12px] italic leading-[150%]',
              status === 'positive' ? 'text-[#2D4059]' : 'text-[#B23131]'
            )}
          >
            {title}
          </p>
        </div>
        <p className="mt-1 text-[11px] leading-[150%] text-[#717680]">{meta}</p>
      </div>
      {actionLabel ? (
        <Button
          variant="outline"
          className="h-[37px] shrink-0 rounded-lg border border-[#D5D7DA] bg-[#F9F9F9] px-[10px] text-[12px] font-medium text-[#2D4059] shadow-[0_1px_2px_0_#1018280D] hover:bg-[#F9F9F9]"
        >
          <Sparkles className="mr-1.5 h-3.5 w-3.5 text-[#2D4059]" strokeWidth={1.8} />
          {actionLabel}
        </Button>
      ) : null}
    </div>
  </div>
);

const OpportunityRow = ({
  title,
  severity,
  priority,
}: {
  title: string;
  severity: string;
  priority: string;
}) => (
  <div className="rounded-lg border-l-[3px] border-l-[#7E9BD7] bg-white px-3 py-3 shadow-[0_1px_4px_0_#0000000D]">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="max-w-[240px] text-[12px] italic leading-[150%] text-[#2D4059]">{title}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-[#FDA29B] bg-[#FEF3F2] px-2.5 py-0.5 text-[11px] text-[#B42318]">
            {severity}
          </span>
          <span className="inline-flex items-center gap-1 text-[12px] font-medium text-[#0A6D0E]">
            <TrendingUp className="h-3.5 w-3.5" strokeWidth={2} />
            {priority}
          </span>
        </div>
      </div>
      <Button
        variant="outline"
        className="h-[37px] shrink-0 rounded-lg border border-[#D5D7DA] bg-[#F9F9F9] px-[10px] text-[12px] font-medium text-[#2D4059] shadow-[0_1px_2px_0_#1018280D] hover:bg-[#F9F9F9]"
      >
        <Sparkles className="mr-1.5 h-3.5 w-3.5 text-[#2D4059]" strokeWidth={1.8} />
        Generate Content
      </Button>
    </div>
  </div>
);

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
  yMax = 8000,
}: {
  title: string;
  subtitle: string;
  data: Array<Record<string, string | number>>;
  series: readonly ChartSeries[];
  tooltipTitle?: string;
  yMax?: number;
}) => {
  const chartId = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const ticks = [0, yMax * 0.25, yMax * 0.5, yMax * 0.75, yMax];

  return (
    <div className="w-full min-w-0">
      <div className="px-0.5">
        <div className="flex items-center gap-1.5">
          <h3 className="text-[20px] font-semibold leading-[135%] text-[#414651]">{title}</h3>
          <MetricInfoIcon />
        </div>
        <p className="mt-2 text-sm leading-[150%] text-[#535862]">{subtitle}</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          {series.map((item) => (
            <ChartLegendItem key={item.key} series={item} />
          ))}
          <span className="text-[12px] font-semibold leading-none text-[#2D4059]">+</span>
        </div>
      </div>

      <div className="mt-2 h-[170px] w-full overflow-x-auto">
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
                domain={[0, yMax]}
                ticks={ticks}
                tickLine={false}
                axisLine={false}
                width={34}
                tick={{ fontSize: 11, fill: '#D5D7DA' }}
                tickFormatter={formatChartTick}
              />
              <Tooltip
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


const WORKSHEET_IMPORT_KEY = 'ai-results/pending-worksheet-import';
const WORKSHEET_TARGET_KEY = 'ai-results/pending-worksheet-target';

type WorksheetOption = {
  id: string;
  name: string;
  description: string | null;
};

type WorksheetPickerModalProps = {
  open: boolean;
  selectedCount: number;
  activeWorksheetId: string | null;
  worksheets: WorksheetOption[];
  loading?: boolean;
  onOpenChange: (open: boolean) => void;
  onWorksheetSelect: (id: string) => void;
  onAddToWorksheet: () => void;
  onCreateNewWorksheet: () => void;
};

const WorksheetPickerModal = ({
  open,
  selectedCount,
  activeWorksheetId,
  worksheets,
  loading = false,
  onOpenChange,
  onWorksheetSelect,
  onAddToWorksheet,
  onCreateNewWorksheet,
}: WorksheetPickerModalProps) => {
  const addDisabled = !activeWorksheetId;
  const hasWorksheets = worksheets.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(920px,calc(100vw-1.5rem))] max-w-none overflow-hidden rounded-[28px] border border-[#E5E7EB] bg-white p-0 shadow-[0_20px_80px_rgba(15,23,42,0.22)]">
        <div className="flex max-h-[calc(100vh-2rem)] flex-col">
          <DialogHeader className="shrink-0 border-b border-[#E5E7EB] px-6 py-5 text-left">
            <DialogTitle className="text-[26px] font-semibold leading-[1.15] tracking-[-0.02em] text-[#1F2937]">
              Select worksheet
            </DialogTitle>
            <DialogDescription className="mt-2 text-sm leading-[150%] text-[#6B7280]">
              You are adding {selectedCount} item{selectedCount === 1 ? '' : 's'} to your worksheet.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#2D4059]">
                Select a worksheet
              </p>
            </div>

            {hasWorksheets ? (
              <div className="flex flex-col gap-3">
                {worksheets.map((worksheet) => {
                  const isSelected = activeWorksheetId === worksheet.id;
                  return (
                    <button
                      key={worksheet.id}
                      type="button"
                      onClick={() => onWorksheetSelect(worksheet.id)}
                      className={cn(
                        'flex w-full items-center justify-between rounded-2xl border px-4 py-4 text-left transition-all focus:outline-none focus:ring-2 focus:ring-[#2D4059] focus:ring-offset-2',
                        isSelected
                          ? 'border-[#A8C4F6] bg-[#EEF4FF] shadow-[0_0_0_1px_rgba(94,129,230,0.18)]'
                          : 'border-[#E5E7EB] bg-[#FAFAFA] hover:border-[#CBD5E1] hover:bg-white'
                      )}
                      aria-pressed={isSelected}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold leading-[150%] text-[#1F2937]">
                          {worksheet.name}
                        </p>
                        {worksheet.description ? (
                          <p className="mt-1 text-xs leading-[150%] text-[#6B7280]">
                            {worksheet.description}
                          </p>
                        ) : null}
                      </div>
                      <span
                        className={cn(
                          'ml-4 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] leading-none',
                          isSelected
                            ? 'border-[#2D4059] bg-[#2D4059] text-white'
                            : 'border-[#CBD5E1] bg-white text-transparent'
                        )}
                        aria-hidden="true"
                      >
                        •
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : loading ? (
              <div className="rounded-2xl border border-dashed border-[#CBD5E1] bg-[#FAFAFA] p-6 text-sm text-[#6B7280]">
                Loading worksheets...
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[#CBD5E1] bg-[#FAFAFA] p-6 text-sm text-[#6B7280]">
                No worksheets are available yet.
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-[#E5E7EB] bg-white px-6 py-4">
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={onCreateNewWorksheet}
                className="h-11 w-full rounded-xl border border-[#D5D7DA] bg-white px-5 text-sm font-medium text-[#344054] shadow-none hover:bg-[#F9FAFB] sm:w-[190px]"
              >
                Create New Worksheet
              </Button>
              <Button
                type="button"
                disabled={addDisabled}
                onClick={onAddToWorksheet}
                className={cn(
                  'h-11 w-full rounded-xl px-5 text-sm font-semibold shadow-none sm:w-[190px]',
                  addDisabled
                    ? 'cursor-not-allowed border border-[#9CA0A7] bg-[#9CA0A7] text-white/80 hover:bg-[#9CA0A7]'
                    : 'border border-[#2D4059] bg-[#2D4059] text-white hover:bg-[#24364d]'
                )}
              >
                Add to Worksheet
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};


const AIResultsReportPreview = () => {
  const navigate = useNavigate();
  const { domain: maskedDomainId } = useParams();

  useEffect(() => {
    if (maskedDomainId) {
      localStorage.setItem("ai-visibility:lastDomainSlug", maskedDomainId);
    }
  }, [maskedDomainId]);

  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState<any>(null);
  const [allDomains, setAllDomains] = useState<any[]>([]);
  const [filterType, setFilterType] = useState<'all' | 'prompt' | 'keyword'>('all');

  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [worksheetOptions, setWorksheetOptions] = useState<WorksheetOption[]>([]);
  const [worksheetOptionsLoading, setWorksheetOptionsLoading] = useState(false);
  const [activeWorksheetId, setActiveWorksheetId] = useState<string | null>(null);
  const [isWorksheetModalOpen, setIsWorksheetModalOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    setWorksheetOptionsLoading(true);
    apiGet<{ campaigns: Array<{ id: number; title: string; description?: string | null }> }>(
      '/campaigns'
    )
      .then((data) => {
        if (!alive) return;
        const campaigns = Array.isArray(data?.campaigns) ? data.campaigns : [];
        setWorksheetOptions(
          campaigns.map((c) => ({
            id: String(c.id),
            name: c.title,
            description: c.description?.trim() ? c.description.trim() : null,
          }))
        );
      })
      .catch(() => {
        if (!alive) return;
        setWorksheetOptions([]);
      })
      .finally(() => {
        if (alive) setWorksheetOptionsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const selectedCount = selectedRowIds.size;

  const handleToggleRow = useCallback((id: string) => {
    setSelectedRowIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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

  const handleWorksheetModalOpenChange = useCallback((open: boolean) => {
    setIsWorksheetModalOpen(open);
    if (!open) setActiveWorksheetId(null);
  }, []);

  const handleAddToWorksheet = useCallback(() => {
    if (!activeWorksheetId) return;
    const rowsById = new Map<string, any>(
      (reportData?.topPrompts || []).map((p: any) => [String(p.id), p])
    );
    const selectedItemIds = Array.from(selectedRowIds);
    const selectedRows = selectedItemIds
      .map((id) => rowsById.get(id))
      .filter(Boolean)
      .map((row: any) => ({ id: String(row.id), prompt: row.phrase ?? row.prompt ?? '' }));

    const payload = { activeWorksheetId, selectedItemIds, selectedRows };
    sessionStorage.setItem(WORKSHEET_TARGET_KEY, activeWorksheetId);
    sessionStorage.setItem(WORKSHEET_IMPORT_KEY, JSON.stringify(payload));
    localStorage.setItem('activeTab', 'projects');
    setIsWorksheetModalOpen(false);
    navigate('/dashboard');
  }, [activeWorksheetId, navigate, reportData, selectedRowIds]);

  const handleCreateNewWorksheet = useCallback(() => {
    setIsWorksheetModalOpen(false);
  }, []);

  // Derived metrics for dynamic cards
  const metricCards = useMemo<MetricCardData[]>(() => {
    if (!reportData) return [];

    const keywords = reportData.topPrompts?.filter((p: any) => p.type === 'keyword') || [];
    const prompts = reportData.topPrompts?.filter((p: any) => p.type === 'prompt') || [];
    const trackedKeywords = keywords.filter((k: any) => Array.isArray(k.results) ? k.results.length > 0 : true).length || keywords.length;
    const trackedPrompts = prompts.filter((p: any) => Array.isArray(p.results) ? p.results.length > 0 : true).length || prompts.length;

    const modelStats = reportData.metrics?.modelPerformance || [];
    const gptMentions = modelStats.find((m: any) => m.model?.toLowerCase().includes('gpt'))?.mentions || 0;
    const geminiMentions = modelStats.find((m: any) => m.model?.toLowerCase().includes('gemini'))?.mentions || 0;
    const claudeMentions = modelStats.find((m: any) => m.model?.toLowerCase().includes('claude'))?.mentions || 0;
    const totalMentions = modelStats.reduce((sum: number, m: any) => sum + m.mentions, 0);
    const keywordVisibility = keywords.length > 0 ? `${Math.round(keywords.reduce((acc: number, k: any) => acc + Number.parseFloat(k.sov || '0'), 0) / keywords.length)}%` : '0%';
    const promptVisibility = prompts.length > 0 ? `${Math.round(prompts.reduce((acc: number, p: any) => acc + Number.parseFloat(p.sov || '0'), 0) / prompts.length)}%` : '0%';
    const mentionRate = Math.round(reportData.metrics?.mentionRate || 0);

    return [
      {
        title: 'AI Citations',
        kind: 'citations',
        details: [
          { label: 'AI Overview', value: totalMentions.toString(), iconSrc: '/report-icons/google.svg', subValue: '1' },
          { label: 'ChatGPT', value: gptMentions.toString(), iconSrc: '/report-icons/chat-gpt.svg', subValue: '1' },
          { label: 'Gemini', value: geminiMentions.toString(), iconSrc: '/report-icons/gemini.svg', subValue: '3' },
          { label: 'Claude', value: claudeMentions.toString(), iconSrc: '/report-icons/claude.svg', subValue: '1' },
        ],
      },
      {
        title: 'Top Keywords',
        kind: 'summary',
        details: [
          { label: 'Total', value: keywords.length.toString(), subLabel: 'Visibility', subValue: keywordVisibility },
          { label: 'Tracked', value: trackedKeywords.toString(), subLabel: 'Visibility', subValue: keywordVisibility },
        ],
      },
      {
        title: 'Top Prompts',
        kind: 'summary',
        details: [
          { label: 'Total', value: prompts.length.toString(), subLabel: 'Visibility', subValue: promptVisibility },
          { label: 'Tracked', value: trackedPrompts.toString(), subLabel: 'Visibility', subValue: promptVisibility },
        ],
      },
      {
        title: 'Mentions',
        kind: 'summary',
        details: [
          { label: 'Brand', value: `${mentionRate}%`, subLabel: 'No. of Pages', subValue: String(reportData.metrics?.brandPages ?? 45) },
          { label: 'Competitors', value: `${100 - mentionRate}%`, subLabel: 'No. of Pages', subValue: String(reportData.metrics?.competitorPages ?? 354) },
        ],
      },
    ];
  }, [reportData]);

  const scoreCards = useMemo(() => {
    if (!reportData) return [];

    const sentiment = reportData.metrics?.avgSentiment || 0;
    const sentimentLabel = sentiment > 70 ? 'Positive' : sentiment > 40 ? 'Neutral' : 'Negative';
    const sentimentColor = sentiment > 70 ? 'text-emerald-600' : sentiment > 40 ? 'text-amber-600' : 'text-rose-600';

    return [
      { label: 'Overall Sentiment', value: sentimentLabel, tone: sentimentColor },
      { label: 'Brand Accuracy Score', value: `${Math.round(reportData.metrics?.avgAccuracy || 0)}%`, tone: 'text-[#3393F2]' },
      { label: 'AI Share of Voice', value: `${Math.round(reportData.metrics?.visibilityScore || 0)}%`, tone: 'text-[#3393F2]', note: 'Across all AI Models' },
    ];
  }, [reportData]);

  const filteredPrompts = useMemo(() => {
    if (!reportData?.topPrompts) return [];
    let items = [...reportData.topPrompts];
    // Hide rows that were never queried — empty `results` array means no
    // AI calls ran for this prompt/keyword, so the metrics row is all zeros
    // and adds no signal. Only show items the user actually selected and ran.
    items = items.filter((p: any) => Array.isArray(p?.results) && p.results.length > 0);
    if (filterType !== 'all') {
      items = items.filter(p => p.type?.toLowerCase() === filterType);
    }
    return items;
  }, [reportData, filterType]);

  useEffect(() => {
    const fetchData = async () => {
      if (!maskedDomainId) {
        console.warn('[AIResults] No maskedDomainId found in URL params');
        return;
      }

      console.log('[AIResults] Starting data fetch for:', maskedDomainId);
      setLoading(true);

      try {
        let realId = unmaskDomainId(maskedDomainId);

        // Fallback: If mapping is missing (e.g. fresh page reload on deep link),
        // fetch all domains and find which one matches this mask.
        if (!realId) {
          console.log('[AIResults] realId mapping missing, fetching domains to resolve...');
          const domainsResp = await apiGet<any>('/dashboard/all');
          const domains = domainsResp?.domains || [];
          setAllDomains(domains);

          const found = domains.find((d: any) => maskDomainId(d.id) === maskedDomainId);
          if (found) {
            realId = found.id;
            console.log('[AIResults] Resolved realId from fallback:', realId);
          } else {
            console.error('[AIResults] Could not resolve maskedDomainId even after fetching all domains');
            setLoading(false);
            return;
          }
        }

        console.log('[AIResults] Fetching data for realId:', realId);
        // Parallel fetch for report data and domain list (if not already fetched)
        const [data, domainsResponse] = await Promise.all([
          apiGet<any>(`/dashboard/${realId}`),
          allDomains.length === 0 ? apiGet<any>('/dashboard/all') : Promise.resolve({ domains: allDomains })
        ]);

        if (data) {
          console.log('[AIResults] Report data received:', data.id);
          setReportData(data);
        } else {
          console.warn('[AIResults] No data returned for realId:', realId);
        }

        if (domainsResponse?.domains) {
          setAllDomains(domainsResponse.domains);
        }
      } catch (err) {
        console.error('[AIResults] Failed to fetch dashboard data:', err);
      } finally {
        setLoading(false);
        console.log('[AIResults] Loading finished');
      }
    };

    fetchData();
  }, [maskedDomainId]);

  return (
    <AIResultsLayout
      activeItem="ai-results"
      allDomains={allDomains}
      currentDomainId={reportData?.domainInfo?.id}
      currentDomainUrl={reportData?.domainInfo?.url}
      maskedDomainId={maskedDomainId}
      title="AI Results"
    >
      <section className="flex w-full flex-col bg-white px-4 py-3 sm:px-6">
        <div className="flex w-full flex-col gap-4 rounded-xl bg-[#F1F6FF] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold leading-[1.35] tracking-normal text-[#7BA0E8] sm:text-xl">
              Connect your site
            </h2>
            <p className="mt-1 text-sm font-normal leading-normal text-[#535862] sm:text-base">
              Connect your site integration for unlock access direct blog implementation.
            </p>
          </div>
          <Button className="h-[37px] w-full shrink-0 rounded-lg bg-[#2D4059] px-4 text-sm font-semibold text-white shadow-[0_1px_2px_0_#1018280D] hover:bg-[#24364d] sm:w-auto">
            <IntegrateSiteIcon />
            <span className="ml-2">Integrate Site</span>
          </Button>
        </div>

        <div className="flex w-full flex-col gap-6 px-0 py-6">
          <div className="flex w-full flex-col gap-4 lg:flex-row lg:flex-nowrap lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-semibold text-gray-950 sm:text-2xl">Your AI Visibility Report</h1>
              <p className="mt-2 max-w-3xl text-base font-normal leading-normal tracking-normal text-slate-600">
                See how your domain appears across AI platforms and where you can improve visibility,
                relevance, and performance.
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
              <Button
                variant="outline"
                className="h-[41px] rounded-lg border border-[#D5D7DA] bg-[#FFFFFF] px-3 text-xs text-[#717680] shadow-[0_1px_2px_0_#1018280D]"
              >
                <Calendar className="mr-1.5 h-3.5 w-3.5 text-[#717680]" strokeWidth={1.8} />
                7 days
                <ChevronDown className="ml-1.5 h-3.5 w-3.5 text-[#717680]" strokeWidth={1.8} />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-[41px] rounded-lg border border-[#D5D7DA] bg-[#FFFFFF] px-3 text-xs capitalize text-[#717680] shadow-[0_1px_2px_0_#1018280D]"
                  >
                    <ReportSortIcon />
                    {filterType === 'all' ? 'Sort' : filterType}
                    <ChevronDown className="ml-1.5 h-3.5 w-3.5 text-[#717680]" strokeWidth={1.8} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[150px]">
                  <DropdownMenuItem onClick={() => setFilterType('all')}>All Queries</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFilterType('prompt')}>Prompts Only</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFilterType('keyword')}>Keywords Only</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="outline"
                className="h-[41px] rounded-lg border border-[#D5D7DA] bg-[#FFFFFF] px-3 text-xs text-[#717680] shadow-[0_1px_2px_0_#1018280D]"
              >
                <Filter className="mr-1.5 h-3.5 w-3.5 text-[#717680]" strokeWidth={1.8} />
                Filters
                <ChevronDown className="ml-1.5 h-3.5 w-3.5 text-[#717680]" strokeWidth={1.8} />
              </Button>
              <Button
                onClick={() => navigate('/ai-checker-v2')}
                className="h-[41px] rounded-lg bg-gradient-to-r from-[#2D4059] to-[#4C74C2] px-4 text-xs text-white shadow-[0_1px_2px_0_#1018280D] hover:opacity-95"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Start New Audit
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.96fr)_minmax(0,2.04fr)]">
            {loading || metricCards.length === 0 ? (
              <div className="h-[230px] w-full animate-pulse rounded-xl border border-slate-200 bg-gray-50" />
            ) : (
              <MetricCard card={metricCards[0]} />
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {loading || metricCards.length === 0 ? (
                Array(6).fill(0).map((_, i) => (
                  <div key={i} className="h-[120px] w-full animate-pulse rounded-xl border border-slate-200 bg-gray-50" />
                ))
              ) : (
                [...metricCards.slice(1), ...scoreCards].map((card) =>
                  'details' in card ? (
                    <MetricCard key={card.title} card={card as MetricCardData} />
                  ) : (
                    <Card key={card.label} className="h-full rounded-xl border border-[#D5D7DA] bg-white shadow-[0_1px_2px_0_#1018280D]">
                      <CardContent className="flex h-full flex-col gap-4 p-5 sm:p-6">
                        <div className="flex items-center gap-1.5">
                          <CardTitle className="text-base font-semibold leading-[135%] tracking-normal text-[#535862]">
                            {card.label}
                          </CardTitle>
                          <MetricInfoIcon />
                        </div>
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
          </div>

          <div>
            {loading ? (
              <div className="h-[400px] w-full animate-pulse rounded-xl border border-slate-200 bg-gray-50" />
            ) : (
              <PromptTable
                data={filteredPrompts}
                selectedRowIds={selectedRowIds}
                onToggleRow={handleToggleRow}
                onOpenWorksheetModal={handleOpenWorksheetModal}
              />
            )}
          </div>
        </div>
      </section>

        <section className="grid w-full grid-cols-1 gap-6 bg-white px-4 py-4 sm:px-6 xl:grid-cols-[0.7fr_1.3fr]">
          <div className="space-y-6">
            <Card className="rounded-xl border border-[#D5D7DA] bg-white shadow-[0_1px_2px_0_#1018280D]">
              <CardHeader className="flex flex-row items-start justify-between px-4 pb-3 pt-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <CardTitle className="text-base font-semibold leading-[135%] tracking-normal text-[#535862]">
                      Phrase Visibility Map
                    </CardTitle>
                    <MetricInfoIcon />
                  </div>
                  <p className="mt-2 text-sm leading-[150%] text-[#535862]">
                    Data-backed actions to close visibility gaps and capture missed AI-driven traffic.
                  </p>
                </div>
                <button className="text-xs font-medium text-blue-600">View all</button>
              </CardHeader>
              <CardContent className="space-y-3 px-4 pb-4">
                <div className="flex flex-wrap gap-2">
                  <FilterPill label="Sort" icon="sort" />
                  <FilterPill label="Filters" icon="filter" />
                </div>
                {privateVisibilityItems.map((item, index) => (
                  <VisibilityRow
                    key={`${item.title}-${index}`}
                    title={item.title}
                    meta={item.count}
                    status={item.status as 'positive' | 'danger'}
                    actionLabel={item.status === 'danger' ? 'Generate Content' : undefined}
                  />
                ))}
              </CardContent>
            </Card>

            <Card className="rounded-xl border border-[#D5D7DA] bg-white shadow-[0_1px_2px_0_#1018280D]">
              <CardHeader className="flex flex-row items-start justify-between px-4 pb-3 pt-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <CardTitle className="text-base font-semibold leading-[135%] tracking-normal text-[#535862]">
                      Opportunities to Outrank Competitors
                    </CardTitle>
                    <MetricInfoIcon />
                  </div>
                  <p className="mt-2 text-sm leading-[150%] text-[#535862]">
                    Data-backed actions to close visibility gaps and capture missed AI-driven traffic.
                  </p>
                </div>
                <button className="text-xs font-medium text-blue-600">View all</button>
              </CardHeader>
              <CardContent className="space-y-3 px-4 pb-4">
                <div className="flex flex-wrap gap-2">
                  <FilterPill label="Sort: By Models" icon="sort" />
                  <FilterPill label="Filters (2)" icon="filter" />
                  <FilterPill label="Gemini 2.0" removable />
                  <Button
                    variant="outline"
                    className="h-8 rounded-full border border-[#D5D7DA] bg-white px-3 text-[11px] text-[#717680] shadow-[0_1px_2px_0_#1018280D] hover:bg-white"
                  >
                    +1
                  </Button>
                </div>
                {opportunityItems.map((item, index) => (
                  <OpportunityRow
                    key={`${item.title}-${index}`}
                    title="Create comprehensive backlink analysis guide"
                    severity="Critical"
                    priority="Very High"
                  />
                ))}
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-xl border border-[#D5D7DA] bg-white shadow-[0_1px_2px_0_#1018280D]">
            <CardHeader className="flex flex-col gap-3 px-4 pb-2 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base font-semibold text-[#2D4059]">Visibility & Coverage</CardTitle>
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
                subtitle="Data-backed actions to close visibility gaps and capture missed AI-driven traffic."
                data={shareOfVoiceData}
                series={shareOfVoiceSeries}
                tooltipTitle="AI Share of voice"
              />
              <AreaChartCard
                title="Citations"
                subtitle="How often your brand is cited in AI responses on each LLM Models"
                data={citationsData}
                series={citationsSeries}
                tooltipTitle="Citations"
              />
              <AreaChartCard
                title="Mentions rate trend"
                subtitle="Monthly mentions over 6 months."
                data={mentionsData}
                series={mentionsSeries}
                tooltipTitle="Mentions"
              />
            </CardContent>
          </Card>
        </section>

        <section className="mx-4 mb-6 flex flex-col items-center gap-[0.9375rem] rounded-xl bg-[#F9F9F9] px-6 py-10 text-center sm:mx-6 sm:px-12 lg:px-[7.9375rem] lg:py-[3.8125rem]">
          <h2 className="text-2xl font-semibold text-gray-950">Connect Google services</h2>
          <p className="max-w-3xl text-sm text-gray-500">
            Enrich your analysis with real-time data from Google Analytics and Google Search Console to your SEO Dashboard.
          </p>
          <Button className="h-9 rounded-lg bg-[#2f4462] px-4 text-xs text-white hover:bg-[#263852]">
            <UserRound className="mr-2 h-3.5 w-3.5" />
            Connect Google
          </Button>
        </section>

  <WorksheetPickerModal
    open={isWorksheetModalOpen}
    selectedCount={selectedCount}
    activeWorksheetId={activeWorksheetId}
    worksheets={worksheetOptions}
    loading={worksheetOptionsLoading}
    onOpenChange={handleWorksheetModalOpenChange}
    onWorksheetSelect={setActiveWorksheetId}
    onAddToWorksheet={handleAddToWorksheet}
    onCreateNewWorksheet={handleCreateNewWorksheet}
  />
    </AIResultsLayout>
  );
};

export default AIResultsReportPreview;
