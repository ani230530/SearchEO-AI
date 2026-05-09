import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { AIResultsLayout } from "@/features/ai-results/components/AIResultsLayout";
import { apiGet } from "@/services/apiClient";
import { KeywordTrackingTable } from "@/features/ai-results/components/KeywordTrackingTable";
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

const buildMockResults = (phrase: string) => [
  {
    accuracy: 8.4,
    citations: [{ title: "SearchEO keyword coverage", url: "https://searcheo.ai/coverage" }],
    id: `${phrase}-gpt`,
    model: "GPT 4.5",
    overall: 8.1,
    phrase,
    presence: 1,
    response: `SearchEO.ai appears in AI-generated comparisons for keyword "${phrase}" with strong competitive coverage and decent source diversity.`,
    sentiment: 8.2,
    sources: ["https://searcheo.ai/coverage", "https://docs.searcheo.ai/keywords"],
  },
  {
    accuracy: 7.6,
    citations: [{ title: "Keyword visibility note", url: "https://searcheo.ai/keywords" }],
    id: `${phrase}-claude`,
    model: "Claude 3",
    overall: 7.4,
    phrase,
    presence: 1,
    response: `Claude highlights SearchEO.ai for keyword "${phrase}" when the query is product-comparison or workflow-focused.`,
    sentiment: 7.1,
    sources: ["https://searcheo.ai/keywords"],
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

const trackKeywordRows = [
  {
    avgSentiment: 8.1,
    bestRank: 2,
    competitorCount: 4,
    competitors: ["Semrush", "Ahrefs", "Moz", "G2"],
    id: "track-keyword-1",
    mentions: 2,
    phrase: "improve website ranking",
    results: buildMockResults("improve website ranking"),
    sov: "42%",
    type: "keyword",
  },
  {
    avgSentiment: 7.4,
    bestRank: 4,
    competitorCount: 3,
    competitors: ["Semrush", "Writesonic", "Surfer"],
    id: "track-keyword-2",
    mentions: 2,
    phrase: "Best tool to use for seo",
    results: buildMockResults("Best tool to use for seo"),
    sov: "42%",
    type: "keyword",
  },
  {
    avgSentiment: 6.8,
    bestRank: 5,
    competitorCount: 3,
    competitors: ["Ahrefs", "Semrush", "Frase"],
    id: "track-keyword-3",
    mentions: 1,
    phrase: "Digital Transformation Initiative",
    results: buildMockResults("Digital Transformation Initiative"),
    sov: "42%",
    type: "keyword",
  },
  {
    avgSentiment: 8.7,
    bestRank: 1,
    competitorCount: 5,
    competitors: ["Semrush", "Ahrefs", "Mangools", "Moz", "G2"],
    id: "track-keyword-4",
    mentions: 2,
    phrase: "Digital marketing websites",
    results: buildMockResults("Digital marketing websites"),
    sov: "42%",
    type: "keyword",
  },
  {
    avgSentiment: 7.2,
    bestRank: 3,
    competitorCount: 2,
    competitors: ["Semrush", "Ahrefs"],
    id: "track-keyword-5",
    mentions: 2,
    phrase: "Search engine optimization",
    results: buildMockResults("Search engine optimization"),
    sov: "42%",
    type: "keyword",
  },
  {
    avgSentiment: 7.9,
    bestRank: 2,
    competitorCount: 4,
    competitors: ["Semrush", "Ahrefs", "Moz", "G2"],
    id: "track-keyword-6",
    mentions: 3,
    phrase: "AI content optimization",
    results: buildMockResults("AI content optimization"),
    sov: "38%",
    type: "keyword",
  },
  {
    avgSentiment: 6.5,
    bestRank: 6,
    competitorCount: 2,
    competitors: ["SurferSEO", "Clearscope"],
    id: "track-keyword-7",
    mentions: 1,
    phrase: "semantic search strategy",
    results: buildMockResults("semantic search strategy"),
    sov: "15%",
    type: "keyword",
  },
  {
    avgSentiment: 8.2,
    bestRank: 1,
    competitorCount: 3,
    competitors: ["Ahrefs", "Semrush", "Ubersuggest"],
    id: "track-keyword-8",
    mentions: 4,
    phrase: "LLM visibility metrics",
    results: buildMockResults("LLM visibility metrics"),
    sov: "55%",
    type: "keyword",
  },
  {
    avgSentiment: 7.0,
    bestRank: 4,
    competitorCount: 5,
    competitors: ["G2", "Capterra", "TrustRadius"],
    id: "track-keyword-9",
    mentions: 2,
    phrase: "software review trends",
    results: buildMockResults("software review trends"),
    sov: "28%",
    type: "keyword",
  },
];

const TrackKeywordsPage = () => {
  console.log("TrackKeywordsPage Rendering");
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
        const domainsResp = await apiGet<DashboardAllResponse>("/wizard/domains");
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
        console.error("[TrackKeywords] Failed to fetch domain context", error);
      }
    };

    fetchDomainContext();
  }, [maskedDomainId]);

  const keywordData = useMemo(() => trackKeywordRows, []);

  return (
    <AIResultsLayout
      activeItem="top-keywords"
      allDomains={allDomains}
      currentDomainId={domainInfo?.id}
      currentDomainUrl={domainInfo?.url}
      maskedDomainId={maskedDomainId}
      title="Track Keywords"
    >
      <section className="flex w-full flex-col gap-6 bg-white px-6 py-3">
        <KeywordTrackingTable data={keywordData} title="Keywords Tracking" />
      </section>
    </AIResultsLayout>
  );
};

export default TrackKeywordsPage;
