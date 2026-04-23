"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { fetchEventSource } from "@microsoft/fetch-event-source";
import {
  ArrowUpDown,
  Filter,
  RefreshCw,
  Search,
  Upload,
  Plus,
  BarChart3,
  Target,
  Users,
} from "lucide-react";
import CompetitorDetailPage from "./CompetitorDetailPage";

const API_BASE_URL = import.meta.env.VITE_API_URL || "";

const DEFAULT_COMPETITOR_LLM_SOURCE: AnalysisDataSource = {
  type: "llm_estimate",
  provider: "OpenAI",
  model: "GPT-4o",
};

interface TableData {
  brand: string;
  keywords: number;
  overlap: number;
  estimatedTraffic: number | string;
  domainAuthority?: number;
  aiVisibility?: number;
  sentiment?: 'positive' | 'neutral' | 'negative';
  source?: 'existing' | 'analysis' | 'imported' | 'llm_estimate';
}

interface AnalysisResponse {
  event: string;
  progress?: number;
  metricsTable?: {
    domain: string;
    traffic: number;
    keywordCount: number;
    domainAuthority?: number;
    aiVisibility?: number;
  }[];
  keywordOverlap?: {
    percent: number;
  };
  error?: string;
}

interface CompetitorApiResponse {
  competitorListArr: string[];
  competitors?: unknown;
  competitiveAnalysis?: {
    analysisType?: string;
    dataSource?: AnalysisDataSource;
    metricsTable?: {
      domain: string;
      traffic?: number | string;
      keywordCount?: number;
      keywords?: number;
      estimatedKeywordCount?: number;
      estimatedTraffic?: number | string;
      estimatedMonthlyTraffic?: number | string;
      domainAuthority?: number;
      aiVisibility?: number;
      overlap?: number;
    }[];
    keywordOverlap?: {
      percent: number;
    };
    phraseOverlap?: {
      percent: number;
      phrases?: string[];
    };
  } | string;
}

interface AnalysisDataSource {
  type?: string;
  provider?: string;
  model?: string;
  llm?: string;
  llmModel?: string;
  modelUsed?: string;
  generatedAt?: string;
  disclaimer?: string;
}

interface StandaloneCompetitor {
  name?: string;
  domain?: string;
  estimatedKeywordCount?: number | string;
  estimatedMonthlyTraffic?: number | string;
  traffic?: number | string;
  keywordCount?: number | string;
  keywords?: number | string;
  domainAuthority?: number;
  aiVisibility?: number;
  dataSource?: string;
  confidence?: string;
}

interface AICompetitorsResponse {
  analysis?: {
    totalMentions: number;
    uniqueCompetitors: string[];
    topCompetitors: Array<{
      name: string;
      domain: string;
      mentions: number;
      sentiment: { positive: number; neutral: number; negative: number };
      averagePosition: number;
    }>;
    summary: {
      totalPhrases: number;
      phrasesWithCompetitors: number;
      mostFrequentCompetitor: string | null;
      averageMentionsPerPhrase: number;
    };
  };
}

interface Props {
  domainId: string;
}

