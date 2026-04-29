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
  Download,
  Filter,
  Globe2,
  LayoutDashboard,
  LineChart,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Upload,
  UserRound,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const sidebarItems = [
  { label: 'AI Results', icon: Sparkles, active: true },
  { label: 'Competitors', icon: Users },
  { label: 'Top Prompts', icon: Target },
  { label: 'Top Keywords', icon: Star },
  { label: 'Analytics', icon: BarChart3 },
];

const metricCards = [
  {
    title: 'AI Citations',
    primaryLabel: 'AI Overview',
    primaryValue: '56',
    secondaryLabel: 'ChatGPT',
    secondaryValue: '56',
    footer: [
      { label: 'Gemini', value: '3' },
      { label: 'Claude', value: '4' },
      { label: 'Perplexity', value: '1' },
    ],
  },
  { title: 'Top Keywords', primaryLabel: 'Total', primaryValue: '89', secondaryLabel: 'Tracked', secondaryValue: '45' },
  { title: 'Top Prompts', primaryLabel: 'Total', primaryValue: '89', secondaryLabel: 'Tracked', secondaryValue: '45' },
  { title: 'Mentions', primaryLabel: 'Brand', primaryValue: '36%', secondaryLabel: 'Competitors', secondaryValue: '64%' },
];

const scoreCards = [
  { label: 'Overall Sentiment', value: 'Positive', tone: 'text-emerald-600' },
  { label: 'Brand Accuracy Score', value: '78%', tone: 'text-blue-600' },
  { label: 'AI Share of Voice', value: '34%', tone: 'text-blue-600', note: 'Across all AI Models' },
];

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
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
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
    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-900"
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

