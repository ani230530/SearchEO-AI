import { useState, useEffect, useMemo, Fragment } from 'react';
import ReactMarkdown from 'react-markdown';
import { useNavigate, useParams } from 'react-router-dom';
import { apiGet } from '../services/apiClient';
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
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { maskDomainId, unmaskDomainId } from '../lib/domainUtils';

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
  { date: '10 Apr', brand: 8, gemini: 4, chatgpt: 2 },
  { date: '12 Apr', brand: 12, gemini: 5, chatgpt: 3 },
  { date: '14 Apr', brand: 9, gemini: 7, chatgpt: 4 },
  { date: '16 Apr', brand: 18, gemini: 9, chatgpt: 7 },
  { date: '18 Apr', brand: 25, gemini: 14, chatgpt: 12 },
  { date: '20 Apr', brand: 21, gemini: 32, chatgpt: 18 },
  { date: '22 Apr', brand: 16, gemini: 48, chatgpt: 29 },
];

const citationsData = [
  { date: 'Apr 25', brand: 320, gemini: 140, chatgpt: 90 },
  { date: 'Jun 25', brand: 680, gemini: 220, chatgpt: 140 },
  { date: 'Aug 25', brand: 420, gemini: 180, chatgpt: 130 },
  { date: 'Oct 25', brand: 540, gemini: 260, chatgpt: 160 },
  { date: 'Dec 25', brand: 2100, gemini: 900, chatgpt: 440 },
  { date: 'Feb 26', brand: 1700, gemini: 840, chatgpt: 520 },
  { date: 'May 26', brand: 850, gemini: 1600, chatgpt: 1100 },
];

const mentionsData = [
  { date: 'Apr 25', brand: 80, competitors: 24 },
  { date: 'Jun 25', brand: 120, competitors: 30 },
  { date: 'Aug 25', brand: 70, competitors: 22 },
  { date: 'Oct 25', brand: 110, competitors: 40 },
  { date: 'Dec 25', brand: 460, competitors: 180 },
  { date: 'Feb 26', brand: 390, competitors: 150 },
  { date: 'May 26', brand: 760, competitors: 320 },
];

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

interface MetricCardData {
  title: string;
  primaryLabel: string;
  primaryValue: string;
  secondaryLabel: string;
  secondaryValue: string;
  footer?: { label: string; value: string; }[];
}

const MetricCard = ({ card }: { card: MetricCardData }) => (
  <Card className="rounded-xl border-slate-300 shadow-sm">
    <CardHeader className="px-4 pb-2 pt-4">
      <CardTitle className="text-xs font-semibold text-gray-800">{card.title}</CardTitle>
    </CardHeader>
    <CardContent className="px-4 pb-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[11px] text-gray-500">{card.primaryLabel}</p>
          <p className="mt-1 text-lg font-semibold text-blue-600">{card.primaryValue}</p>
        </div>
        <div>
          <p className="text-[11px] text-gray-500">{card.secondaryLabel}</p>
          <p className="mt-1 text-lg font-semibold text-blue-600">{card.secondaryValue}</p>
        </div>
      </div>
      {card.footer ? (
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-200 pt-3">
          {card.footer.map((item) => (
            <div key={item.label}>
              <p className="text-[10px] text-gray-500">{item.label}</p>
              <p className="text-xs font-semibold text-blue-600">{item.value}</p>
            </div>
          ))}
        </div>
      ) : null}
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

const PromptTable = ({ data }: { data: any[] }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tableFilter, setTableFilter] = useState<'all' | 'prompt' | 'keyword'>('all');
  const [tableMetric, setTableMetric] = useState<string | null>(null);

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
    if (!tableMetric && tableFilter === 'all') {
      const prompts = items.filter(item => item.type?.toLowerCase() === 'prompt').slice(0, 3);
      const keywords = items.filter(item => item.type?.toLowerCase() === 'keyword').slice(0, 2);
      return [...prompts, ...keywords];
    }

    return items.slice(0, 5);
  }, [data, tableFilter, tableMetric]);

  return (
    <Card className="rounded-xl border-slate-300 shadow-sm overflow-hidden">
      <CardHeader className="space-y-6 px-6 pt-6 pb-4">
        <div className="flex flex-col gap-1">
          <CardTitle className="text-xl font-bold text-[#1e293b]">Top searched Prompts</CardTitle>
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

            <Button className="h-9 gap-2 bg-[#94a3b8] hover:bg-[#64748b] text-white border-none rounded-lg px-4 transition-all ml-1">
              <LayoutGrid className="h-4 w-4" />
              <span className="text-sm font-medium">Add to Worksheet</span>
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
                        <input type="checkbox" className="h-3.5 w-3.5 rounded border-gray-300 accent-blue-600" />
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
                        <Button variant="outline" className="h-7 rounded-lg px-3 text-[10px] font-bold border-slate-300 text-slate-600 hover:bg-gray-50 shadow-none">
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
            className="px-2.5 py-1 text-[11px] font-bold text-[#3B82F6] bg-gray-50/80 hover:bg-gray-100 rounded-lg transition-all"
          >
            View all
          </button>
        </div>
      </CardContent>
    </Card>
  );
};

