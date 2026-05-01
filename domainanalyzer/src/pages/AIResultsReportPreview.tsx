import { useState, type ReactNode } from 'react';
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
  ArrowLeft,
  BarChart3,
  Bell,
  Bot,
  Calendar,
  ChevronDown,
  CircleHelp,
  Download,
  Filter,
  Globe2,
  LayoutDashboard,
  Link2,
  ListFilter,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Upload,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
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
    profile: 'Positive',
    ranking: '2/5',
    position: '1st',
    sov: '42%',
    competitors: ['Semrush', 'Ahrefs', '+1'],
  },
  {
    prompt: 'Keyword research software',
    type: 'Prompt',
    profile: 'Positive',
    ranking: '2/5',
    position: '1st',
    sov: '42%',
    competitors: ['Semrush', 'Ahrefs', '+1'],
  },
  {
    prompt: 'SEO tools platform',
    type: 'Prompt',
    profile: 'Positive',
    ranking: '2/5',
    position: '1st',
    sov: '42%',
    competitors: ['Semrush', 'Ahrefs', '+1'],
  },
  {
    prompt: 'Best local SEO app and plan',
    type: 'Prompt',
    profile: 'Positive',
    ranking: '2/5',
    position: '1st',
    sov: '42%',
    competitors: ['Semrush', 'Ahrefs', '+1'],
  },
  {
    prompt: 'Digital marketing analytics',
    type: 'Prompt',
    profile: 'Positive',
    ranking: '2/5',
    position: '1st',
    sov: '42%',
    competitors: ['Semrush', 'Ahrefs', '+1'],
  },
];

type PromptRow = (typeof promptRows)[number];

const privateVisibilityItems = [
  { title: 'Best SaaS analytics tools', count: 'Position #2 • 2 competitors', status: 'positive' },
  { title: 'Enterprise analytics comparison', count: 'Position #2 • 2 competitors', status: 'danger' },
  { title: 'Enterprise analytics comparison', count: 'Position #2 • 2 competitors', status: 'danger' },
  { title: 'Best SaaS analytics tools', count: 'Position #2 • 2 competitors', status: 'positive' },
  { title: 'Enterprise analytics comparison', count: 'Position #2 • 2 competitors', status: 'danger' },
];

const opportunityItems = [
  { title: 'Create comparison analytics page', priority: 'Very High', severity: 'Critical' },
  { title: 'Create experimental content analysis', priority: 'High', severity: 'Critical' },
  { title: 'Create experimental content analysis', priority: 'High', severity: 'Critical' },
  { title: 'Create experimental content analysis guide', priority: 'High', severity: 'Critical' },
];

const shareOfVoiceData = [
  { date: '10 April', brand: 620, gemini: 240, chatgpt: 120 },
  { date: '11 April', brand: 960, gemini: 300, chatgpt: 180 },
  { date: '12 April', brand: 1800, gemini: 520, chatgpt: 340 },
  { date: '13 April', brand: 2300, gemini: 780, chatgpt: 460 },
  { date: '14 April', brand: 1850, gemini: 820, chatgpt: 520 },
  { date: '15 April', brand: 1700, gemini: 1120, chatgpt: 700 },
  { date: '16 April', brand: 5200, gemini: 1750, chatgpt: 980 },
  { date: '17 April', brand: 5800, gemini: 2050, chatgpt: 1300 },
  { date: '18 April', brand: 3400, gemini: 1120, chatgpt: 900 },
  { date: '19 April', brand: 900, gemini: 3800, chatgpt: 1700 },
  { date: '20 April', brand: 1200, gemini: 5200, chatgpt: 2400 },
];

const citationsData = [
  { date: 'April 25', brand: 920, gemini: 220, chatgpt: 110 },
  { date: 'May 25', brand: 940, gemini: 260, chatgpt: 140 },
  { date: 'June 25', brand: 2100, gemini: 440, chatgpt: 220 },
  { date: 'July 25', brand: 2600, gemini: 620, chatgpt: 320 },
  { date: 'Aug 25', brand: 1550, gemini: 420, chatgpt: 230 },
  { date: 'Sept 25', brand: 1450, gemini: 380, chatgpt: 180 },
  { date: 'Oct 25', brand: 1750, gemini: 460, chatgpt: 240 },
  { date: 'Nov 25', brand: 2450, gemini: 680, chatgpt: 300 },
  { date: 'Dec 25', brand: 5200, gemini: 1350, chatgpt: 760 },
  { date: 'Jan 26', brand: 6900, gemini: 1750, chatgpt: 980 },
  { date: 'Feb 26', brand: 4400, gemini: 1600, chatgpt: 1180 },
  { date: 'Mar 26', brand: 3200, gemini: 1180, chatgpt: 860 },
  { date: 'April 26', brand: 860, gemini: 1100, chatgpt: 760 },
  { date: 'May 26', brand: 1200, gemini: 3600, chatgpt: 2200 },
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

const formatChartTick = (value: string | number) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return `${value}`;
  if (numericValue === 0) return '0';
  return numericValue >= 1000 ? `${numericValue / 1000}k` : `${numericValue}`;
};

const formatDateTick = (value: string | number) => `${value}`.replace('April', 'Apr').replace('June', 'Jun');

type IconButtonProps = {
  label: string;
  icon: typeof Search;
};

type ToolbarIconButtonProps = {
  label: string;
  src: string;
};

type HeaderIconButtonProps = {
  label: string;
  icon?: typeof Search;
  children?: React.ReactNode;
};

type ReportActionButtonProps = {
  label: string;
  icon: typeof Search;
  className?: string;
};

const BackArrowIcon = () => (
  <ArrowLeft className="h-6 w-6 text-black" strokeWidth={2} />
);