const MetricCard = ({ card }: { card: (typeof metricCards)[number] }) => (
  <Card className="rounded-xl border-gray-200 shadow-sm">
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
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-gray-100 pt-3">
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

const PromptTable = () => (
  <Card className="rounded-xl border-gray-200 shadow-sm">
    <CardHeader className="space-y-4 px-4 pb-3 pt-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <CardTitle className="text-sm font-semibold text-gray-900">Top searched Prompts</CardTitle>
          <p className="mt-1 text-xs text-gray-500">
            Compare how AI models respond, cite sources, and surface competitors across queries
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-9 min-w-[260px] items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3">
            <Search className="h-4 w-4 text-gray-400" />
            <input
              type="search"
              placeholder="Enter your custom phrase/keyword to analyze"
              className="w-full bg-transparent text-xs outline-none placeholder:text-gray-400"
            />
          </div>
          <Button className="h-9 rounded-lg bg-slate-950 px-3 text-xs text-white hover:bg-slate-800">
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add & Analyze
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <IconButton label="Refresh" icon={RefreshCw} />
          <IconButton label="Download" icon={Download} />
          <IconButton label="Upload" icon={Upload} />
          <Button variant="outline" className="h-8 rounded-lg px-3 text-xs">
            <ChevronDown className="mr-1.5 h-3.5 w-3.5" />
            Sort
          </Button>
          <Button variant="outline" className="h-8 rounded-lg px-3 text-xs">
            <Filter className="mr-1.5 h-3.5 w-3.5" />
            Filters
          </Button>
        </div>
        <Button variant="outline" className="h-8 rounded-lg px-3 text-xs text-gray-500">
          Add to Workspace
        </Button>
      </div>
    </CardHeader>

    <CardContent className="px-0 pb-3">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50 hover:bg-gray-50">
            <TableHead className="w-10 px-4">
              <input type="checkbox" className="h-3.5 w-3.5 rounded border-gray-300" />
            </TableHead>
            <TableHead className="text-[11px]">Prompts & Keywords</TableHead>
            <TableHead className="text-[11px]">Score</TableHead>
            <TableHead className="text-[11px]">Ranking</TableHead>
            <TableHead className="text-[11px]">Position</TableHead>
            <TableHead className="text-[11px]">SOV</TableHead>
            <TableHead className="text-[11px]">Competitors</TableHead>
            <TableHead className="text-right text-[11px]">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {promptRows.map((row) => (
            <TableRow key={row.prompt}>
              <TableCell className="px-4 py-3">
                <input type="checkbox" className="h-3.5 w-3.5 rounded border-gray-300" />
              </TableCell>
              <TableCell className="min-w-[320px] py-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="rounded-full px-2 py-0 text-[10px]">
                    {row.type}
                  </Badge>
                  <span className="truncate text-xs font-medium text-gray-800">{row.prompt}</span>
                </div>
              </TableCell>
              <TableCell className="py-3">
                <Badge className="rounded-full bg-emerald-50 px-2 py-0 text-[10px] text-emerald-700 hover:bg-emerald-50">
                  {row.profile}
                </Badge>
              </TableCell>
              <TableCell className="py-3 text-xs text-gray-600">{row.ranking}</TableCell>
              <TableCell className="py-3">
                <Badge className="rounded-full bg-emerald-50 px-2 py-0 text-[10px] text-emerald-700 hover:bg-emerald-50">
                  {row.position}
                </Badge>
              </TableCell>
              <TableCell className="py-3 text-xs text-gray-600">{row.sov}</TableCell>
              <TableCell className="min-w-[190px] py-3">
                <div className="flex flex-wrap gap-1">
                  {row.competitors.map((competitor) => (
                    <Badge key={competitor} variant="outline" className="rounded-full px-2 py-0 text-[10px]">
                      {competitor}
                    </Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell className="py-3 text-right">
                <div className="flex justify-end gap-2">
                  <Button variant="outline" className="h-7 rounded-lg px-2 text-[10px]">
                    AI Response
                  </Button>
                  <Button variant="outline" className="h-7 rounded-lg px-2 text-[10px]">
                    Draft Blog
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex items-center justify-between px-4 pt-3 text-xs text-gray-500">
        <span>Showing 1 to 5 of 9 queries</span>
        <button type="button" className="font-medium text-blue-600">View all</button>
      </div>
    </CardContent>
  </Card>
);

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
    className={`rounded-lg border p-3 ${
      status === 'positive'
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
  <div className="rounded-xl border border-gray-200 bg-white p-4">
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
  return (
    <div className="flex min-h-screen w-full flex-col bg-[#f5f5f7] text-slate-900 lg:flex-row">
      <aside className="min-h-[220px] w-full shrink-0 basis-auto border-b border-gray-200 bg-white p-4 lg:min-h-screen lg:basis-[18%] lg:min-w-[260px] lg:max-w-[342px] lg:border-b-0 lg:border-r">
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">logo</span>
            <IconButton label="Settings" icon={Settings} />
          </div>

          <div className="mt-6">
            <p className="mb-2 text-xs font-semibold text-gray-700">Domain</p>
            <button className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-xs shadow-sm">
              <span className="flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-md bg-rose-50 text-rose-600">
                  <Globe2 className="h-3.5 w-3.5" />
                </span>
                Girl Power Talk
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
            </button>
          </div>

          <nav className="mt-5 space-y-1">
            {sidebarItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  type="button"
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs font-medium transition ${
                    item.active
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

      <main className="ml-0 flex min-h-screen flex-1 flex-col gap-2.5 bg-white">
        <header className="w-full bg-white px-6 py-6">
          <div className="flex min-h-[3.75rem] w-full items-center justify-between gap-2.5 py-2.5 pr-2.5">
            <button className="inline-flex items-center gap-2.5 text-left text-2xl font-semibold leading-[1.35] tracking-normal text-gray-950">
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
              <Button variant="outline" className="h-[41px] rounded-lg px-3 text-xs">
                <LineChart className="mr-1.5 h-3.5 w-3.5" />
                Sort
                <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
              </Button>
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
            {metricCards.map((card) => (
              <MetricCard key={card.title} card={card} />
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {scoreCards.map((card) => (
              <Card key={card.label} className="rounded-xl border-gray-200 shadow-sm">
                <CardContent className="p-4">
                  <p className="text-xs font-semibold text-gray-800">{card.label}</p>
                  {card.note ? <p className="mt-3 text-[11px] text-gray-500">{card.note}</p> : null}
                  <p className={`mt-2 text-2xl font-semibold ${card.tone}`}>{card.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div>
            <PromptTable />
          </div>
        </section>

        <section className="grid w-full grid-cols-1 gap-6 bg-white px-4 py-4 sm:px-6 xl:grid-cols-[0.72fr_1.28fr]">
          <div className="space-y-6">
            <Card className="rounded-xl border-gray-200 shadow-sm">
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

            <Card className="rounded-xl border-gray-200 shadow-sm">
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

          <Card className="rounded-xl border-gray-200 shadow-sm">
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
