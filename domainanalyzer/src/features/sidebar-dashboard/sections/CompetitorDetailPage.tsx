"use client";

import React, { useState, useMemo } from "react";
import {
  ArrowUpDown,
  Download,
  Filter,
  RefreshCw,
  Search,
  Upload,
  ChevronLeft,
} from "lucide-react";

interface KeywordData {
  id: string;
  keyword: string;
  rank: number;
  myRank: string;
  volume: string;
  landingPage: string;
  lastUpdated: string;
}

interface CompetitorDetailPageProps {
  competitorDomain: string;
  keywords?: KeywordData[];
  onBack?: () => void;
}

const CompetitorDetailPage: React.FC<CompetitorDetailPageProps> = ({
  competitorDomain,
  keywords = [
    {
      id: "1",
      keyword: "interpersonal skills",
      rank: "#102",
      myRank: "-",
      volume: "49.2k",
      landingPage: "sheroes.com/articles/interpersonal-skil...",
      lastUpdated: "10/02/26",
    },
    {
      id: "2",
      keyword: "interpersonal skills",
      rank: "#84",
      myRank: "-",
      volume: "49.2k",
      landingPage: "sheroes.com/articles/interpersonal-skil...",
      lastUpdated: "10/02/26",
    },
    {
      id: "3",
      keyword: "solution for dry cough",
      rank: "#244",
      myRank: "-",
      volume: "49.2k",
      landingPage: "sheroes.com/articles/interpersonal-skil...",
      lastUpdated: "10/02/26",
    },
    {
      id: "4",
      keyword: "best romantic novelists",
      rank: "#22",
      myRank: "-",
      volume: "49.2k",
      landingPage: "sheroes.com/articles/interpersonal-skil...",
      lastUpdated: "10/02/26",
    },
    {
      id: "5",
      keyword: "hold hands",
      rank: "#28",
      myRank: "-",
      volume: "49.2k",
      landingPage: "sheroes.com/articles/interpersonal-skil...",
      lastUpdated: "10/02/26",
    },
    {
      id: "6",
      keyword: "women pain in lower right abdomen",
      rank: "#311",
      myRank: "-",
      volume: "49.2k",
      landingPage: "sheroes.com/articles/interpersonal-skil...",
      lastUpdated: "10/02/26",
    },
    {
      id: "7",
      keyword: "right lower abdomen pain female",
      rank: "#123",
      myRank: "-",
      volume: "49.2k",
      landingPage: "sheroes.com/articles/interpersonal-skil...",
      lastUpdated: "10/02/26",
    },
    {
      id: "8",
      keyword: "hypochromic",
      rank: "#47",
      myRank: "-",
      volume: "49.2k",
      landingPage: "sheroes.com/articles/interpersonal-skil...",
      lastUpdated: "10/02/26",
    },
  ],
  onBack,
}) => {
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);

  const filteredAndSortedData = useMemo(() => {
    let result = keywords;

    // Filter by search term
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter((item) =>
        item.keyword.toLowerCase().includes(term)
      );
    }

    // Sort
    if (sortConfig) {
      result = [...result].sort((a, b) => {
        let aValue: any = a[sortConfig.key as keyof KeywordData];
        let bValue: any = b[sortConfig.key as keyof KeywordData];

        if (typeof aValue === "string" && !isNaN(Number(aValue))) {
          aValue = Number(aValue);
        }
        if (typeof bValue === "string" && !isNaN(Number(bValue))) {
          bValue = Number(bValue);
        }

        if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [keywords, searchTerm, sortConfig]);

  const handleExportData = () => {
    const rows = filteredAndSortedData;
    if (!rows.length) {
      alert("No data available to export.");
      return;
    }

    const csvRows = [
      "Keyword,Rank,My Rank,Volume,Landing Page,Last Updated",
      ...rows.map((item) => {
        return `"${item.keyword.replace(/"/g, '""')}","${item.rank}","${item.myRank}","${item.volume}","${item.landingPage.replace(/"/g, '""')}","${item.lastUpdated}"`;
      }),
    ];

    const blob = new Blob([csvRows.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `competitor-keywords-${competitorDomain}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const toggleSort = (key: string) => {
    if (sortConfig?.key === key) {
      setSortConfig({
        key,
        direction: sortConfig.direction === "asc" ? "desc" : "asc",
      });
    } else {
      setSortConfig({ key, direction: "asc" });
    }
  };

  return (
    <div className="competitor-detail-page p-6 bg-slate-50 min-h-screen">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            {onBack && (
              <button
                onClick={onBack}
                className="text-slate-600 hover:text-slate-900 transition"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
            <h1 className="text-2xl font-semibold text-slate-900">
              Competitor Intelligence<span className="text-slate-400"> / </span>
              {competitorDomain}
            </h1>
          </div>
          <p className="flex items-center gap-2 mt-2 text-sm font-light text-gray-600 ml-8">
              Last scanned at {new Date().toLocaleString()}
            </p>
        </div>

        {/* Main Content Card */}
        <div className="overflow-hidden">
          {/* Section Title and Controls */}
          <div className="px-6 py-4 ">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                {competitorDomain}
              </h2>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-4">
                {/* Search and Filter */}
                <div className="flex flex-1 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 shadow-sm">
                  <Search className="h-4 w-4 text-slate-500" />
                  <input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Find Keyword..."
                    className="flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                  />
                </div>
                {/* Action Buttons */}
                <div className="flex gap-2 lg:gap-3">
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                    title="Filter"
                  >
                    <Filter className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                    title="Sort"
                  >
                    <ArrowUpDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 whitespace-nowrap"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Refresh
                  </button>
                  <button
                    type="button"
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
          </div>

          {/* Table */}
         <div className="mt-10 px-4">
  <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.03)]">
    
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        
        {/* HEADER */}
        <thead className="text-left text-xs font-medium tracking-wider text-gray-600 bg-gray-200">
          <tr>
            <th onClick={() => toggleSort("keyword")} className="px-6 py-4 font-medium cursor-pointer hover:bg-slate-200/60 transition">
              Keywords
            </th>
            <th onClick={() => toggleSort("rank")} className="px-6 py-4 font-medium cursor-pointer hover:bg-slate-200/60 transition">
              Rank
            </th>
            <th onClick={() => toggleSort("myRank")} className="px-6 py-4 font-medium cursor-pointer hover:bg-slate-200/60 transition">
              My rank
            </th>
            <th onClick={() => toggleSort("volume")} className="px-6 py-4 font-medium cursor-pointer hover:bg-slate-200/60 transition">
              Volume
            </th>
            <th onClick={() => toggleSort("landingPage")} className="px-6 py-4 font-medium cursor-pointer hover:bg-slate-200/60 transition">
              Landing Page
            </th>
            <th onClick={() => toggleSort("lastUpdated")} className="px-6 py-4 font-medium cursor-pointer hover:bg-slate-200/60 transition">
              Last Updated
            </th>
          </tr>
        </thead>

        {/* BODY */}
        <tbody className="divide-y divide-slate-100">
          {filteredAndSortedData.length > 0 ? (
            filteredAndSortedData.map((item) => (
              <tr key={item.id} className="hover:bg-slate-50 transition">
                
                {/* Keyword */}
                <td className="px-6 py-5 text-slate-900 font-medium">
                  {item.keyword}
                </td>

                {/* Rank */}
                <td className="px-6 py-5 text-slate-700">
                  {item.rank}
                </td>

                {/* My Rank */}
                <td className="px-6 py-5 text-slate-700">
                  {item.myRank}
                </td>

                {/* Volume */}
                <td className="px-6 py-5 text-slate-700">
                  {item.volume}
                </td>

                {/* Landing Page */}
                <td className="px-6 py-5 text-slate-700">
                  <a
                    href={`https://${item.landingPage.split("/")[0]}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline break-all"
                  >
                    {item.landingPage}
                  </a>
                </td>

                {/* Last Updated */}
                <td className="px-6 py-5 text-slate-700">
                  {item.lastUpdated}
                </td>

              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={6} className="px-6 py-16 text-center text-slate-500">
                No keywords found matching your search.
              </td>
            </tr>
          )}
        </tbody>

      </table>
    </div>
  </div>
</div>
          </div>
        </div>
      </div>
   
  );
};

export default CompetitorDetailPage;