const HelperIcon = () => (
  <CircleHelp className="h-[19px] w-[19px] text-[#8D9199]" strokeWidth={1.5} />
);

const BellIcon = () => (
  <Bell className="h-[19px] w-[17px] text-[#8D9199]" strokeWidth={1.5} />
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

const ReportDownloadIcon = () => (
  <img src="/report-icons/download-button.svg" alt="" className="h-full w-full object-contain" />
);

const ToolbarIconButton = ({ label, src }: ToolbarIconButtonProps) => (
  <button
    type="button"
    aria-label={label}
    className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-visible rounded-lg bg-transparent"
  >
    <img src={src} alt="" className="h-10 w-10 shrink-0" />
  </button>
);

const ReportActionButton = ({ label, icon: Icon, className }: ReportActionButtonProps) => (
  <Button
    variant="outline"
    className={cn(
      "h-10 w-[118px] max-w-full shrink-0 gap-1 rounded-lg border border-[#D5D7DA] bg-white px-3.5 py-2.5 font-normal text-xs font-medium leading-[150%] tracking-normal text-[#717680] shadow-[0_1px_2px_0_#1018280D] hover:bg-white hover:text-[#717680]",
      className
    )}
  >
    <Icon className="h-5 w-5 shrink-0" />
    <span className="shrink-0 px-0.5">{label}</span>
    <ChevronDown className="h-5 w-5 shrink-0" />
  </Button>
);

const ReportActions = () => (
  <div className="flex max-w-full flex-wrap items-center gap-[9px]">
    <ReportActionButton label="7 days" icon={Calendar} />
    <ReportActionButton label="Sort" icon={ListFilter} />
    <ReportActionButton label="Filters" icon={Filter} />
  </div>
);

const ConnectSiteBanner = () => (
  <div className="flex w-full flex-col gap-4 rounded-lg bg-[#F1F6FF] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
    <div className="min-w-0">
      <h2 className="text-xl font-semibold leading-[135%] text-[#7BA0E8]">Connect your site</h2>
      <p className="mt-1 text-base font-normal leading-normal text-[#535862]">
        Connect your site integration for unlock access direct blog implementation.
      </p>
    </div>
    <Button className="h-[37px] w-full shrink-0 rounded-lg bg-[#2D4F7D] px-4 text-sm font-semibold text-white shadow-[0_1px_2px_0_#1018280D] hover:bg-[#27466F] sm:w-[129px]">
      <Link2 className="mr-2 h-4 w-4" />
      Integrate Site
    </Button>
  </div>
);

const InfoOutlineIcon = () => (
  <button
    type="button"
    aria-label="More info"
    title="More info"
    className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-current bg-transparent text-[10px] font-semibold leading-none"
  >
    i
  </button>
);

const MetricCard = ({
  title,
  children,
  className,
  contentClassName,
  titleClassName,
  showInfoIcon = false,
  showTitle = true,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  titleClassName?: string;
  showInfoIcon?: boolean;
  showTitle?: boolean;
}) => (
  <Card
    className={cn(
      'flex min-h-[149px] rounded-[12.91px] border border-[#D5D7DA] bg-white shadow-[0_1px_2px_0_#1018280D]',
      className
    )}
  >
    <CardContent className={cn('flex h-full w-full flex-col gap-4 p-6', contentClassName)}>
      {showTitle ? (
        <MetricTitleRow title={title} titleClassName={titleClassName} showInfoIcon={showInfoIcon} />
      ) : null}
      {children}
    </CardContent>
  </Card>
);

const MetricTitleRow = ({
  title,
  titleClassName,
  showInfoIcon = true,
}: {
  title: string;
  titleClassName?: string;
  showInfoIcon?: boolean;
}) => (
  <div className="flex w-full min-w-0 items-center gap-1.5">
    <CardTitle
      className={cn(
        "min-w-0 truncate text-xs font-semibold leading-normal tracking-normal",
        titleClassName
      )}
    >
      {title}
    </CardTitle>
    {showInfoIcon ? (
      <span className="inline-flex h-4 w-4 shrink-0 translate-y-[1px] items-center justify-center text-[#535862]">
        <InfoOutlineIcon />
      </span>
    ) : null}
  </div>
);

const MetricMiniStat = ({ label, value, className }: { label: string; value: string; className?: string }) => (
  <div className={cn("flex h-[60px] w-fit min-w-[39px] flex-col gap-1", className)}>
    <p className="truncate text-base font-semibold leading-[150%] tracking-normal text-[#535862]">{label}</p>
    <div className="flex h-[27px] w-[27px] items-center justify-center">
      <span className="text-center text-xl font-semibold leading-[135%] tracking-normal text-[#3393F2]">
        {value}
      </span>
    </div>
  </div>
);

const CompactMetadataRow = ({ label, value, className }: { label: string; value: string; className?: string }) => (
  <div className={cn("flex h-[15px] w-16 items-center gap-1", className)}>
    <span className="h-[15px] whitespace-nowrap text-[10px] font-normal leading-[150%] tracking-normal text-[#717680]">
      {label}
    </span>
    <span className="h-[15px] text-[10px] font-normal leading-[150%] tracking-normal text-[#3393F2]">
      {value}
    </span>
  </div>
);

const MetricCardContent = ({ card }: { card: (typeof metricCards)[number] }) => (
  <div className="flex h-full w-full flex-col py-[13.5px]">
    <MetricTitleRow title={card.title} titleClassName="text-xl font-semibold leading-[135%] text-[#535862]" />
    <div className="mt-4 flex h-[79px] w-full max-w-[337px] flex-col gap-1">
      <div className="flex h-[60px] w-full flex-nowrap items-start justify-between">
        <MetricMiniStat label={card.primaryLabel} value={card.primaryValue} />
        <MetricMiniStat label={card.secondaryLabel} value={card.secondaryValue} />
      </div>
      <CompactMetadataRow label="Visibility" value="27%" />
    </div>
  </div>
);

const MentionsCardContent = ({ card }: { card: (typeof metricCards)[number] }) => (
  <div className="flex h-full w-full flex-col py-[13.5px]">
    <MetricTitleRow title={card.title} titleClassName="text-xl font-semibold leading-[135%] text-[#535862]" />
    <div className="mt-4 flex w-full flex-nowrap items-start justify-between">
      {[{ label: card.primaryLabel, value: card.primaryValue }, { label: card.secondaryLabel, value: card.secondaryValue }].map((item) => (
        <div key={item.label} className="flex h-[79px] w-fit flex-col gap-1">
          <p className={cn(
            "h-6 truncate text-base font-semibold leading-[150%] tracking-normal text-[#535862]",
            item.label === 'Competitors' ? 'w-[92px]' : 'w-[46px]'
          )}>
            {item.label}
          </p>
          <div className="flex h-8 w-[52px] items-center gap-2.5">
            <span className="text-center text-xl font-semibold leading-[135%] tracking-normal text-[#3393F2]">
              {item.value}
            </span>
          </div>
          <CompactMetadataRow label="No. of Pages" value="45" className="w-[78px]" />
        </div>
      ))}
    </div>
  </div>
);

const ScoreMetricCardContent = ({ card }: { card: (typeof scoreCards)[number] }) => (
  <div className="flex h-full w-full flex-col">
    <MetricTitleRow title={card.label} titleClassName="text-xl font-semibold leading-[135%] text-[#535862]" />
    {card.note ? <p className="mt-4 text-xs font-medium">{card.note}</p> : null}
    <div className={cn('flex h-[27px] w-full items-center gap-1', card.note ? 'mt-1' : 'mt-4')}>
      <span className={cn('h-[27px] text-center text-xl font-semibold leading-[135%] tracking-normal', card.value === 'Positive' ? 'w-[77px] text-[#0A6D0E]' : 'text-[#3393F2]')}>
        {card.value}
      </span>
    </div>
  </div>
);

const AiCitationStatCard = ({
  label,
  value,
  bottomLabel,
  logoSrc,
}: {
  label: string;
  value: string;
  bottomLabel: string;
  logoSrc: string;
}) => (
  <div className="flex h-[67px] w-[82px] flex-col gap-0.5">
    <div className="flex h-[21px] w-full items-center justify-between">
      <p className="truncate text-sm font-semibold leading-[150%] tracking-normal">{label}</p>
    </div>
    <div className="flex h-[27px] w-full items-center justify-between gap-[32px]">
      <span className="flex h-[27px] w-6 shrink-0 items-center py-[1.5px] pl-0 pr-0">
        <img src={logoSrc} alt="" className="h-6 w-6 object-contain" />
      </span>
      <span className="text-center text-xl font-semibold leading-[135%] tracking-normal text-[#3393F2]">{value}</span>
    </div>
    <div className="flex h-[15px] w-fit items-center gap-1">
      <span className="h-[15px] text-[10px] font-normal leading-[150%] tracking-normal text-[#717680]">
        Pages
      </span>
      <span className="h-[15px] text-[10px] font-normal leading-[150%] tracking-normal text-[#3393F2]">
        {bottomLabel.replace('Pages', '').trim()}
      </span>
    </div>
  </div>
);

const AiCitationsContent = ({ card }: { card: (typeof metricCards)[number] }) => {
  const citationStats = [
    { label: card.primaryLabel, value: card.primaryValue, bottomLabel: 'Pages 1', logoSrc: '/report-icons/google.svg' },
    { label: card.secondaryLabel, value: card.secondaryValue, bottomLabel: 'Pages 1', logoSrc: '/report-icons/chat-gpt.svg' },
    { label: card.footer?.[0]?.label || 'Gemini', value: card.footer?.[0]?.value || '0', bottomLabel: 'Pages 3', logoSrc: '/report-icons/gemini.svg' },
    { label: card.footer?.[1]?.label || 'Claude', value: card.footer?.[1]?.value || '0', bottomLabel: 'Pages 1', logoSrc: '/report-icons/claude.svg' },
  ];

  return (
    <div className="flex w-full flex-col gap-[60px]">
      <div className="flex w-full flex-wrap items-start justify-between gap-x-[88px] gap-y-4">
        {citationStats.slice(0, 2).map((stat) => (
          <AiCitationStatCard key={stat.label} {...stat} />
        ))}
      </div>
      <div className="flex w-full flex-wrap items-start justify-between gap-x-[88px] gap-y-4">
        {citationStats.slice(2, 4).map((stat) => (
          <AiCitationStatCard key={stat.label} {...stat} />
        ))}
      </div>
    </div>
  );
};

const DashboardMetricsGrid = () => {
  const [aiCitationsCard, ...summaryCards] = metricCards;

  return (
    <div className="mx-auto grid w-full max-w-[1530px] grid-cols-1 gap-5 lg:h-[310px] lg:grid-cols-[317px_minmax(0,1fr)]">
      <MetricCard
        title={aiCitationsCard.title}
        className="h-auto w-full border-[1.03px] lg:h-[309px]"
        contentClassName="h-full justify-start gap-4 p-6"
        titleClassName="text-xl font-semibold leading-[135%]"
        showInfoIcon
      >
        <AiCitationsContent card={aiCitationsCard} />
      </MetricCard>

      <div className="grid w-full grid-cols-1 gap-3 md:grid-cols-2 lg:h-[310px] lg:max-w-[1193px] lg:grid-cols-3">
        {summaryCards.map((card) => (
          <MetricCard
            key={card.title}
            title={card.title}
            className="h-full"
            contentClassName="gap-4 px-6 py-0"
            showTitle={false}
          >
            {card.title === 'Mentions' ? <MentionsCardContent card={card} /> : <MetricCardContent card={card} />}
          </MetricCard>
        ))}

        {scoreCards.map((card) => (
          <MetricCard
            key={card.label}
            title={card.label}
            className="h-full"
            contentClassName={card.label === 'AI Share of Voice' ? 'p-[22px]' : 'pb-[55px] pl-6 pr-[41px] pt-6'}
            showTitle={false}
          >
            <ScoreMetricCardContent card={card} />
          </MetricCard>
        ))}
      </div>
    </div>
  );
};

const PromptTableColumns = () => (
  <colgroup>
    <col className="w-[5%] lg:w-[72px]" />
    <col className="w-[31%] lg:w-[390px]" />
    <col className="w-[10%] lg:w-[145px]" />
    <col className="w-[9%] lg:w-[120px]" />
    <col className="w-[10%] lg:w-[125px]" />
    <col className="w-[7%] lg:w-[90px]" />
    <col className="w-[14%] lg:w-[195px]" />
    <col className="w-[14%] lg:w-[290px]" />
  </colgroup>
);

const TableHeaderInfoIcon = () => (
  <button
    type="button"
    aria-label="More info"
    title="More info"
    className="inline-flex h-[9px] w-[9px] shrink-0 translate-y-px items-center justify-center rounded-full border border-[#2D4059] bg-transparent text-[6px] font-semibold leading-none text-[#2D4059]"
  >
    i
  </button>
);

const TableHeaderSortArrow = () => (
  <img src="/report-icons/ascending-arrow.svg" alt="" className="h-2 w-2 shrink-0" />
);

const PromptTableHeaderLabel = ({ label }: { label: string }) => (
  <div className="flex min-h-[18px] min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 align-middle">
    <span className="min-w-0 break-words text-[11px] font-semibold leading-[18px] tracking-normal text-[#2D4059] xl:text-xs">{label}</span>
    <TableHeaderInfoIcon />
    <TableHeaderSortArrow />
  </div>
);

const TooltipInfoIcon = ({ label = 'More info' }: { label?: string }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-[#717680] bg-transparent text-[9px] font-semibold leading-none text-[#717680]"
  >
    i
  </button>
);

const PromptRowActions = () => (
  <div className="flex w-full flex-wrap justify-start gap-2 2xl:flex-nowrap">
    <Button variant="outline" className="h-[37px] w-full max-w-[133px] gap-1 rounded-lg border border-[#D5D7DA] bg-[#F9F9F9] px-2.5 py-2 text-[10px] shadow-[0_1px_2px_0_#1018280D] hover:bg-[#F9F9F9]">
      <img src="/report-icons/ai-response.svg" alt="" className="h-5 w-5 shrink-0" />
      AI Response
    </Button>
    <Button variant="outline" className="h-[37px] w-full max-w-28 gap-1 rounded-lg border-2 border-[#F1F6FF] bg-[#F1F6FF] px-2.5 py-2 text-[10px] shadow-[0_1px_2px_0_#1018280D] hover:bg-[#F1F6FF]">
      <img src="/report-icons/file-05.svg" alt="" className="h-5 w-5 shrink-0" />
      Draft Blog
    </Button>
  </div>
);

const PromptTableEntry = ({ row }: { row: PromptRow }) => {
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  return (
    <TableRow className="h-[72px]">
      <TableCell className="h-[72px] border-b border-[#E5E7EB] p-0 lg:w-[72px]">
        <div className="relative flex h-full w-fit items-center gap-2 pl-2 lg:pl-7">
          <input type="checkbox" className="h-3.5 w-3.5 rounded border-gray-300" />
          <button
            type="button"
            aria-label="Show prompt details"
            aria-expanded={isDetailsOpen}
            onClick={() => setIsDetailsOpen((current) => !current)}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] border-2 border-[#F9F9F9] bg-[#F9F9F9] text-[#2D4059] shadow-[0_1px_2px_0_rgba(16,24,40,0.05)]"
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", isDetailsOpen && "rotate-180")} />
          </button>
          {isDetailsOpen ? (
            <div className="absolute left-8 top-8 z-20 w-36 rounded-lg border border-[#D5D7DA] bg-white px-3 py-2 text-xs text-[#535862] shadow-[0_8px_20px_0_#1018281F]">
              More details here
            </div>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="py-[25.5px] pl-6 pr-[13px]">
        <div className="flex min-w-0 items-center gap-[8px]">
          <Badge variant="outline" className="flex h-[21px] w-[57px] items-center justify-center gap-[5.46px] rounded-[81px] border border-[#D5D7DA] bg-[#F9F9F9] px-2.5 py-0.5 text-[10px] text-[#414651] hover:bg-[#F9F9F9]">
            {row.type}
          </Badge>
          <span className="min-w-0 whitespace-normal break-words text-xs font-medium italic leading-[150%] tracking-normal text-[#535862] lg:whitespace-nowrap">{row.prompt}</span>
        </div>
      </TableCell>
      <TableCell className="py-3 pl-6">
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
      <TableCell className="py-3">
        <div className="flex flex-wrap gap-1">
          {row.competitors.map((competitor) => (
            <Badge key={competitor} variant="outline" className="rounded-full px-2 py-0 text-[10px]">
              {competitor}
            </Badge>
          ))}
        </div>
      </TableCell>
      <TableCell className="py-3 text-left">
        <PromptRowActions />
      </TableCell>
    </TableRow>
  );
};

const PromptResultCard = ({ row }: { row: PromptRow }) => {
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  return (
    <div className="rounded-lg border border-[#E5E7EB] bg-white p-3 shadow-[0_1px_2px_0_#1018280D]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <input type="checkbox" className="mt-1 h-3.5 w-3.5 shrink-0 rounded border-gray-300" />
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Badge variant="outline" className="flex h-[21px] w-[57px] items-center justify-center rounded-[81px] border border-[#D5D7DA] bg-[#F9F9F9] px-2.5 py-0.5 text-[10px] text-[#414651] hover:bg-[#F9F9F9]">
                {row.type}
              </Badge>
              <span className="min-w-0 break-words text-xs font-medium italic leading-[150%] text-[#535862]">
                {row.prompt}
              </span>
            </div>
            {isDetailsOpen ? (
              <div className="mt-2 rounded-lg border border-[#D5D7DA] bg-[#F9F9F9] px-3 py-2 text-xs text-[#535862]">
                More details here
              </div>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          aria-label="Show prompt details"
          aria-expanded={isDetailsOpen}
          onClick={() => setIsDetailsOpen((current) => !current)}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] border-2 border-[#F9F9F9] bg-[#F9F9F9] text-[#2D4059] shadow-[0_1px_2px_0_rgba(16,24,40,0.05)]"
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", isDetailsOpen && "rotate-180")} />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-[#535862] sm:grid-cols-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-normal text-[#2D4059]">Sentiment</p>
          <Badge className="mt-1 rounded-full bg-emerald-50 px-2 py-0 text-[10px] text-emerald-700 hover:bg-emerald-50">
            {row.profile}
          </Badge>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-normal text-[#2D4059]">Ranking</p>
          <p className="mt-1">{row.ranking}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-normal text-[#2D4059]">Positions</p>
          <Badge className="mt-1 rounded-full bg-emerald-50 px-2 py-0 text-[10px] text-emerald-700 hover:bg-emerald-50">
            {row.position}
          </Badge>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-normal text-[#2D4059]">SOV</p>
          <p className="mt-1">{row.sov}</p>
        </div>
        <div className="col-span-2 sm:col-span-2">
          <p className="text-[10px] font-semibold uppercase tracking-normal text-[#2D4059]">Competitors</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {row.competitors.map((competitor) => (
              <Badge key={competitor} variant="outline" className="rounded-full px-2 py-0 text-[10px]">
                {competitor}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3">
        <PromptRowActions />
      </div>
    </div>
  );
};

const PromptTable = () => (
  <Card className="mx-auto flex w-full max-w-[1530px] flex-col gap-[22px] rounded-xl border-0 shadow-none">
    <CardHeader className="flex h-auto w-full flex-col px-0 py-0">
      <div className="flex h-auto w-full min-w-0 flex-col justify-start">
        <CardTitle className="w-fit text-xl font-semibold leading-[135%] tracking-normal text-[#222831]">
          Top searched Prompts
        </CardTitle>
        <p className="mt-2 text-base font-normal leading-[150%] tracking-normal text-[#535862]">
          Compare how AI models respond, cite sources, and surface competitors across queries
        </p>
      </div>
      {/* Action Bar */}
      <div className="mt-5 flex h-auto w-full min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-3 lg:h-[41px] 2xl:flex-nowrap">
        <div className="flex h-auto w-full min-w-0 flex-wrap items-center gap-3 lg:h-[41px] lg:w-[567px] lg:flex-nowrap">
          <div className="flex h-10 w-full min-w-0 items-center gap-2 rounded-lg border border-[#D5D7DA] bg-white px-4 py-3 lg:w-[400px]">
            <Search className="h-4 w-4 text-gray-400" />
            <input
              type="search"
              placeholder="Enter your custom phrase/keyword to analyze"
              className="w-full bg-transparent text-xs outline-none placeholder:text-gray-400"
            />
          </div>
          <Button className="h-[41px] w-full rounded-lg border-2 border-[#2D4059] bg-[#2D4059] px-3.5 py-2.5 text-xs text-white shadow-[0_1px_2px_0_#1018280D] hover:bg-[#2D4059] lg:w-[155px]">
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add & Analyze
          </Button>
        </div>
        <div className="flex h-auto w-full min-w-0 flex-wrap items-center justify-start gap-2 lg:h-[41px] 2xl:w-auto 2xl:justify-end 2xl:flex-nowrap">
          <ToolbarIconButton label="Language" src="/report-icons/language-button.svg" />
          <ToolbarIconButton label="Reload" src="/report-icons/reload-button.svg" />
          <ToolbarIconButton label="Download" src="/report-icons/download-button.svg" />
          <ReportActionButton label="Sort" icon={ListFilter} className="w-[110px]" />
          <ReportActionButton label="Filters" icon={Filter} className="w-[118px]" />
          <Button variant="outline" className="h-[41px] w-[178px] gap-1 rounded-lg border-2 border-[#9CA0A7] bg-[#9CA0A7] px-3.5 py-2.5 text-xs text-white shadow-[0_1px_2px_0_#1018280D] hover:bg-[#9CA0A7] hover:text-white">
            <img src="/report-icons/worksheet.svg" alt="" className="h-5 w-5 shrink-0" />
            Add to Worksheet
          </Button>
        </div>
      </div>
    </CardHeader>

    <CardContent className="flex h-auto w-full min-w-0 flex-col gap-1 px-0 pb-3 lg:h-[488px]">
      <div className="w-full max-w-full overflow-x-hidden">
        <div className="w-full min-w-0">
          <div className="px-3">
            <Table className="table-fixed">
              <PromptTableColumns />
              <TableHeader>
                <TableRow className="bg-gray-50 hover:bg-gray-50">
                  <TableHead className="px-0 pl-2 lg:pl-7">
                    <input type="checkbox" className="h-3.5 w-3.5 rounded border-gray-300" />
                  </TableHead>
                  <TableHead className="pl-6 pr-[13px]"><PromptTableHeaderLabel label="Prompts & Keywords" /></TableHead>
                  <TableHead className="pl-6"><PromptTableHeaderLabel label="Sentiment" /></TableHead>
                  <TableHead><PromptTableHeaderLabel label="Ranking" /></TableHead>
                  <TableHead><PromptTableHeaderLabel label="Positions" /></TableHead>
                  <TableHead><PromptTableHeaderLabel label="SOV" /></TableHead>
                  <TableHead><PromptTableHeaderLabel label="Competitors" /></TableHead>
                  <TableHead className="text-left"><PromptTableHeaderLabel label="Action" /></TableHead>
                </TableRow>
              </TableHeader>
            </Table>
          </div>
          <div className="px-3">
            <Table className="table-fixed">
              <PromptTableColumns />
              <TableBody>
                {promptRows.map((row) => (
                  <PromptTableEntry key={row.prompt} row={row} />
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
      <div className="flex h-auto w-full max-w-[1506px] flex-wrap items-center gap-4 rounded-b-lg border-b border-[#E9EAEB] bg-white py-3 pl-[23px] pr-4 lg:h-[60px]">
        <div className="flex h-8 w-[169px] items-center gap-2.5 border-r border-[#D5D7DA] p-2">
          <span className="text-sm font-medium leading-4 tracking-normal text-[#535862]">Showing 5 of 7 queries</span>
        </div>
        <button type="button" className="flex h-[37px] w-[77px] items-center justify-center gap-3 rounded-lg bg-[#F9F9F9] px-3 py-2">
          <span className="h-[21px] w-[53px] text-center text-sm font-semibold leading-[150%] tracking-normal text-[#3393F2]">View all</span>
        </button>
      </div>
    </CardContent>
  </Card>
);

const OpportunityCard = ({
  title,
  meta,
  status,
  actionLabel,
  variant = 'phrase',
}: {
  title: string;
  meta: string;
  status: 'positive' | 'danger';
  actionLabel?: string;
  variant?: 'phrase' | 'opportunity';
}) => {
  if (variant === 'opportunity') {
    return (
      <div className="rounded-lg border border-[#E9EAEB] border-l-2 border-l-[#7BA7FF] bg-white px-5 py-3 shadow-[0_1px_2px_0_#1018280D]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="max-w-[240px] text-[12px] font-medium italic leading-[150%] tracking-normal text-[#2D4059]">
              {title}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge className="rounded-full border border-[#FDA29B] bg-[#FEF3F2] px-2.5 py-0.5 text-[11px] font-normal leading-[150%] text-[#B42318] hover:bg-[#FEF3F2]">
                Critical
              </Badge>
              <span className="inline-flex items-center gap-1 text-[12px] font-medium leading-[150%] text-[#0A6D0E]">
                <TrendingUp className="h-3.5 w-3.5" />
                Very High
              </span>
            </div>
          </div>
          {actionLabel ? (
            <Button variant="outline" className="flex h-[37px] w-full items-center justify-center gap-1 rounded-lg border border-[var(--Grey-Stroke,#D5D7DA)] bg-[var(--Base-Grey,#F9F9F9)] px-[10px] py-2 text-[12px] font-medium text-slate-700 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] transition-all hover:bg-gray-50 active:scale-95 sm:w-[169px]">
              <img src="/report-icons/generate-content.svg" alt="" className="h-5 w-5 shrink-0" />
              {actionLabel}
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
  <div
    className={`rounded-lg border p-3 ${
      status === 'positive'
        ? 'border-t-[0.8px] border-t-[var(--Succes-stroke,#B9F8CF)] bg-[var(--Success-base,#E5FFE6)] '
        : 'border-t-[0.8px] border-t-[var(--Grey-Stroke, #D5D7DA)]'
    }`}
  >
    <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-4">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center">
          {status === 'positive' ? (
            <img src="/report-icons/icon-positive.svg" alt="" className="h-4 w-4 shrink-0" />
          ) : (
            <img src="/report-icons/icon-negative.svg" alt="" className="h-4 w-4 shrink-0" />
          )}
        </div>
        <div className="min-w-0">
          <p className={cn(
            "font-normal italic text-[14px] leading-[150%] tracking-normal",
            status === 'positive' ? 'text-[var(--Text,#414651)]' : 'text-[#B23131]'
          )}>
            {title}
          </p>
          <p className="font-normal text-[14px] leading-[150%] tracking-normal text-[var(--Text,#717680)]">{meta}</p>
        </div>
      </div>
      {actionLabel ? (
        <Button variant="outline" className="flex h-[37px] w-full items-center justify-center gap-1 rounded-lg border border-[var(--Grey-Stroke,#D5D7DA)] bg-[var(--Base-Grey,#F9F9F9)] px-[10px] py-2 text-[12px] font-medium text-slate-700 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] transition-all hover:bg-gray-50 active:scale-95 sm:w-[169px]">
          <img src="/report-icons/generate-content.svg" alt="" className="h-5 w-5 shrink-0" />
          {actionLabel}
        </Button>
      ) : null}
    </div>
  </div>
  );
};

const VisibilityListCard = ({
  title,
  subtitle,
  sortLabel = 'Sort by',
  filterLabel = 'Filters',
  chips,
  children,
}: {
  title: string;
  subtitle: string;
  sortLabel?: string;
  filterLabel?: string;
  chips?: ReactNode;
  children: ReactNode;
}) => (
  <Card className="overflow-hidden rounded-xl border-gray-200 bg-[var(--Base-Grey,_#F9F9F9)] shadow-sm">
    <CardHeader className="flex flex-col items-start justify-between gap-3 px-2 pb-3 pt-3 sm:flex-row sm:gap-5">
      <div className="min-w-0 max-w-[330px]">
        <div className="flex items-center gap-1.5">
          <CardTitle className="text-base font-semibold leading-[135%] tracking-normal text-[#414651]">
            {title}
          </CardTitle>
          <TooltipInfoIcon label={`${title} info`} />
        </div>
        <p className="mt-2 max-w-[330px] text-sm font-normal leading-[150%] tracking-normal text-[#535862]">
          {subtitle}
        </p>
      </div>
      <button className="flex h-[33px] w-[73px] shrink-0 items-center justify-center gap-1 rounded-md border border-[#F1F6FF] bg-[#F1F6FF] px-2 py-1.5 text-sm font-semibold leading-[150%] tracking-normal text-[#3393F2]">
        View all
      </button>
    </CardHeader>
    <CardContent className="space-y-3 px-4 pb-4">
      <div className="flex flex-wrap gap-2">
        <ReportActionButton label={sortLabel} icon={ListFilter} className="h-8 w-auto min-w-[118px] px-2 text-[12px]" />
        <ReportActionButton label={filterLabel} icon={Filter} className="h-8 w-auto min-w-[118px] px-2 text-[12px]" />
        {chips}
      </div>
      {children}
    </CardContent>
  </Card>
);

const AreaChartCard = ({
  title,
  subtitle,
  data,
  series,
  tooltipTitle = title,
  stacked = true,
  yMax = 8000,
}: {
  title: string;
  subtitle: string;
  data: Array<Record<string, string | number>>;
  series: Array<{
    key: string;
    label: string;
    stroke: string;
    fill: string;
  }>;
  tooltipTitle?: string;
  stacked?: boolean;
  yMax?: number;
}) => (
  <div className="w-full min-w-0">
    <div className="mb-4 px-0.5">
      <div className="flex items-center gap-1.5">
        <h3 className="text-[19px] font-semibold leading-[135%] text-[#414651] sm:text-xl">{title}</h3>
        <TooltipInfoIcon label={`${title} info`} />
      </div>
      <p className="mt-2 text-sm font-normal leading-[150%] text-[#535862]">{subtitle}</p>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        {series.map((item) => (
          <span key={item.key} className="inline-flex items-center gap-1.5 text-[11px] leading-none text-[#2D4059]">
            <span className="inline-flex h-3 w-3 items-center justify-center rounded-[2px] border" style={{ borderColor: item.stroke, backgroundColor: '#fff' }}>
              <span className="h-1.5 w-1.5 rounded-[1px]" style={{ backgroundColor: item.stroke }} />
            </span>
            {item.label}
          </span>
        ))}
        <span className="text-[12px] font-semibold leading-none text-[#2D4059]">+</span>
      </div>
    </div>
    <div className="overflow-x-auto pb-1">
      <div className="h-[158px] min-w-[560px] sm:min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 2, left: 4, bottom: 0 }}>
          <defs>
            {series.map((item) => (
              <linearGradient key={item.key} id={`${title.replace(/\W/g, '-')}-${item.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={item.stroke} stopOpacity={0.42} />
                <stop offset="95%" stopColor={item.stroke} stopOpacity={0.22} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke="#D5D7DA" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={18}
            tick={{ fontSize: 12, fill: '#717680' }}
            tickFormatter={formatDateTick}
          />
          <YAxis
            orientation="right"
            domain={[0, yMax]}
            ticks={[0, yMax * 0.25, yMax * 0.5, yMax * 0.75, yMax]}
            tickLine={false}
            axisLine={false}
            width={34}
            tick={{ fontSize: 12, fill: '#D5D7DA' }}
            tickFormatter={formatChartTick}
          />
          <Tooltip
            labelFormatter={() => tooltipTitle}
            formatter={(value, name) => [formatChartTick(value as number), series.find((item) => item.key === name)?.label || name]}
            contentStyle={{
              borderRadius: 8,
              border: '1px solid #e5e7eb',
              boxShadow: '0 12px 30px rgba(15, 23, 42, 0.12)',
              fontSize: 11,
            }}
            cursor={{ stroke: '#A8C4F6', strokeWidth: 1 }}
          />
          {series.map((item) => (
            <Area
              key={item.key}
              type="monotone"
              dataKey={item.key}
              stackId={stacked ? 'coverage' : undefined}
              stroke={item.stroke}
              fill={`url(#${title.replace(/\W/g, '-')}-${item.key})`}
              strokeWidth={0}
              activeDot={{ r: 5, fill: item.stroke, stroke: '#fff', strokeWidth: 2 }}
            />
          ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
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

      <main className="ml-0 flex min-h-screen min-w-0 flex-1 flex-col gap-2.5 overflow-x-hidden bg-white">
        <header className="w-full bg-white px-6 py-2">
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

        <section className="flex w-full flex-col gap-5 bg-white px-6 py-0">
          <ConnectSiteBanner />

          <div className="flex w-full flex-col gap-6 lg:flex-row lg:flex-nowrap lg:items-center lg:justify-between">
            <div className="flex min-h-[59px] w-full min-w-0 flex-col gap-2 lg:max-w-[882px] lg:flex-1">
              <h1 className="text-xl font-semibold text-gray-950">Your AI Visibility Report</h1>
              <p className=" font-normal text-base leading-normal tracking-normal text-slate-600">
                See how your domain appears across AI platforms and where you can improve visibility,
                relevance, and performance.
              </p>
            </div>

            <div className="ml-auto flex h-auto w-full flex-wrap items-center justify-start gap-[9px] opacity-100 lg:h-[41px] lg:w-auto lg:min-w-[594px] lg:flex-nowrap lg:justify-end lg:shrink-0">
              <Button
                variant="outline"
                size="icon"
                aria-label="Download"
                className="h-11 w-11 shrink-0 rounded-lg border-2 border-[#F9F9F9] bg-[#F9F9F9] p-0 shadow-[0_1px_2px_0_#1018280D] hover:bg-[#F9F9F9] flex items-center justify-center"
              >
                <ReportDownloadIcon />
              </Button>
              <ReportActions />
              <Button className="h-[41px] w-[164px] rounded-lg bg-gradient-to-r from-[#2D4059] to-[#4C74C2] text-xs font-medium text-white shadow-sm hover:opacity-90 transition-opacity">
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Start New Audit
              </Button>
            </div>
          </div>

          <DashboardMetricsGrid />

          <div className="mt-0">
            <PromptTable />
          </div>
        </section>

        <section className="grid w-full grid-cols-1 gap-4 bg-white px-4 py-0 sm:px-6 xl:grid-cols-[0.72fr_1.28fr]">
          <div className="space-y-4">
            <VisibilityListCard
              title="Phrase Visibility Map"
              subtitle="Data-backed actions to close visibility gaps and capture missed AI-driven traffic."
              sortLabel="Sort"
              filterLabel="Filters"
            >
                {privateVisibilityItems.map((item, index) => (
                  <OpportunityCard
                    key={`${item.title}-${index}`}
                    title={item.title}
                    meta={item.count}
                    status={item.status as 'positive' | 'danger'}
                    actionLabel={item.status === 'danger' ? 'Generate Content' : undefined}
                  />
                ))}
            </VisibilityListCard>

            <VisibilityListCard
              title="Opportunities to Outrank Competitors"
              subtitle="Data-backed actions to close visibility gaps and capture missed AI-driven traffic."
              sortLabel="Sort: By Models"
              filterLabel="Filters (2)"
              chips={
                <>
                  <span className="inline-flex h-8 items-center gap-1 rounded-full border border-[#D5D7DA] bg-white px-3 text-[11px] font-normal text-[#535862]">
                    Gemini 2.0
                    <X className="h-3 w-3" />
                  </span>
                  <span className="inline-flex h-8 items-center rounded-full border border-[#D5D7DA] bg-white px-3 text-[11px] font-normal text-[#535862]">
                    +1
                  </span>
                </>
              }
            >
                {opportunityItems.map((item, index) => (
                  <OpportunityCard
                    key={`${item.title}-${index}`}
                    title="Create comprehensive backlink analysis guide"
                    meta={`${item.severity} - ${item.priority}`}
                    status="danger"
                    actionLabel="Generate Content"
                    variant="opportunity"
                  />
                ))}
            </VisibilityListCard>
          </div>

          <Card className="flex min-w-0 flex-col rounded-xl border-gray-200 bg-white shadow-sm">
            <CardHeader className="flex flex-col gap-4 px-4 pb-5 pt-5 sm:flex-row sm:items-center sm:justify-between lg:px-6">
              <CardTitle className="text-xl font-semibold leading-[135%] text-[#2D4059]">Visibility & Coverage</CardTitle>
              <div className="flex flex-wrap gap-2 sm:flex-nowrap">
                <ReportActionButton label="7 days" icon={Calendar} className="h-[38px] w-auto min-w-[90px] px-2 text-[11px]" />
                <ReportActionButton label="Sort" icon={ListFilter} className="h-[38px] w-auto min-w-[90px] px-2 text-[11px]" />
              </div>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col justify-between gap-8 px-4 pb-5 lg:px-6">
              <AreaChartCard
                title="Share of Voice"
                subtitle="Data-backed actions to close visibility gaps and capture missed AI-driven traffic."
                data={shareOfVoiceData}
                tooltipTitle="AI Share of voice"
                series={[
                  { key: 'brand', label: 'Semrush', stroke: '#E9897E', fill: '#FDE8E5' },
                  { key: 'gemini', label: 'Ahref', stroke: '#8DD9E8', fill: '#DDF7FB' },
                  { key: 'chatgpt', label: 'Athena HQ', stroke: '#79A7F2', fill: '#DDEBFF' },
                ]}
              />
              <AreaChartCard
                title="Citations"
                subtitle="How often your brand is cited in AI responses on each LLM Models"
                data={citationsData}
                tooltipTitle="Citations"
                series={[
                  { key: 'brand', label: 'ChatGPT', stroke: '#E9897E', fill: '#FDE8E5' },
                  { key: 'gemini', label: 'Gemini', stroke: '#8DD9E8', fill: '#DDF7FB' },
                  { key: 'chatgpt', label: 'Claude', stroke: '#79A7F2', fill: '#DDEBFF' },
                ]}
              />
              <AreaChartCard
                title="Mentions rate trend"
                subtitle="Monthly mentions over 6 months."
                data={mentionsData}
                tooltipTitle="Mentions"
                stacked={false}
                series={[
                  { key: 'brand', label: 'Brand mentions', stroke: '#6EA8FF', fill: '#DDEBFF' },
                  { key: 'competitors', label: 'Competitors Mentions', stroke: '#7BD8EB', fill: '#DDF7FB' },
                ]}
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
            <img src="/report-icons/google-logo.png" alt="" className="mr-2 h-4 w-4 shrink-0" />
            Connect Google
          </Button>
        </section>
      </main>
    </div>
  );
};

export default AIResultsReportPreview;
