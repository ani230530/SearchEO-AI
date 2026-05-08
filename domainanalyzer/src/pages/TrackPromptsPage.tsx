import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceDot, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { ChevronDown, Info } from "lucide-react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AIResultsLayout } from "@/features/ai-results/components/AIResultsLayout";
import { apiGet } from "@/services/apiClient";
import { PromptTable } from "@/features/ai-results/components/PromptTrackingTable";
import { maskDomainId, unmaskDomainId } from "@/lib/domainUtils";

type DashboardDomain = {
  createdAt: string;
  id: number;
  url: string;
};

type DashboardAllResponse = {
  domains?: DashboardDomain[];
};

type DashboardDetailResponse = {
  domainInfo?: DashboardDomain;
};

const promptVisibilityTrendData = [
  { month: "January 2026", position: 2100, x: 0 },
  { month: "January 2026", position: 2400, x: 1 },
  { month: "January 2026", position: 2350, x: 2 },
  { month: "January 2026", position: 2650, x: 3 },
  { month: "January 2026", position: 3600, x: 4 },
  { month: "January 2026", position: 5100, x: 5 },
  { month: "January 2026", position: 4400, x: 6 },
  { month: "January 2026", position: 4900, x: 7 },
  { month: "January 2026", position: 4700, x: 8 },
  { month: "January 2026", position: 6100, x: 9 },
  { month: "February 2026", position: 3800, x: 10 },
  { month: "February 2026", position: 5900, x: 11 },
  { month: "February 2026", position: 7600, x: 12 },
  { month: "February 2026", position: 8600, x: 13 },
  { month: "February 2026", position: 9300, x: 14 },
  { month: "March 2026", position: 10100, x: 15 },
  { month: "March 2026", position: 11100, x: 16 },
  { month: "March 2026", position: 11800, x: 17 },
  { month: "March 2026", position: 13700, x: 18 },
  { month: "March 2026", position: 14500, x: 19 },
  { month: "March 2026", position: 13900, x: 20 },
  { month: "March 2026", position: 14400, x: 21 },
  { month: "March 2026", position: 12200, x: 22 },
  { month: "March 2026", position: 9000, x: 23 },
  { month: "March 2026", position: 7900, x: 24 },
  { month: "March 2026", position: 7200, x: 25 },
  { month: "April 2026", position: 6800, x: 26 },
  { month: "April 2026", position: 6200, x: 27 },
  { month: "April 2026", position: 4700, x: 28 },
  { month: "April 2026", position: 4300, x: 29 },
  { month: "April 2026", position: 4100, x: 30 },
  { month: "April 2026", position: 3900, x: 31 },
  { month: "April 2026", position: 4300, x: 32 },
  { month: "April 2026", position: 5600, x: 33 },
];

const buildMockResults = (phrase: string) => [
  {
    accuracy: 8.4,
    citations: [{ title: "SearchEO prompt coverage", url: "https://searcheo.ai/coverage" }],
    id: `${phrase}-gpt`,
    model: "GPT 4.5",
    overall: 8.1,
    phrase,
    presence: 1,
    response: `SearchEO.ai appears in AI-generated comparisons for "${phrase}" with strong competitive coverage and decent source diversity.`,
    sentiment: 8.2,
    sources: ["https://searcheo.ai/coverage", "https://docs.searcheo.ai/prompts"],
  },
  {
    accuracy: 7.6,
    citations: [{ title: "Prompt visibility note", url: "https://searcheo.ai/prompts" }],
    id: `${phrase}-claude`,
    model: "Claude 3",
    overall: 7.4,
    phrase,
    presence: 1,
    response: `Claude highlights SearchEO.ai for "${phrase}" when the query is product-comparison or workflow-focused.`,
    sentiment: 7.1,
    sources: ["https://searcheo.ai/prompts"],
  },
  {
    accuracy: 0,
    citations: [],
    id: `${phrase}-gemini`,
    model: "Gemini 1.5",
    overall: 0,
    phrase,
    presence: 0,
    response: "No response available.",
    sentiment: 0,
    sources: [],
  },
];

