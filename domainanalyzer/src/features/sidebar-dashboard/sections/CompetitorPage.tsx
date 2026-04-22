"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { fetchEventSource } from "@microsoft/fetch-event-source";
import {
  ArrowUpDown,
  Download,
  Filter,
  RefreshCw,
  Search,
  Upload,
} from "lucide-react";
import CompetitorDetailPage from "./CompetitorDetailPage";

const API_BASE_URL = import.meta.env.VITE_API_URL || "";

interface TableData {
  brand: string;
  keywords: number;
  overlap: number;
  estimatedTraffic: number | string;
}

interface AnalysisResponse {
  event: string;
  progress?: number;
  metricsTable?: {
    domain: string;
    traffic: number;
    keywordCount: number;
  }[];
  keywordOverlap?: {
    percent: number;
  };
  error?: string;
}

interface CompetitorApiResponse {
  competitorListArr: string[];
  competitiveAnalysis?: {
    metricsTable?: {
      domain: string;
      traffic?: number | string;
      keywordCount?: number;
    }[];
    keywordOverlap?: {
      percent: number;
    };
    phraseOverlap?: {
      percent: number;
      phrases?: string[];
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
        }));
      } else {
        const lines = text.split(/\r?\n/).filter(Boolean);
        if (lines.length <= 1) {
          throw new Error('CSV file is empty or missing headers.');
        }

        const rows = lines.slice(1);
        parsed = rows.map((line) => {
          const [brand = '', keywords = '0', overlap = '0', estimatedTraffic = 'N/A'] = line.split(',').map((value) => value.trim());
          return {
            brand,
            keywords: Number(keywords),
            overlap: Number(overlap),
            estimatedTraffic: estimatedTraffic === '' ? 'N/A' : isNaN(Number(estimatedTraffic)) ? estimatedTraffic : Number(estimatedTraffic),
          };
        });
      }

      if (!parsed.length) {
        throw new Error('No valid rows found in imported file.');
      }

      setData(parsed);
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
      'Domain,Keywords,Overlap,Est. Traffic',
      ...rows.map((item) => {
        const traffic = typeof item.estimatedTraffic === 'number' ? item.estimatedTraffic : item.estimatedTraffic;
        return `"${item.brand.replace(/"/g, '""')}",${item.keywords},${item.overlap},"${String(traffic).replace(/"/g, '""')}"`;
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

  useEffect(() => {
    const fetchCompetitors = async () => {
      try {
        if (!domainId) return;
        setRefreshing(true);
        setErrorMessage(null);

        const authToken = localStorage.getItem("authToken");
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

        if (
          result?.competitiveAnalysis?.metricsTable &&
          result.competitiveAnalysis.keywordOverlap !== undefined
        ) {
          const formatted: TableData[] = result.competitiveAnalysis.metricsTable.map((item) => ({
            brand: item.domain,
            keywords: item.keywordCount ?? 0,
            overlap: result.competitiveAnalysis?.keywordOverlap?.percent ?? 0,
            estimatedTraffic: item.traffic ?? "N/A",
          }));

          setData(formatted);
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
            if (res.metricsTable && res.keywordOverlap) {
              const formatted: TableData[] = res.metricsTable.map((item) => ({
                brand: item.domain,
                keywords: item.keywordCount,
                overlap: res.keywordOverlap!.percent,
                estimatedTraffic: item.traffic ?? "N/A",
              }));

              setData(formatted);
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

  const handleRefresh = async () => {
    if (!domainId) return;
    setData([]);
    setSearchTerm("");
    setErrorMessage(null);

    const authToken = localStorage.getItem("authToken");
    try {
      setRefreshing(true);
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

      if (
        result?.competitiveAnalysis?.metricsTable &&
        result.competitiveAnalysis.keywordOverlap !== undefined
      ) {
        const formatted: TableData[] = result.competitiveAnalysis.metricsTable.map((item) => ({
          brand: item.domain,
          keywords: item.keywordCount ?? 0,
          overlap: result.competitiveAnalysis?.keywordOverlap?.percent ?? 0,
          estimatedTraffic: item.traffic ?? "N/A",
        }));

        setData(formatted);
      }
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
        }));

    const term = searchTerm.trim().toLowerCase();
    if (!term) return source;

    return source.filter((item) =>
      item.brand.toLowerCase().includes(term)
    );
  }, [competitors, data, searchTerm]);

  return (
    <div className="competitor-page p-6 bg-slate-50 min-h-screen">
      {selectedCompetitor ? (
        <CompetitorDetailPage
          competitorDomain={selectedCompetitor}
          onBack={() => setSelectedCompetitor(null)}
        />
      ) : (
        <div className="mx-auto max-w-7xl rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">
              Competitor Landscape
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Track competitor domains, keyword volume, overlap, and estimated traffic in one place.
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
                onClick={handleRefresh}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 whitespace-nowrap"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
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
                <Download className="h-4 w-4" />
                Export Data
              </button>
            </div>
          </div>
        </div>

        {errorMessage && (
          <div className="mt-6 rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        {competitors.length > 0 && (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {competitors.map((competitor) => (
              <div
                key={competitor}
                className="flex items-center justify-between rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3"
              >
                <span className="truncate text-sm text-slate-700">{competitor}</span>
                <button
                  type="button"
                  onClick={() => runAnalysis(competitor)}
                  disabled={loading}
                  className="ml-3 inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Analyze
                </button>
              </div>
            ))}
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

        <div className="mt-6 overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-6 py-4 font-semibold uppercase tracking-[0.12em] text-slate-600">
                  Domain
                </th>
                <th className="px-6 py-4 font-semibold uppercase tracking-[0.12em] text-slate-600">
                  Key words
                </th>
                <th className="px-6 py-4 font-semibold uppercase tracking-[0.12em] text-slate-600">
                  Overlap
                </th>
                <th className="px-6 py-4 font-semibold uppercase tracking-[0.12em] text-slate-600">
                  Est. Traffic
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {tableRows.length > 0 ? (
                tableRows.map((item, index) => (
                  <tr
                    key={index}
                    onClick={() => setSelectedCompetitor(item.brand)}
                    className="hover:bg-slate-50 cursor-pointer transition"
                  >
                    <td className="whitespace-nowrap px-6 py-4 font-medium text-blue-600 hover:underline">
                      {item.brand}
                    </td>
                    <td className="px-6 py-4 text-slate-700">
                      {item.keywords.toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                        {item.overlap}%
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-700">
                      {typeof item.estimatedTraffic === "number"
                        ? item.estimatedTraffic.toLocaleString()
                        : item.estimatedTraffic}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-6 py-16 text-center text-sm text-slate-500">
                    No data available. Run analysis.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </div>
  );
};

export default CompetitorPage;