const OpportunityCard = ({
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
    className={`rounded-lg border p-3 ${status === 'positive'
      ? 'border-emerald-100 bg-emerald-50'
      : 'border-rose-100 bg-rose-50'
      }`}
  >
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {status === 'positive' ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          ) : (
            <Target className="h-3.5 w-3.5 text-rose-600" />
          )}
          <p className="truncate text-xs font-semibold text-gray-900">{title}</p>
        </div>
        <p className="mt-1 text-[11px] text-gray-500">{meta}</p>
      </div>
      {actionLabel ? (
        <Button variant="outline" className="h-7 shrink-0 rounded-lg bg-white px-2 text-[10px]">
          {actionLabel}
        </Button>
      ) : null}
    </div>
  </div>
);

const AreaChartCard = ({
  title,
  subtitle,
  data,
  secondKey = 'gemini',
  thirdKey = 'chatgpt',
}: {
  title: string;
  subtitle: string;
  data: Array<Record<string, string | number>>;
  secondKey?: string;
  thirdKey?: string;
}) => (
  <div className="rounded-xl border border-slate-300 bg-white p-4">
    <div className="mb-3 flex items-start justify-between gap-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <p className="mt-1 text-xs text-gray-500">{subtitle}</p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" className="h-8 rounded-lg px-2 text-[11px]">
          <ChevronDown className="mr-1 h-3 w-3" />
          Tags
        </Button>
        <Button variant="outline" className="h-8 rounded-lg px-2 text-[11px]">
          <ChevronDown className="mr-1 h-3 w-3" />
          Sort
        </Button>
      </div>
    </div>
    <div className="h-52">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
          <defs>
            <linearGradient id={`${title}-brand`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#efb0a8" stopOpacity={0.8} />
              <stop offset="95%" stopColor="#efb0a8" stopOpacity={0.12} />
            </linearGradient>
            <linearGradient id={`${title}-second`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#7dd3fc" stopOpacity={0.8} />
              <stop offset="95%" stopColor="#7dd3fc" stopOpacity={0.12} />
            </linearGradient>
            <linearGradient id={`${title}-third`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#93c5fd" stopOpacity={0.7} />
              <stop offset="95%" stopColor="#93c5fd" stopOpacity={0.1} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#eef2f7" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} />
          <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} />
          <Tooltip
            contentStyle={{
              borderRadius: 12,
              border: '1px solid #e5e7eb',
              boxShadow: '0 12px 30px rgba(15, 23, 42, 0.12)',
              fontSize: 12,
            }}
          />
          <Area type="monotone" dataKey="brand" stroke="#e9897e" fill={`url(#${title}-brand)`} strokeWidth={2} />
          <Area type="monotone" dataKey={secondKey} stroke="#38bdf8" fill={`url(#${title}-second)`} strokeWidth={2} />
          <Area type="monotone" dataKey={thirdKey} stroke="#60a5fa" fill={`url(#${title}-third)`} strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  </div>
);


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

  // Derived metrics for dynamic cards
  const metricCards = useMemo(() => {
    if (!reportData) return [];

    const keywords = reportData.topPrompts?.filter((p: any) => p.type === 'keyword') || [];
    const prompts = reportData.topPrompts?.filter((p: any) => p.type === 'prompt') || [];

    const modelStats = reportData.metrics?.modelPerformance || [];
    const gptMentions = modelStats.find((m: any) => m.model?.toLowerCase().includes('gpt'))?.mentions || 0;
    const geminiMentions = modelStats.find((m: any) => m.model?.toLowerCase().includes('gemini'))?.mentions || 0;
    const claudeMentions = modelStats.find((m: any) => m.model?.toLowerCase().includes('claude'))?.mentions || 0;
    const totalMentions = modelStats.reduce((sum: number, m: any) => sum + m.mentions, 0);

    return [
      {
        title: 'Brand Mentions',
        primaryLabel: 'Total Mentions',
        primaryValue: totalMentions.toString(),
        secondaryLabel: 'ChatGPT',
        secondaryValue: gptMentions.toString(),
        footer: [
          { label: 'Gemini', value: geminiMentions.toString() },
          { label: 'Claude', value: claudeMentions.toString() },
          { label: 'Perplexity', value: '0' },
        ],
      },
      {
        title: 'Top Keywords',
        primaryLabel: 'Total',
        primaryValue: keywords.length.toString(),
        secondaryLabel: 'Visibility',
        secondaryValue: keywords.length > 0 ? `${Math.round(keywords.reduce((acc: number, k: any) => acc + parseInt(k.sov), 0) / keywords.length)}%` : '0%'
      },
      {
        title: 'Top Prompts',
        primaryLabel: 'Total',
        primaryValue: prompts.length.toString(),
        secondaryLabel: 'Visibility',
        secondaryValue: prompts.length > 0 ? `${Math.round(prompts.reduce((acc: number, p: any) => acc + parseInt(p.sov), 0) / prompts.length)}%` : '0%'
      },
      {
        title: 'Mentions',
        primaryLabel: 'Brand',
        primaryValue: `${Math.round(reportData.metrics?.mentionRate || 0)}%`,
        secondaryLabel: 'Gap',
        secondaryValue: `${100 - Math.round(reportData.metrics?.mentionRate || 0)}%`
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
      { label: 'Brand Accuracy Score', value: `${Math.round(reportData.metrics?.avgAccuracy || 0)}%`, tone: 'text-blue-600' },
      { label: 'AI Share of Voice', value: `${Math.round(reportData.metrics?.visibilityScore || 0)}%`, tone: 'text-blue-600', note: 'Across all AI Models' },
    ];
  }, [reportData]);

  const filteredPrompts = useMemo(() => {
    if (!reportData?.topPrompts) return [];
    let items = [...reportData.topPrompts];
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
    <div className="flex min-h-screen w-full flex-col bg-[#f5f5f7] text-slate-900 lg:flex-row">
      <aside className="min-h-[220px] w-full shrink-0 basis-auto border-b border-slate-300 bg-white p-4 lg:min-h-screen lg:basis-[18%] lg:min-w-[260px] lg:max-w-[342px] lg:border-b-0 lg:border-r">
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">logo</span>
            <IconButton label="Settings" icon={Settings} />
          </div>

          <div className="mt-6">
            <p className="mb-2 text-xs font-semibold text-gray-700">Domain</p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-xs shadow-sm transition hover:bg-gray-50">
                  <span className="flex items-center gap-2">
                    <span className="grid h-6 w-6 place-items-center rounded-md bg-rose-50 text-rose-600">
                      <Globe2 className="h-3.5 w-3.5" />
                    </span>
                    <span className="truncate max-w-[140px]">
                      {reportData?.domainInfo?.url || 'Loading...'}
                    </span>
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[260px] p-1" align="start">
                {allDomains.length > 0 ? (
                  allDomains.map((domain) => (
                    <DropdownMenuItem
                      key={domain.id}
                      onClick={() => navigate(`/ai-results/${maskDomainId(domain.id)}`)}
                      className={`flex flex-col items-start gap-0.5 px-3 py-2 cursor-pointer ${domain.id === reportData?.domainInfo?.id ? 'bg-gray-50' : ''
                        }`}
                    >
                      <div className="flex w-full items-center justify-between">
                        <span className="text-xs font-semibold text-gray-900 truncate">
                          {domain.url}
                        </span>
                        {domain.id === reportData?.domainInfo?.id && (
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                        )}
                      </div>
                      <span className="text-[10px] text-gray-500">
                        Last analyzed: {new Date(domain.createdAt).toLocaleDateString()}
                      </span>
                    </DropdownMenuItem>
                  ))
                ) : (
                  <div className="p-3 text-center text-xs text-gray-500">
                    No other domains found
                  </div>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <nav className="mt-5 space-y-1">
            {sidebarItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.id === 'ai-results';
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (item.id === 'ai-results') {
                      // Already on this page
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    } else if (item.id === 'competitors') {
                      navigate(`/dashboard?tab=analytics&subtab=competitors&domain=${maskedDomainId}`);
                    } else if (item.id === 'analytics') {
                      navigate(`/dashboard?tab=analytics&domain=${maskedDomainId}`);
                    } else {
                      // For Top Prompts/Keywords, we can just scroll to the table
                      const tableElement = document.getElementById('report-table-section');
                      if (tableElement) {
                        tableElement.scrollIntoView({ behavior: 'smooth' });
                      }
                    }
                  }}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs font-medium transition ${isActive
                    ? 'bg-[#2f4462] text-white'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="mt-auto hidden space-y-3 pt-8 lg:block">
            {[LayoutDashboard, Bot, ShieldCheck, Settings].map((Icon, index) => (
              <button
                key={index}
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
        </div>
      </aside>

      <main className="ml-0 flex min-h-screen flex-1 min-w-0 flex-col gap-2.5 bg-white">
        <header className="w-full bg-white px-6 py-6">
          <div className="flex min-h-[3.75rem] w-full items-center justify-between gap-2.5 py-2.5 pr-2.5">
            <button
              onClick={() => navigate('/ai-visibility')}
              className="inline-flex items-center gap-2.5 text-left text-2xl font-semibold leading-[1.35] tracking-normal text-gray-950"
            >
              <BackArrowIcon />
              AI Results
            </button>

            <div className="flex h-8 items-center">
              <div className="flex items-center gap-2">
                <HeaderIconButton label="Help">
                  <HelperIcon />
                </HeaderIconButton>
                <HeaderIconButton label="Notifications">
                  <BellIcon />
                </HeaderIconButton>
              </div>
              <div className="ml-6">
                <HeaderProfileButton />
              </div>
            </div>
          </div>
        </header>

        <section className="flex w-full flex-col gap-5 bg-white px-6 py-3">
          <div className="flex w-full flex-col gap-6 lg:flex-row lg:flex-nowrap lg:items-center lg:justify-between">
            <div className="flex min-h-[59px] w-full min-w-0 flex-col gap-2 lg:max-w-[882px] lg:flex-1">
              <h1 className="text-xl font-semibold text-gray-950">Your AI Visibility Report</h1>
              <p className=" font-normal text-base leading-normal tracking-normal text-slate-600">
                See how your domain appears across AI platforms and where you can improve visibility,
                relevance, and performance.
              </p>
            </div>

            <div className="ml-auto flex h-auto w-full max-w-[591px] flex-wrap items-center justify-start gap-[9px] opacity-100 lg:h-[41px] lg:w-[591px] lg:flex-nowrap lg:justify-end lg:shrink-0">
              <Button variant="outline" size="icon" aria-label="Download" className="h-[41px] w-[41px] shrink-0 rounded-lg">
                <Download className="h-4 w-4" />
              </Button>
              <Button variant="outline" className="h-[41px] rounded-lg px-3 text-xs">
                <Calendar className="mr-1.5 h-3.5 w-3.5" />
                7 days
                <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="h-[41px] rounded-lg px-3 text-xs capitalize">
                    <LineChart className="mr-1.5 h-3.5 w-3.5" />
                    {filterType === 'all' ? 'Sort' : filterType}
                    <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[150px]">
                  <DropdownMenuItem onClick={() => setFilterType('all')}>All Queries</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFilterType('prompt')}>Prompts Only</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFilterType('keyword')}>Keywords Only</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="outline" className="h-[41px] rounded-lg px-3 text-xs">
                <Filter className="mr-1.5 h-3.5 w-3.5" />
                Filters
                <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
              </Button>
              <Button className="h-[41px] rounded-lg bg-[#2f4462] px-4 text-xs text-white hover:bg-[#263852]">
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Start New Audit
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {loading ? (
              Array(4).fill(0).map((_, i) => (
                <div key={i} className="h-[120px] w-full animate-pulse rounded-xl bg-gray-50 border border-slate-200" />
              ))
            ) : (
              metricCards.map((card) => (
                <MetricCard key={card.title} card={card} />
              ))
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {loading ? (
              Array(3).fill(0).map((_, i) => (
                <div key={i} className="h-[100px] w-full animate-pulse rounded-xl bg-gray-50 border border-slate-200" />
              ))
            ) : (
              scoreCards.map((card) => (
                <Card key={card.label} className="rounded-xl border-slate-300 shadow-sm">
                  <CardContent className="p-4">
                    <p className="text-xs font-semibold text-gray-800">{card.label}</p>
                    {card.note ? <p className="mt-3 text-[11px] text-gray-500">{card.note}</p> : null}
                    <p className={`mt-2 text-2xl font-semibold ${card.tone}`}>{card.value}</p>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          <div>
            {loading ? (
              <div className="h-[400px] w-full animate-pulse rounded-xl bg-gray-50 border border-slate-200" />
            ) : (
              <PromptTable data={filteredPrompts} />
            )}
          </div>
        </section>

        <section className="grid w-full grid-cols-1 gap-6 bg-white px-4 py-4 sm:px-6 xl:grid-cols-[0.72fr_1.28fr]">
          <div className="space-y-6">
            <Card className="rounded-xl border-slate-300 shadow-sm">
              <CardHeader className="flex flex-row items-start justify-between px-4 pb-3 pt-4">
                <div>
                  <CardTitle className="text-sm font-semibold">Private Visibility Map</CardTitle>
                  <p className="mt-1 text-xs text-gray-500">
                    Data-backed actions to close visibility gaps and capture missed AI-driven traffic.
                  </p>
                </div>
                <button className="text-xs font-medium text-blue-600">View all</button>
              </CardHeader>
              <CardContent className="space-y-3 px-4 pb-4">
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" className="h-8 rounded-lg px-3 text-[11px]">
                    Sort by
                    <ChevronDown className="ml-1 h-3 w-3" />
                  </Button>
                  <Button variant="outline" className="h-8 rounded-lg px-3 text-[11px]">
                    Filters
                    <ChevronDown className="ml-1 h-3 w-3" />
                  </Button>
                </div>
                {privateVisibilityItems.map((item, index) => (
                  <OpportunityCard
                    key={`${item.title}-${index}`}
                    title={item.title}
                    meta={item.count}
                    status={item.status as 'positive' | 'danger'}
                    actionLabel={item.status === 'danger' ? 'Generate Content' : undefined}
                  />
                ))}
              </CardContent>
            </Card>

            <Card className="rounded-xl border-slate-300 shadow-sm">
              <CardHeader className="flex flex-row items-start justify-between px-4 pb-3 pt-4">
                <div>
                  <CardTitle className="text-sm font-semibold">Opportunities to Outrank Competitors</CardTitle>
                  <p className="mt-1 text-xs text-gray-500">
                    Data-backed actions to close visibility gaps and capture missed AI-driven traffic.
                  </p>
                </div>
                <button className="text-xs font-medium text-blue-600">View all</button>
              </CardHeader>
              <CardContent className="space-y-3 px-4 pb-4">
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" className="h-8 rounded-lg px-3 text-[11px]">
                    Sort by Mode
                    <ChevronDown className="ml-1 h-3 w-3" />
                  </Button>
                  <Button variant="outline" className="h-8 rounded-lg px-3 text-[11px]">
                    From 12
                    <ChevronDown className="ml-1 h-3 w-3" />
                  </Button>
                </div>
                {opportunityItems.map((item, index) => (
                  <OpportunityCard
                    key={`${item.title}-${index}`}
                    title={item.title}
                    meta={`${item.severity} - ${item.priority}`}
                    status="danger"
                    actionLabel="Generate Content"
                  />
                ))}
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-xl border-slate-300 shadow-sm">
            <CardHeader className="px-4 pb-2 pt-4">
              <CardTitle className="text-sm font-semibold">Visibility & Coverage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 px-4 pb-4">
              <AreaChartCard
                title="Share of Voice"
                subtitle="Data-backed actions to close visibility gaps and capture missed AI-driven traffic."
                data={shareOfVoiceData}
              />
              <AreaChartCard
                title="Citations"
                subtitle="How often your brand is cited in AI responses on each LLM Models"
                data={citationsData}
              />
              <AreaChartCard
                title="Mentions rate trend"
                subtitle="Monthly mentions over 6 months."
                data={mentionsData}
                secondKey="competitors"
                thirdKey="competitors"
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
      </main>
    </div>
  );
};

export default AIResultsReportPreview;