const trackPromptRows = [
  {
    avgSentiment: 8.1,
    bestRank: 2,
    competitorCount: 4,
    competitors: ["Semrush", "Ahrefs", "Moz", "G2"],
    id: "track-prompt-1",
    mentions: 2,
    phrase: "Best AI prompt tracking tools for SEO teams",
    results: buildMockResults("Best AI prompt tracking tools for SEO teams"),
    sov: "42%",
    type: "prompt",
  },
  {
    avgSentiment: 7.4,
    bestRank: 4,
    competitorCount: 3,
    competitors: ["Semrush", "Writesonic", "Surfer"],
    id: "track-prompt-2",
    mentions: 2,
    phrase: "How to monitor prompt visibility across ChatGPT and Gemini",
    results: buildMockResults("How to monitor prompt visibility across ChatGPT and Gemini"),
    sov: "37%",
    type: "prompt",
  },
  {
    avgSentiment: 6.8,
    bestRank: 5,
    competitorCount: 3,
    competitors: ["Ahrefs", "Semrush", "Frase"],
    id: "track-keyword-1",
    mentions: 1,
    phrase: "prompt monitoring software",
    results: buildMockResults("prompt monitoring software"),
    sov: "29%",
    type: "keyword",
  },
  {
    avgSentiment: 8.7,
    bestRank: 1,
    competitorCount: 5,
    competitors: ["Semrush", "Ahrefs", "Mangools", "Moz", "G2"],
    id: "track-prompt-3",
    mentions: 2,
    phrase: "Track branded prompts for AI search visibility",
    results: buildMockResults("Track branded prompts for AI search visibility"),
    sov: "48%",
    type: "prompt",
  },
  {
    avgSentiment: 7.2,
    bestRank: 3,
    competitorCount: 2,
    competitors: ["Semrush", "Ahrefs"],
    id: "track-keyword-2",
    mentions: 2,
    phrase: "AI prompt analytics",
    results: buildMockResults("AI prompt analytics"),
    sov: "35%",
    type: "keyword",
  },
];

const legendItems = [
  { color: "#f6c9c2", label: "1-3" },
  { color: "#a7e4f3", label: "4-10" },
  { color: "#a6c5ff", label: "11-20" },
  { color: "#d7e2ee", label: "21-50" },
];

const xAxisTicks = [0, 11, 22, 33];
const highlightedPoint = promptVisibilityTrendData[17];
const monthTickMap: Record<number, string> = {
  0: "January 2026",
  11: "February 2026",
  22: "March 2026",
  33: "April 2026",
};

const StaticTrendCallout = () => (
  <div className="absolute left-[33%] top-[30px] z-10 min-w-[190px] rounded-xl border border-[#edf0f5] bg-white px-4 py-3 shadow-[0_14px_34px_rgba(15,23,42,0.12)]">
    <div className="mb-3 flex items-center justify-between gap-3">
      <span className="text-[12px] font-semibold text-[#3a4454]">Quarter 1</span>
      <div className="flex min-w-[72px] items-center gap-2">
        <div className="h-[3px] w-full rounded-full bg-[#3e8a5c]" />
        <span className="text-[8px] text-[#9da7b4]">Syncing</span>
      </div>
    </div>
    <div className="mb-2 flex items-end justify-between">
      <span className="text-[12px] font-medium text-[#4d5664]">Overall position</span>
      <span className="text-[16px] font-medium text-[#667085]">4.5</span>
    </div>
    <p className="text-[11px] font-medium text-[#4d5664]">Ranking across LLMs</p>
    <div className="mt-3 flex items-center gap-3 text-[9px] text-[#4d5664]">
      <span className="flex items-center gap-1"><span className="h-[6px] w-[6px] rounded-full bg-[#3b82f6]" />Chat GPT</span>
      <span className="flex items-center gap-1"><span className="h-[6px] w-[6px] rounded-full bg-[#ff8c61]" />Gemini</span>
      <span className="flex items-center gap-1"><span className="h-[6px] w-[6px] rounded-full bg-[#efb0a8]" />Claude</span>
    </div>
    <div className="mt-1 flex items-center gap-3 text-[8px] text-[#a4acb8]">
      <span>Synced 24/100</span>
      <span>Synced 27/100</span>
      <span>Synced 42/100</span>
    </div>
  </div>
);

