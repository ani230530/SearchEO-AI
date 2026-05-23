import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  ArrowUpDown,
  Check,
  Download,
  Filter,
  RefreshCw,
  Search,
  Upload,
} from "lucide-react";
import { apiPost } from "@/services/apiClient";
import { normalizeDomain } from "@/features/sidebar-dashboard/utils";
import type { CompetitorIntelligenceProps } from "@/features/sidebar-dashboard/types";

type FilterMode = "all" | "mentioned" | "high_overlap" | "high_traffic";
type SortMode = "rank" | "traffic" | "keywords";
type Row = CompetitorIntelligenceProps["data"][number] & {
  rank?: number | null;
  mentions?: number;
  marketShare?: number;
  estimatedTraffic: number;
};

const HIGH_TRAFFIC_THRESHOLD = 100_000;

function formatTraffic(value: number | string | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toLocaleString();
  }
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  return "—";
}

function formatOverlap(value: number | string | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const percent = value > 1 ? value : value * 100;
    return `${Math.round(percent)}%`;
  }
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  return "—";
}

function formatKeywordCount(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return Math.round(value).toLocaleString();
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && next === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      out.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  out.push(current.trim());
  return out;
}

function extractHost(value: string): string {
  const trimmed = value.trim().replace(/^"+|"+$/g, "");
  if (!trimmed) return "";

  try {
    const url = trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? new URL(trimmed)
      : new URL(`https://${trimmed}`);
    return normalizeDomain(url.href);
  } catch {
    return normalizeDomain(trimmed);
  }
}

function extractHostsFromCsv(text: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const hosts: string[] = [];
  for (const [index, line] of lines.entries()) {
    const cells = parseCsvLine(line);
    const candidate = cells[0] ?? "";
    const host = extractHost(candidate);
    if (!host) continue;

    if (
      index === 0 &&
      /competitor|domain|host/i.test(candidate) &&
      !/\./.test(host)
    ) {
      continue;
    }

    hosts.push(host);
  }

  return Array.from(new Set(hosts));
}