const CompetitorPage: React.FC<Props> = ({ domainId }) => {
  const [data, setData] = useState<TableData[]>([]);
  const [competitors, setCompetitors] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importing, setImporting] = useState<boolean>(false);
  const [selectedCompetitor, setSelectedCompetitor] = useState<string | null>(null);
  const [newCompetitor, setNewCompetitor] = useState<string>("");
  const [showAddCompetitor, setShowAddCompetitor] = useState<boolean>(false);
  const [summaryStats, setSummaryStats] = useState<{
    totalCompetitors: number;
    avgOverlap: number;
    totalKeywords: number;
  } | null>(null);
  const [analysisDataSource, setAnalysisDataSource] = useState<AnalysisDataSource | null>(null);

  const parseObject = <T extends Record<string, unknown>>(value: unknown): T | null => {
    if (!value) return null;
    if (typeof value === "object" && !Array.isArray(value)) return value as T;
    if (typeof value !== "string") return null;

    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as T)
        : null;
    } catch {
      return null;
    }
  };

  const parseArray = <T,>(value: unknown): T[] => {
    if (Array.isArray(value)) return value as T[];
    if (typeof value !== "string") return [];

    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  };

  const toNumber = (value: unknown, fallback = 0) => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value.replace(/[^0-9.-]/g, ""));
      return Number.isFinite(parsed) ? parsed : fallback;
    }

    return fallback;
  };

  const formatPercent = (value: unknown) => {
    const number = toNumber(value);
    return Number.isInteger(number) ? String(number) : number.toFixed(1);
  };

  const normalizeKey = (brand: string) => brand.trim().toLowerCase();

  const normalizeModelName = (model?: string) => {
    if (!model) return undefined;
    const normalized = model.trim();
    if (normalized.toLowerCase() === "gpt-4o") return "GPT-4o";
    if (normalized.toLowerCase() === "gpt-4o-mini") return "GPT-4o Mini";
    return normalized;
  };

  const normalizeAnalysisDataSource = (value: unknown): AnalysisDataSource | null => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;

    const source = value as AnalysisDataSource;
    const model = normalizeModelName(source.model || source.llmModel || source.modelUsed || source.llm);

    if (!source.provider && !model) return null;

    return {
      ...source,
      provider: source.provider || "AI",
      model,
    };
  };

  const getAnalysisDataSource = (result: CompetitorApiResponse): AnalysisDataSource | null => {
    const competitiveAnalysis = parseObject<Record<string, unknown>>(result.competitiveAnalysis);
    const nestedAnalysis = parseObject<Record<string, unknown>>(competitiveAnalysis?.newAnalysis);
    const dataSource = normalizeAnalysisDataSource(
      competitiveAnalysis?.dataSource || nestedAnalysis?.dataSource
    );

    if (dataSource) return dataSource;

    if (
      competitiveAnalysis?.analysisType === "standalone_peer" ||
      nestedAnalysis?.analysisType === "standalone_peer" ||
      competitiveAnalysis?.metricsTable ||
      nestedAnalysis?.metricsTable ||
      parseArray<StandaloneCompetitor>(result.competitors).length > 0 ||
      (result.competitorListArr || []).length > 0
    ) {
      return DEFAULT_COMPETITOR_LLM_SOURCE;
    }

    return null;
  };

  const getDataSourceLogo = () => {
    const sourceText = [
      analysisDataSource?.provider,
      analysisDataSource?.model,
      ...data.map((item) => item.source),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (sourceText.includes("gemini") || sourceText.includes("google")) {
      return {
        label: "Gemini",
        logoSrc: "https://upload.wikimedia.org/wikipedia/commons/1/1d/Google_Gemini_icon_2025.svg",
      };
    }

    if (sourceText.includes("claude") || sourceText.includes("anthropic")) {
      return {
        label: "Claude",
        logoSrc: "/claude-color.svg",
      };
    }

    if (analysisDataSource) {
      return {
        label: "ChatGPT",
        logoSrc: "https://upload.wikimedia.org/wikipedia/commons/e/ef/ChatGPT-Logo.svg",
      };
    }

    const sources = Array.from(new Set(data.map((item) => item.source).filter(Boolean)));
    if (sources.includes("llm_estimate") || sources.includes("analysis") || sources.includes("existing")) {
      return {
        label: "ChatGPT",
        logoSrc: "https://upload.wikimedia.org/wikipedia/commons/e/ef/ChatGPT-Logo.svg",
      };
    }
    if (sources.includes("imported")) {
      return {
        label: "Imported file",
        logoSrc: "",
        iconClassName: "ri-upload-cloud-2-fill text-slate-600",
      };
    }

    return {
      label: "No source yet",
      logoSrc: "",
      iconClassName: "ri-question-fill text-slate-500",
    };
  };

  const updateSummaryStats = (rows: TableData[]) => {
    setSummaryStats({
      totalCompetitors: rows.length,
      avgOverlap: rows.length
        ? Number((rows.reduce((sum, item) => sum + item.overlap, 0) / rows.length).toFixed(1))
        : 0,
      totalKeywords: rows.reduce((sum, item) => sum + item.keywords, 0),
    });
  };

  const rowsFromCompetitorResponse = (result: CompetitorApiResponse): TableData[] => {
    const rawCompetitiveAnalysis = parseObject<NonNullable<Exclude<CompetitorApiResponse["competitiveAnalysis"], string>>>(
      result.competitiveAnalysis
    );
    const competitiveAnalysis =
      parseObject<NonNullable<Exclude<CompetitorApiResponse["competitiveAnalysis"], string>>>(
        (rawCompetitiveAnalysis as Record<string, unknown> | null)?.newAnalysis
      ) ?? rawCompetitiveAnalysis;

    if (competitiveAnalysis?.metricsTable?.length) {
      const overlap = competitiveAnalysis.keywordOverlap?.percent ?? 0;
      return competitiveAnalysis.metricsTable.map((item) => ({
        brand: item.domain,
        keywords: toNumber(item.keywordCount ?? item.keywords ?? item.estimatedKeywordCount),
        overlap: toNumber(item.overlap ?? overlap),
        estimatedTraffic:
          item.traffic ?? item.estimatedTraffic ?? item.estimatedMonthlyTraffic ?? "N/A",
        domainAuthority: item.domainAuthority,
        aiVisibility: item.aiVisibility,
        source: competitiveAnalysis.analysisType === "standalone_peer" ? "llm_estimate" : "existing",
      }));
    }

    const standaloneCompetitors = parseArray<StandaloneCompetitor>(result.competitors);
    if (standaloneCompetitors.length) {
      return standaloneCompetitors.map((competitor) => ({
        brand: competitor.domain || competitor.name || "Unknown competitor",
        keywords: toNumber(
          competitor.estimatedKeywordCount ?? competitor.keywordCount ?? competitor.keywords
        ),
        overlap: 0,
        estimatedTraffic:
          competitor.estimatedMonthlyTraffic ?? competitor.estimatedTraffic ?? competitor.traffic ?? "N/A",
        domainAuthority: competitor.domainAuthority,
        aiVisibility: competitor.aiVisibility,
        source: competitor.dataSource === "LLM estimate" ? "llm_estimate" : "existing",
      }));
    }

    return (result.competitorListArr || []).map((brand) => ({
      brand,
      keywords: 0,
      overlap: 0,
      estimatedTraffic: "N/A",
      source: "existing",
    }));
  };

  const mergeRows = (current: TableData[], incoming: TableData[]) => {
    const rowsByBrand = new Map<string, TableData>();
    [...current, ...incoming].forEach((row) => {
      const key = normalizeKey(row.brand);
      if (!key) return;

      const existing = rowsByBrand.get(key);
      rowsByBrand.set(key, {
        ...existing,
        ...row,
        keywords: row.keywords || existing?.keywords || 0,
        overlap: row.overlap || existing?.overlap || 0,
        estimatedTraffic:
          row.estimatedTraffic !== "N/A" ? row.estimatedTraffic : existing?.estimatedTraffic ?? "N/A",
      });
    });

    return Array.from(rowsByBrand.values());
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setErrorMessage(null);

    try {
      const text = await file.text();
      let parsed: TableData[] = [];

      if (file.name.toLowerCase().endsWith('.json')) {
        const json = JSON.parse(text);
        if (!Array.isArray(json)) {
          throw new Error('Invalid JSON format. Expected an array.');
        }

        parsed = json.map((item: any) => ({
          brand: String(item.brand || item.domain || ''),
          keywords: Number(item.keywords ?? item.keywordCount ?? 0),
          overlap: Number(item.overlap ?? item.percent ?? 0),
          estimatedTraffic: item.estimatedTraffic ?? item.traffic ?? 'N/A',
          domainAuthority: item.domainAuthority,
          aiVisibility: item.aiVisibility,
          source: 'imported'
        }));
      } else {
        const lines = text.split(/\r?\n/).filter(Boolean);
        if (lines.length <= 1) {
          throw new Error('CSV file is empty or missing headers.');
        }

        const rows = lines.slice(1);
        parsed = rows.map((line) => {
          const [brand = '', keywords = '0', overlap = '0', estimatedTraffic = 'N/A', domainAuthority = '', aiVisibility = ''] = line.split(',').map((value) => value.trim());
          return {
            brand,
            keywords: Number(keywords),
            overlap: Number(overlap),
            estimatedTraffic: estimatedTraffic === '' ? 'N/A' : isNaN(Number(estimatedTraffic)) ? estimatedTraffic : Number(estimatedTraffic),
            domainAuthority: domainAuthority ? Number(domainAuthority) : undefined,
            aiVisibility: aiVisibility ? Number(aiVisibility) : undefined,
            source: 'imported' as const
          };
        });
      }

      if (!parsed.length) {
        throw new Error('No valid rows found in imported file.');
      }

      setData(parsed);
      updateSummaryStats(parsed);
      setAnalysisDataSource(null);
    } catch (error) {
      console.error('Import error:', error);
      setErrorMessage('Failed to import file. Please use a valid CSV or JSON format.');
    } finally {
      setImporting(false);
      if (event.target) {
        event.target.value = '';
      }
    }
  };

  const handleExportData = () => {
    const rows = tableRows.length ? tableRows : data.length ? data : [];
    if (!rows.length) {
      setErrorMessage('No data available to export.');
      return;
    }

    const csvRows = [
      'Domain,Keywords,Overlap,Est. Traffic,Domain Authority,AI Visibility,Source',
      ...rows.map((item) => {
        const traffic = typeof item.estimatedTraffic === 'number' ? item.estimatedTraffic : item.estimatedTraffic;
        return `"${item.brand.replace(/"/g, '""')}",${item.keywords},${item.overlap},"${String(traffic).replace(/"/g, '""')}",${item.domainAuthority ?? ''},${item.aiVisibility ?? ''},${item.source ?? ''}`;
      }),
    ];

    const blob = new Blob([csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'competitor-data.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleAddCompetitor = () => {
    if (newCompetitor.trim()) {
      runAnalysis(newCompetitor.trim());
      setNewCompetitor("");
      setShowAddCompetitor(false);
    }
  };

  // Fetch data from multiple existing endpoints
  useEffect(() => {
    const fetchCompetitors = async () => {
      try {
        if (!domainId) return;
        setRefreshing(true);
        setErrorMessage(null);

        const authToken = localStorage.getItem("authToken");
        
        // Fetch from existing competitor endpoint
        const res = await fetch(`${API_BASE_URL}/api/competitor/${domainId}`, {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });

        if (!res.ok) {
          throw new Error(`Failed to fetch competitors: ${res.status}`);
        }

        const result: CompetitorApiResponse = await res.json();
        setCompetitors(result?.competitorListArr || []);
        setAnalysisDataSource(getAnalysisDataSource(result));

        const formatted = rowsFromCompetitorResponse(result);
        setData(formatted);
        updateSummaryStats(formatted);

        // Also try to fetch from AI queries endpoint for additional competitor data
        try {
          const aiRes = await fetch(`${API_BASE_URL}/api/ai-queries/competitors/${domainId}`, {
            headers: {
              Authorization: `Bearer ${authToken}`,
            },
          });

          if (aiRes.ok) {
            const aiResult: AICompetitorsResponse = await aiRes.json();
            if (aiResult.analysis?.topCompetitors) {
              // Merge AI competitor data with existing data
              const aiCompetitors: TableData[] = aiResult.analysis.topCompetitors.map((comp) => ({
                brand: comp.domain || comp.name,
                keywords: comp.mentions,
                overlap: 0,
                estimatedTraffic: "N/A",
                source: 'analysis'
              }));

              // Merge, avoiding duplicates
              setData(prev => {
                const merged = mergeRows(prev, aiCompetitors);
                updateSummaryStats(merged);
                return merged;
              });
            }
          }
        } catch (aiError) {
          console.log("AI competitors endpoint not available:", aiError);
        }

        // Try to fetch suggested competitors as well
        try {
          const suggestedRes = await fetch(`${API_BASE_URL}/api/dashboard/${domainId}/suggested-competitors`, {
            headers: {
              Authorization: `Bearer ${authToken}`,
            },
          });

          if (suggestedRes.ok) {
            const suggestedResult = await suggestedRes.json();
            if (suggestedResult.suggestedCompetitors?.length > 0) {
              // Add suggested competitors that don't already exist
              const suggestedRows: TableData[] = suggestedResult.suggestedCompetitors.map(
                (suggested: { domain?: string; name?: string }) => ({
                  brand: suggested.domain || suggested.name || "Unknown competitor",
                  keywords: 0,
                  overlap: 0,
                  estimatedTraffic: "N/A",
                  source: "existing",
                })
              );

              setCompetitors(prev => {
                const existing = new Set(prev);
                const newSuggested = suggestedResult.suggestedCompetitors
                  .filter((s: { domain: string }) => !existing.has(s.domain))
                  .map((s: { domain: string }) => s.domain);
                return [...prev, ...newSuggested];
              });

              setData(prev => {
                const merged = mergeRows(prev, suggestedRows);
                updateSummaryStats(merged);
                return merged;
              });
            }
          }
        } catch (suggestError) {
          console.log("Suggested competitors endpoint not available:", suggestError);
        }

      } catch (error) {
        console.error("Error fetching competitors:", error);
        setErrorMessage("Unable to load competitor list.");
      } finally {
        setRefreshing(false);
      }
    };

    fetchCompetitors();
  }, [domainId]);

  const runAnalysis = (competitorDomain: string) => {
    if (!domainId) {
      alert("Domain ID missing");
      return;
    }

    setLoading(true);
    setProgress(0);
    setErrorMessage(null);

    const authToken = localStorage.getItem("authToken");
    const sseUrl = `${API_BASE_URL}/api/competitor/analyze`;

    fetchEventSource(sseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        targetDomain: domainId,
        competitorDomain,
      }),
      onmessage(event) {
        try {
          const res: AnalysisResponse = JSON.parse(event.data);

          if (res.event === "progress") {
            setProgress(res.progress || 0);
          }

          if (res.event === "analysis") {
            setAnalysisDataSource(DEFAULT_COMPETITOR_LLM_SOURCE);

            if (res.metricsTable && res.keywordOverlap) {
              const formatted: TableData[] = res.metricsTable.map((item) => ({
                brand: item.domain,
                keywords: item.keywordCount,
                overlap: res.keywordOverlap!.percent,
                estimatedTraffic: item.traffic ?? "N/A",
                domainAuthority: item.domainAuthority,
                aiVisibility: item.aiVisibility,
                source: 'analysis'
              }));

              // Merge with existing data, avoiding duplicates
              setData(prev => {
                const merged = mergeRows(prev, formatted);
                updateSummaryStats(merged);
                return merged;
              });
            }

            setLoading(false);
          }

          if (res.event === "error") {
            console.error("Analysis error:", res.error);
            setErrorMessage(res.error || "Competitor analysis failed.");
            setLoading(false);
          }
        } catch (err) {
          console.error("Parsing error:", err);
          setErrorMessage("Failed to parse analysis result.");
          setLoading(false);
        }
      },
      onclose() {
        setLoading(false);
      },
      onerror(err) {
        console.error("SSE connection error", err);
        setErrorMessage("Competitor analysis connection failed.");
        setLoading(false);
        throw err;
      },
    });
  };

  const runStandaloneAnalysis = async () => {
    if (!domainId) return;

    setRefreshing(true);
    setErrorMessage(null);

    try {
      const authToken = localStorage.getItem("authToken");
      const res = await fetch(`${API_BASE_URL}/api/competitor/${domainId}/standalone`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ force: true }),
      });

      const result: CompetitorApiResponse & { error?: string; message?: string } = await res.json();

      if (!res.ok) {
        throw new Error(result?.message || result?.error || "Standalone competitor analysis failed.");
      }

      setCompetitors(result?.competitorListArr || []);
      setAnalysisDataSource(getAnalysisDataSource(result));

      const formatted = rowsFromCompetitorResponse(result);
      setData(formatted);
      updateSummaryStats(formatted);
    } catch (error) {
      console.error("Standalone competitor analysis error:", error);
      setErrorMessage(error instanceof Error ? error.message : "Unable to run standalone analysis.");
    } finally {
      setRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    if (!domainId) return;
    setData([]);
    setSearchTerm("");
    setErrorMessage(null);

    const authToken = localStorage.getItem("authToken");
    try {
      setRefreshing(true);
      
      // Fetch from main competitor endpoint
      const res = await fetch(`${API_BASE_URL}/api/competitor/${domainId}`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (!res.ok) {
        throw new Error(`Failed to refresh competitors: ${res.status}`);
      }

      const result: CompetitorApiResponse = await res.json();
      setCompetitors(result?.competitorListArr || []);
      setAnalysisDataSource(getAnalysisDataSource(result));

      const formatted = rowsFromCompetitorResponse(result);
      setData(formatted);
      updateSummaryStats(formatted);
    } catch (error) {
      console.error("Refresh error:", error);
      setErrorMessage("Unable to refresh competitor list.");
    } finally {
      setRefreshing(false);
    }
  };

  const tableRows = useMemo(() => {
    const source: TableData[] = data.length
      ? data
      : competitors.map((brand) => ({
          brand,
          keywords: 0,
          overlap: 0,
          estimatedTraffic: "N/A",
          source: 'existing'
        }));

    const term = searchTerm.trim().toLowerCase();
    if (!term) return source.slice(0, 10); // Limit to 10 competitors

    const filtered = source.filter((item) =>
      item.brand.toLowerCase().includes(term)
    );

    // Remove duplicates by brand name
    const uniqueFiltered = Array.from(new Map(filtered.map(item => [item.brand, item])).values());

    return uniqueFiltered.slice(0, 10); // Limit to 10 competitors
  }, [competitors, data, searchTerm]);

  return (
    <div className="competitor-page p-6  min-h-screen">
      {selectedCompetitor ? (
        <CompetitorDetailPage
          competitorDomain={selectedCompetitor}
          onBack={() => setSelectedCompetitor(null)}
        />
      ) : (
        <div className="mx-auto max-w-7xl p-6">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">
              Competitor Landscape
            </h2>
            <p className="flex items-center gap-2 mt-2 text-sm font-light text-gray-600">
              Last scanned at {new Date().toLocaleString()}
            </p>
          </div>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
            <div className="flex flex-1 min-w-0 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 shadow-sm">
              <Search className="h-4 w-4 text-slate-500" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Find Keyword..."
                className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
              />
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
              >
                <Filter className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
              >
                <ArrowUpDown className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex flex-nowrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddCompetitor(true)}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 whitespace-nowrap"
              >
                <Plus className="h-4 w-4" />
                Add Competitor
              </button>
              <button
                type="button"
                onClick={handleRefresh}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 whitespace-nowrap"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
              <button
                type="button"
                onClick={runStandaloneAnalysis}
                disabled={refreshing}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                Standalone Analysis
              </button>
              <button
                type="button"
                onClick={handleImportClick}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 whitespace-nowrap"
              >
                <Upload className="h-4 w-4" />
                Import file
              </button>
              <button
                type="button"
                onClick={handleExportData}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 whitespace-nowrap"
              >
                <img src="/export-icon.png" alt="Export" className="h-4 w-4" />
                Export Data
              </button>
            </div>
          </div>
        </div>

        {/* Add Competitor Modal */}
        {showAddCompetitor && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-4">
              <input
                type="text"
                value={newCompetitor}
                onChange={(e) => setNewCompetitor(e.target.value)}
                placeholder="Enter competitor domain (e.g., competitor.com)"
                className="flex-1 rounded-md border border-slate-300 px-4 py-2 text-sm outline-none focus:border-blue-500"
                onKeyPress={(e) => e.key === 'Enter' && handleAddCompetitor()}
              />
              <button
                type="button"
                onClick={handleAddCompetitor}
                disabled={!newCompetitor.trim()}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
              >
                Analyze
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddCompetitor(false);
                  setNewCompetitor("");
                }}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="mt-6 rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.json"
          className="hidden"
          onChange={handleFileChange}
        />

        {loading && (
          <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            Analyzing... {progress}%
          </div>
        )}

        {/* Summary Stats Cards */}
        {summaryStats && (
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-blue-100 p-2">
                  <Users className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Competitors</p>
                  <p className="text-2xl font-bold text-slate-900">{summaryStats.totalCompetitors}</p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-green-100 p-2">
                  <Target className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Avg Keyword Overlap</p>
                  <p className="text-2xl font-bold text-slate-900">{summaryStats.avgOverlap}%</p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-purple-100 p-2">
                  <BarChart3 className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Keywords</p>
                  <p className="text-2xl font-bold text-slate-900">{summaryStats.totalKeywords.toLocaleString()}</p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-yellow-50 p-2 text-yellow-500">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="m10 16 4-4-4-4" />
                    <path d="M3 12h11" />
                    <path d="M3 8V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Data Sources</p>
                  {(() => {
                    const sourceLogo = getDataSourceLogo();

                    return (
                      <p
                        className="flex h-8 items-center text-2xl font-bold text-slate-900"
                        aria-label={sourceLogo.label}
                        title={sourceLogo.label}
                      >
                        {sourceLogo.logoSrc ? (
                          <img
                            src={sourceLogo.logoSrc}
                            alt=""
                            className="h-7 w-7 object-contain"
                            aria-hidden="true"
                          />
                        ) : (
                          <i className={`${sourceLogo.iconClassName} text-2xl`} aria-hidden="true" />
                        )}
                        <span className="sr-only">{sourceLogo.label}</span>
                      </p>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        )}

       <div className="mt-10">
  <div className="overflow-hidden rounded-lg bg-gray-100 shadow-[0_8px_24px_rgba(15,23,42,0.03)] border border-gray-200">
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        
        {/* HEADER */}
        <thead>
          <tr className="text-left text-xs font-semibold tracking-wider text-gray-700 bg-gray-200">
            <th className="px-6 py-4 w-[30%]">Domain</th>
            <th className="px-6 py-4 w-[15%]">Keywords</th>
            <th className="px-6 py-4 text-right w-[12%]">Overlap</th>
            <th className="px-6 py-4 text-right w-[15%]">Est. Traffic</th>
          </tr>
        </thead>

        {/* BODY */}
        <tbody className="divide-y divide-gray-100 bg-white">
          {tableRows.length > 0 ? (
            tableRows.map((item, index) => (
              <tr
                key={index}
                onClick={() => setSelectedCompetitor(item.brand)}
                className="hover:bg-gray-50 transition-colors cursor-pointer"
              >
                
                {/* Domain */}
                <td className="whitespace-nowrap px-6 py-5 font-medium text-gray-800">
                  <span className="flex items-center gap-2">
                    <span className="truncate max-w-[220px] text-blue-600 hover:underline">
                      {item.brand}
                    </span>
                  </span>
                </td>

                {/* Keywords */}
                <td className="px-6 py-5 text-gray-700">
                  {item.keywords.toLocaleString()}
                </td>

                {/* Overlap */}
                <td className="px-6 py-5 text-right">
                  <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-600">
                    {formatPercent(item.overlap)}%
                  </span>
                </td>

                {/* Traffic */}
                <td className="px-6 py-5 text-gray-700 text-right">
                  {typeof item.estimatedTraffic === "number"
                    ? item.estimatedTraffic.toLocaleString()
                    : item.estimatedTraffic}
                </td>

              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={4} className="px-6 py-16 text-center text-sm text-gray-500">
                No data available. Add a competitor or run analysis.
              </td>
            </tr>
          )}
        </tbody>

      </table>
    </div>
  </div>
</div>
      </div>
      )}
    </div>
  );
};

export default CompetitorPage;