const PromptVisibilityTrendsChart = () => (
  <section className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[18px] font-semibold leading-none text-[#394150]">Prompt Visibility Trends</h2>
            <Info className="h-4 w-4 text-slate-400" />
          </div>
          <p className="mt-2 text-[13px] text-[#6b7280]">Your share of voice vs competitors</p>
        </div>
        <Button variant="outline" className="h-10 rounded-[10px] border-[#d9e0eb] px-4 text-[12px] text-[#667085] shadow-none">
          1st Quarter
          <ChevronDown className="ml-2 h-4 w-4" />
        </Button>
      </div>

      <div className="flex flex-wrap gap-4 text-[11px] text-[#6b7280]">
        {legendItems.map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <span className="inline-block h-[10px] w-[10px] rounded-[2px] border border-[#d8dee8]" style={{ backgroundColor: item.color }} />
            <span>{item.label}</span>
          </div>
        ))}
      </div>

      <div className="relative h-[260px] w-full">
        <StaticTrendCallout />
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={promptVisibilityTrendData} margin={{ top: 16, right: 18, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="track-prompts-visibility" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ecb6ae" stopOpacity={0.6} />
                <stop offset="100%" stopColor="#ecb6ae" stopOpacity={0.22} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#ddd6cf" strokeDasharray="2 4" />
            <XAxis
              dataKey="x"
              type="number"
              domain={[0, 33]}
              ticks={xAxisTicks}
              tickFormatter={(value) => monthTickMap[value] || ""}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "#8b97a7", fontSize: 12 }}
            />
            <YAxis
              orientation="right"
              tickLine={false}
              axisLine={false}
              domain={[0, 20000]}
              ticks={[0, 5000, 10000, 15000, 20000]}
              tickFormatter={(value) => (value === 0 ? "0" : `${value / 1000}k`)}
              tick={{ fill: "#bcc3cf", fontSize: 12 }}
            />
            <ReferenceLine x={highlightedPoint.x} stroke="#c8b4ad" strokeWidth={1} />
            <ReferenceDot
              x={highlightedPoint.x}
              y={highlightedPoint.position}
              r={5}
              fill="#f0a081"
              stroke="#ffffff"
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="position"
              stroke="#efb0a8"
              strokeWidth={1}
              fill="url(#track-prompts-visibility)"
              dot={false}
              activeDot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
  </section>
);

const TrackPromptsPage = () => {
  const { domain: maskedDomainId } = useParams();
  const [allDomains, setAllDomains] = useState<DashboardDomain[]>([]);
  const [domainInfo, setDomainInfo] = useState<DashboardDomain | null>(null);

  useEffect(() => {
    if (maskedDomainId) {
      localStorage.setItem("ai-visibility:lastDomainSlug", maskedDomainId);
    }
  }, [maskedDomainId]);

  useEffect(() => {
    const fetchDomainContext = async () => {
      if (!maskedDomainId) return;

      try {
        let realId = unmaskDomainId(maskedDomainId);
        const domainsResp = await apiGet<DashboardAllResponse>("/dashboard/all");
        const domains = domainsResp?.domains || [];
        setAllDomains(domains);

        if (!realId) {
          const matchedDomain = domains.find((domain) => maskDomainId(domain.id) === maskedDomainId);
          realId = matchedDomain?.id ?? null;
        }

        if (!realId) return;

        const data = await apiGet<DashboardDetailResponse>(`/dashboard/${realId}`);
        if (data?.domainInfo) {
          setDomainInfo(data.domainInfo);
        }
      } catch (error) {
        console.error("[TrackPrompts] Failed to fetch domain context", error);
      }
    };

    fetchDomainContext();
  }, [maskedDomainId]);

  const promptData = useMemo(() => trackPromptRows, []);

  return (
    <AIResultsLayout
      activeItem="track-prompts"
      allDomains={allDomains}
      currentDomainId={domainInfo?.id}
      currentDomainUrl={domainInfo?.url}
      maskedDomainId={maskedDomainId}
      title="Track Prompts"
    >
      <section className="flex w-full flex-col gap-6 bg-white px-6 py-3">
        <PromptVisibilityTrendsChart />

        <PromptTable data={promptData} title="Prompt Tracking" />
      </section>
    </AIResultsLayout>
  );
};

export default TrackPromptsPage;