export default function CompetitorPage({
  domainId,
  loading,
  competitors,
  data,
  title = "Competitor Landscape",
  subtitle,
  onRunAnalysis,
  onRefresh,
}: CompetitorIntelligenceProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [sortMode, setSortMode] = useState<SortMode>("rank");
  const [filterOpen, setFilterOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const filterMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!filterMenuRef.current) return;
      if (filterMenuRef.current.contains(event.target as Node)) return;
      setFilterOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFilterOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const rows = useMemo<Row[]>(() => {
    const normalized = searchTerm.trim().toLowerCase();
    let mapped = data.map((row) => ({
      ...row,
      domain: row.domain.trim(),
      estimatedTraffic: row.estimatedTraffic ?? (typeof row.traffic === "number" ? row.traffic : 0),
    }));

    if (normalized) {
      mapped = mapped.filter((row) => row.domain.toLowerCase().includes(normalized));
    }

    mapped = mapped.filter((row) => {
      const overlap = typeof row.overlap === "number" ? (row.overlap > 1 ? row.overlap / 100 : row.overlap) : 0;
      const mentions = row.mentions ?? 0;
      const traffic = row.estimatedTraffic ?? 0;

      switch (filterMode) {
        case "mentioned":
          return mentions > 0;
        case "high_overlap":
          return overlap >= 0.5;
        case "high_traffic":
          return traffic >= HIGH_TRAFFIC_THRESHOLD;
        case "all":
        default:
          return true;
      }
    });

    return mapped.sort((a, b) => {
      if (sortMode === "keywords") {
        return (b.keywords ?? 0) - (a.keywords ?? 0);
      }

      if (sortMode === "traffic") {
        return (b.estimatedTraffic ?? 0) - (a.estimatedTraffic ?? 0);
      }

      const aRank = typeof a.rank === "number" ? a.rank : Number.MAX_SAFE_INTEGER;
      const bRank = typeof b.rank === "number" ? b.rank : Number.MAX_SAFE_INTEGER;
      if (aRank !== bRank) return aRank - bRank;
      return (b.estimatedTraffic ?? 0) - (a.estimatedTraffic ?? 0);
    });
  }, [data, filterMode, searchTerm, sortMode]);

  const visibleCompetitors = useMemo(() => rows.map((row) => row.domain), [rows]);

  const handleExport = () => {
    if (rows.length === 0) return;

    const csv = [
      "Competitor,Keywords,Overlap,Estimated Traffic",
      ...rows.map((row) =>
        [
          `"${row.domain.replace(/"/g, '""')}"`,
          `"${formatKeywordCount(row.keywords)}"`,
          `"${formatOverlap(row.overlap)}"`,
          `"${formatTraffic(row.estimatedTraffic)}"`,
        ].join(",")
      ),
    ].join("\r\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `competitor-landscape-${domainId || "export"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !domainId) return;

    setStatusMessage(null);
    setIsImporting(true);

    try {
      const text = await file.text();
      const importedHosts = extractHostsFromCsv(text);
      const selectedHosts = new Set(competitors.map((host) => extractHost(host)).filter(Boolean));
      const hostsToAdd = importedHosts.filter((host) => !selectedHosts.has(host));

      if (hostsToAdd.length === 0) {
        setStatusMessage("No new competitors found in the file.");
        return;
      }

      let added = 0;
      let failed = 0;
      for (const host of hostsToAdd) {
        try {
          await apiPost(`/wizard/domain/${domainId}/competitors/add`, { host });
          added += 1;
        } catch {
          failed += 1;
        }
      }

      await onRefresh?.();

      if (failed > 0) {
        setStatusMessage(`Imported ${added} competitor${added === 1 ? "" : "s"} with ${failed} failure${failed === 1 ? "" : "s"}.`);
      } else {
        setStatusMessage(`Imported ${added} competitor${added === 1 ? "" : "s"}.`);
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setIsImporting(false);
    }
  };

  const activeFilterLabel =
    filterMode === "all"
      ? "All"
      : filterMode === "mentioned"
        ? "Mentioned"
        : filterMode === "high_overlap"
          ? "High overlap"
          : "High traffic";

  const controlsDisabled = rows.length === 0 && !loading;

  return (
    <div className="min-h-full bg-[#F9FAFB] px-6 py-6 text-slate-900">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[18px] font-medium leading-tight text-[#414651]">{title}</h1>
            {subtitle ? <p className="mt-1 text-sm text-[#667085]">{subtitle}</p> : null}
            <p className="mt-1 text-xs text-[#98A2B3]">
              {competitors.length > 0 ? `${competitors.length} selected competitors` : "No selected competitors yet"}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-[#EAECF0] bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-[#EAECF0] px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex w-full max-w-[260px] items-center gap-2 rounded-md border border-[#D0D5DD] bg-white px-3 py-2">
              <Search className="h-4 w-4 text-[#98A2B3]" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Find Keyword..."
                className="w-full bg-transparent text-sm text-[#344054] outline-none placeholder:text-[#98A2B3]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative" ref={filterMenuRef}>
                <button
                  type="button"
                  onClick={() => setFilterOpen((value) => !value)}
                  className="inline-flex items-center gap-2 rounded-md border border-[#D0D5DD] bg-white px-3 py-2 text-sm font-medium text-[#667085] transition hover:bg-slate-50"
                  title="Filter"
                >
                  <Filter className="h-4 w-4" />
                  <span className="hidden sm:inline">{activeFilterLabel}</span>
                </button>

                {filterOpen ? (
                  <div className="absolute right-0 top-[calc(100%+8px)] z-20 w-56 rounded-lg border border-[#EAECF0] bg-white p-2 shadow-lg">
                    {[
                      { value: "all", label: "All competitors" },
                      { value: "mentioned", label: "Mentioned only" },
                      { value: "high_overlap", label: "High overlap" },
                      { value: "high_traffic", label: "High traffic" },
                    ].map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => {
                          setFilterMode(item.value as FilterMode);
                          setFilterOpen(false);
                        }}
                        className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-[#344054] transition hover:bg-[#F9FAFB]"
                      >
                        <span>{item.label}</span>
                        {filterMode === item.value ? <Check className="h-4 w-4 text-[#175CD3]" /> : null}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => setSortMode((current) => (current === "rank" ? "traffic" : current === "traffic" ? "keywords" : "rank"))}
                className="inline-flex items-center gap-2 rounded-md border border-[#D0D5DD] bg-white px-3 py-2 text-sm font-medium text-[#667085] transition hover:bg-slate-50"
                title={`Sort by ${sortMode}`}
              >
                <ArrowUpDown className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={onRefresh}
                disabled={typeof onRefresh !== "function"}
                className="inline-flex items-center gap-2 rounded-md border border-[#D0D5DD] bg-white px-4 py-2 text-sm font-medium text-[#344054] transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </button>

              <button
                type="button"
                onClick={handleImportClick}
                disabled={isImporting}
                className="inline-flex items-center gap-2 rounded-md border border-[#D0D5DD] bg-white px-4 py-2 text-sm font-medium text-[#344054] transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Upload className="h-4 w-4" />
                {isImporting ? "Importing..." : "Import file"}
              </button>

              <button
                type="button"
                onClick={handleExport}
                disabled={controlsDisabled}
                className="inline-flex items-center gap-2 rounded-md border border-[#D0D5DD] bg-white px-4 py-2 text-sm font-medium text-[#344054] transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Download className="h-4 w-4" />
                Export Data
              </button>
            </div>
          </div>

          {statusMessage ? (
            <div className="border-b border-[#EAECF0] px-4 py-3 text-sm text-[#475467]">
              {statusMessage}
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="min-w-full table-fixed border-separate border-spacing-0">
              <colgroup>
                <col className="w-[44%]" />
                <col className="w-[18%]" />
                <col className="w-[14%]" />
                <col className="w-[24%]" />
              </colgroup>
              <thead>
                <tr className="bg-[#F2F4F7] text-[11px] font-semibold uppercase tracking-[0.06em] text-[#475467]">
                  <th className="px-4 py-3 text-left">Competitor</th>
                  <th className="px-4 py-3 text-left">Keywords</th>
                  <th className="px-4 py-3 text-left">Overlap</th>
                  <th className="px-4 py-3 text-left">Estimated Traffic</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {loading && rows.length === 0 ? (
                  [0, 1, 2, 3].map((index) => (
                    <tr key={index} className="border-t border-[#EAECF0]">
                      <td className="px-4 py-5">
                        <div className="h-4 w-40 animate-pulse rounded bg-[#EAECF0]" />
                      </td>
                      <td className="px-4 py-5">
                        <div className="h-4 w-16 animate-pulse rounded bg-[#EAECF0]" />
                      </td>
                      <td className="px-4 py-5">
                        <div className="h-5 w-12 animate-pulse rounded-full bg-[#EAECF0]" />
                      </td>
                      <td className="px-4 py-5">
                        <div className="h-4 w-24 animate-pulse rounded bg-[#EAECF0]" />
                      </td>
                    </tr>
                  ))
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-sm text-[#667085]">
                      {loading ? "Loading competitor intelligence..." : "No selected competitors to display."}
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr
                      key={row.domain}
                      onClick={() => onRunAnalysis(row.domain)}
                      className="cursor-pointer border-t border-[#EAECF0] transition hover:bg-[#F9FAFB]"
                    >
                      <td className="px-4 py-5 align-middle">
                        <div className="truncate font-semibold text-[#344054]">{row.domain}</div>
                      </td>
                      <td className="px-4 py-5 align-middle">
                        <div className="font-medium text-[#344054]">{formatKeywordCount(row.keywords)}</div>
                      </td>
                      <td className="px-4 py-5 align-middle">
                        <span className="inline-flex items-center rounded-full border border-[#9EB5FF] bg-[#F5F8FF] px-2 py-0.5 text-[11px] font-medium text-[#5B7CFF]">
                          {formatOverlap(row.overlap)}
                        </span>
                      </td>
                      <td className="px-4 py-5 align-middle">
                        <div className="font-semibold text-[#344054]">{formatTraffic(row.estimatedTraffic)}</div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={handleImportFile}
        />
        <div className="sr-only">Visible competitors: {visibleCompetitors.join(", ")}</div>
      </div>
    </div>
  );
}
