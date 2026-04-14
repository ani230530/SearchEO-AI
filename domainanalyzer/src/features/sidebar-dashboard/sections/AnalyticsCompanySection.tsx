import React, { type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Database,
  Globe,
  ArrowRight,
  Grid3X3,
  List,
  Loader2,
  Plug,
  Plus,
  Search,
  Table,
  TrendingUp,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { IntegrationSkeleton } from '@/features/sidebar-dashboard/components/IntegrationSkeleton';
import { CompanySection } from '@/features/sidebar-dashboard/sections/CompanySection';
import type { CompanySubTabId } from '@/features/sidebar-dashboard/types';
import { getCompetitionBadgeClassName } from '@/features/sidebar-dashboard/utils';
import type { KeywordTableItem } from '@/types';
import type { WordpressIntegration } from '@/types/publish';

type KeywordFilters = {
  competition: string;
  intent: string;
  volume: string;
  trends: string;
  date: string;
};

type GscProperty = {
  siteUrl: string;
  permissionLevel: string;
};

type WpFormState = {
  siteUrl: string;
  username: string;
  password: string;
};

type LoadingStep = {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
};

export interface AnalyticsCompanySectionProps {
  companyDomainLoading: boolean;
  isLoading: boolean;
  showResults: boolean;
  activeCompanySubTab: CompanySubTabId;
  domainContext: string;
  normalizedDomain: string;
  companyDomain: string;
  openIndex: number | null;
  toggleSection: (idx: number) => void;
  displayedDomainContext: string;
  keywordsTableData: KeywordTableItem[];
  showAddKeyword: boolean;
  setShowAddKeyword: Dispatch<SetStateAction<boolean>>;
  newKeyword: string;
  setNewKeyword: Dispatch<SetStateAction<string>>;
  isAddingKeyword: boolean;
  handleAddCustomKeyword: () => Promise<void>;
  searchTerm: string;
  setSearchTerm: Dispatch<SetStateAction<string>>;
  filters: KeywordFilters;
  setFilters: Dispatch<SetStateAction<KeywordFilters>>;
  viewMode: 'table' | 'cards';
  setViewMode: Dispatch<SetStateAction<'table' | 'cards'>>;
  itemsPerPage: number;
  setItemsPerPage: Dispatch<SetStateAction<number>>;
  setCurrentPage: Dispatch<SetStateAction<number>>;
  showCountByCompetition: Record<string, number>;
  setShowCountByCompetition: Dispatch<SetStateAction<Record<string, number>>>;
  sortedKeywords: KeywordTableItem[];
  currentKeywords: KeywordTableItem[];
  currentPage: number;
  totalPages: number;
  handlePageChange: (page: number) => void;
  getPageNumbers: () => Array<number | string>;
  handleSort: (key: keyof KeywordTableItem) => void;
  getSortIcon: (key: keyof KeywordTableItem) => ReactNode;
  gscStatusLoading: boolean;
  gscConnected: boolean;
  handleConnectGsc: () => void | Promise<void>;
  gscEmail: string;
  handleDisconnectGsc: () => void | Promise<void>;
  gscLastSynced: string | null;
  gscSelectedProperty: string;
  setGscSelectedProperty: Dispatch<SetStateAction<string>>;
  fetchGscProperties: () => void | Promise<void>;
  gscLoading: boolean;
  gscProperties: GscProperty[];
  handleSelectProperty: (siteUrl: string) => void | Promise<void>;
  googleAnalyticsId: string;
  setGoogleAnalyticsId: Dispatch<SetStateAction<string>>;
  gaSaving: boolean;
  handleSaveGoogleAnalyticsId: () => Promise<void>;
  hasWordpressIntegration: boolean;
  wpIntegrationLoading: boolean;
  wpForm: WpFormState;
  setWpForm: Dispatch<SetStateAction<WpFormState>>;
  wpIntegration: WordpressIntegration | null;
  handleSaveWordpressIntegration: () => void | Promise<void>;
  wpIntegrationSaving: boolean;
  handleDisconnectWordpress: () => void;
  wpIntegrationDeleting: boolean;
  handleSubmit: (e: FormEvent) => void | Promise<void>;
  domainError: string;
  isSubmitting: boolean;
  loadingSteps: LoadingStep[];
  currentTaskIndex: number;
  handleDomainChange: (value: string) => void;
}

export function AnalyticsCompanySection({
  companyDomainLoading,
  isLoading,
  showResults,
  activeCompanySubTab,
  domainContext,
  normalizedDomain,
  companyDomain,
  openIndex,
  toggleSection,
  displayedDomainContext,
  keywordsTableData,
  showAddKeyword,
  setShowAddKeyword,
  newKeyword,
  setNewKeyword,
  isAddingKeyword,
  handleAddCustomKeyword,
  searchTerm,
  setSearchTerm,
  filters,
  setFilters,
  viewMode,
  setViewMode,
  itemsPerPage,
  setItemsPerPage,
  setCurrentPage,
  showCountByCompetition,
  setShowCountByCompetition,
  sortedKeywords,
  currentKeywords,
  currentPage,
  totalPages,
  handlePageChange,
  getPageNumbers,
  handleSort,
  getSortIcon,
  gscStatusLoading,
  gscConnected,
  handleConnectGsc,
  gscEmail,
  handleDisconnectGsc,
  gscLastSynced,
  gscSelectedProperty,
  setGscSelectedProperty,
  fetchGscProperties,
  gscLoading,
  gscProperties,
  handleSelectProperty,
  googleAnalyticsId,
  setGoogleAnalyticsId,
  gaSaving,
  handleSaveGoogleAnalyticsId,
  hasWordpressIntegration,
  wpIntegrationLoading,
  wpForm,
  setWpForm,
  wpIntegration,
  handleSaveWordpressIntegration,
  wpIntegrationSaving,
  handleDisconnectWordpress,
  wpIntegrationDeleting,
  handleSubmit,
  domainError,
  isSubmitting,
  loadingSteps,
  currentTaskIndex,
  handleDomainChange,
}: AnalyticsCompanySectionProps) {
  const navigate = useNavigate();
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + currentKeywords.length;

  return (
            <CompanySection
              companyDomainLoading={companyDomainLoading}
              isLoading={isLoading}
              showResults={showResults}
              resultsContent={(

              <div className="min-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
                {/* Company Domain Heading */}
                {/* <div className="text-center mb-12 flex flex-col items-center gap-4">
                
                </div> */}

                {/* Company Info Tab Content */}
                {activeCompanySubTab === "company-info" && (
                  <div>
                    {/* Domain Context - Centered and Wide */}
                    {domainContext && (
                      <div className="mb-16">
                        {(() => {
                          const full = domainContext;
                        const iconMap: Record<string, JSX.Element> = {
  "Business Model Analysis": <img
    src="https://res.cloudinary.com/dgfzjdi68/image/upload/v1772020198/Group_1_vvjxuz.svg"
    alt="Target Audience Profiling"
    width={50}
    height={50}
  />,
  "Target Audience Profiling": (
  <img
    src="https://res.cloudinary.com/dgfzjdi68/image/upload/v1772020378/Group_2_t45oi4.svg"
    alt="Target Audience Profiling"
    width={50}
    height={50}
  />
),
  "Value Proposition & Positioning": <img
    src="https://res.cloudinary.com/dgfzjdi68/image/upload/v1772020608/streamline-plump_target-3_zf59wp.svg"
    alt="Target Audience Profiling"
    width={50}
    height={50}
  />,
  "SEO & Content Strategy Insights": <img
    src="https://res.cloudinary.com/dgfzjdi68/image/upload/v1772020608/hugeicons_seo_itfmdp.svg"
    alt="Target Audience Profiling"
    width={50}
    height={50}
  />,
  "Competitive Intelligence": <img
    src="https://res.cloudinary.com/dgfzjdi68/image/upload/v1772020606/Group_ho0bh5.svg"
    alt="Target Audience Profiling"
    width={50}
    height={50}
  />,
  "Market Dynamics": <img
    src="https://res.cloudinary.com/dgfzjdi68/image/upload/v1772020608/market-analysis_svgrepo.com_wjuzuv.svg"
    alt="Target Audience Profiling"
    width={50}
    height={50}
  />,
  "Location-Based SEO Analysis": <img
    src="https://res.cloudinary.com/dgfzjdi68/image/upload/v1772020608/location-med-2_svgrepo.com_y5xuuh.svg"
    alt="Target Audience Profiling"
    width={50}
    height={50}
  />,
  "SEO Opportunity Analysis": <img
    src="https://res.cloudinary.com/dgfzjdi68/image/upload/v1772020609/seo_svgrepo.com_wwqcub.svg"
    alt="Target Audience Profiling"
    width={50}
    height={50}
  />,
};
                          const normalize = (s: string) =>
                            s
                              .replace(/\*\*/g, "")
                              .replace(/^\s*\d+\.\s*/, "")
                              .replace(/[:]+$/, "")
                              .trim()
                              .toUpperCase();
                          const target = Object.keys(iconMap).map((h) => normalize(h));
                          const lines = full.split(/\r?\n/);
                          const contentMap: Record<string, string[]> = {};
                          target.forEach((t) => (contentMap[t] = []));
                          let current: string | null = null;
                          for (const line of lines) {
                            const n = normalize(line);
                            const matched = target.find((t) => n.startsWith(t) || n.includes(t));
                            if (matched) {
                              current = matched;
                              continue;
                            }
                            if (current) {
                              contentMap[current].push(line);
                            }
                          }
                          const sections = Object.keys(iconMap).map((h) => {
                            const key = normalize(h);
                            return {
                              title: h,
                              content: (contentMap[key] || []).join("\n").trim(),
                            };
                          });
                                                    const leftSections = sections.slice(0, 4);
const rightSections = sections.slice(4, 8);
const allSections = [...leftSections, ...rightSections];
                       if (sections.some((s) => s.content.length > 0)) {
  return (
    <div className="p-4 sm:p-6 bg-white rounded-3xl border border-gray-100  overflow-hidden backdrop-blur-sm">
      {/* Master Panel */}
      <div>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-6 border-gray-600/50">
          <div>
            <h1 className="text-3xl font-light tracking-tight text-gray-900">
              Domain Info
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              AI-generated strategic analysis & recommendations
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="inline-flex items-center gap-5 bg-blue-50 border border-blue-200 text-blue-700 px-5 py-3 rounded-xl shadow-sm">
                   <img
  src={`https://img.logo.dev/${normalizedDomain}?token=pk_DTdFFG1JT9WOCjATvZEzIA&size=128`}
  alt="Company logo"
  width={32}
  height={32}
  className="w-8 h-8 rounded-md object-contain bg-white"
  loading="lazy"
/>

                    <span className="font-medium text-lg tracking-tight">
                      {" "}
                      <a
                        href={
                          companyDomain.startsWith("http")
                            ? companyDomain
                            : `https://${companyDomain}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline text-lg"
                      >
                        {companyDomain
                          .replace(/^https?:\/\//, "")
                          .replace(/^www\./, "")}
                      </a>
                    </span>
                  </div>
          </div>
        </div>

        {/* Body */}
 {/* Top Row */}
<div className="flex flex-wrap gap-6 py-8">
  {allSections.slice(0, 4).map((sec, idx) => {
    const isOpen = openIndex === idx;
    const isOtherOpen = openIndex !== null && openIndex !== idx && idx < 4;

    return (
      <div
        key={idx}
        className={`rounded-3xl border overflow-hidden pb-6${
          isOpen ? " bg-blue-50" : " bg-white"
        }`}
        style={{
          flex: isOpen ? "2 1 0%" : isOtherOpen ? "0.9 1 0%" : "1 1 0%",
          minWidth: 0,
        }}
      >
        {/* Header */}
        <button
          onClick={() => toggleSection(idx)}
          className="flex w-full items-center justify-between px-6 py-6 text-left"
        >
          <div className="flex items-center gap-3">
            <div className="text-blue-600">{iconMap[sec.title]}</div>
            <h3 className="text-xl font-light text-gray-900">{sec.title}</h3>
          </div>
          <div style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}>
            <ChevronDown size={22} />
          </div>
        </button>
<div className="mt-2 mb-4 mx-4 border-t border-gray-200 w-[calc(100%-2rem)]" />
        {/* Content */}
        <div className={`px-6 mb-2 text-gray-600 break-words relative ${!isOpen ? "line-clamp-4" : ""}`}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {sec.content}
          </ReactMarkdown>
        </div>
      </div>
    );
  })}
</div>

{/* Bottom Row */}
<div className="flex flex-wrap gap-6 py-8">
  {allSections.slice(4, 8).map((sec, idx) => {
    const realIdx = idx + 4;
    const isOpen = openIndex === realIdx;
    const isOtherOpen = openIndex !== null && openIndex !== realIdx;

    return (
      <div
        key={realIdx}
        className={`rounded-3xl border overflow-hidden pb-6${
          isOpen ? " bg-blue-50" : " bg-white"
        }`}
        style={{
          flex: isOpen ? "2 1 0%" : isOtherOpen ? "0.9 1 0%" : "1 1 0%",
          minWidth: 0,
        }}
      >
        {/* Header */}
        <button
          onClick={() => toggleSection(realIdx)}
          className="flex w-full items-center justify-between px-6 py-6 text-left"
        >
          <div className="flex items-center gap-3">
            <div className="text-blue-600">{iconMap[sec.title]}</div>
            <h3 className="text-xl font-light text-gray-900">{sec.title}</h3>
          </div>
          <div style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }}>
            <ChevronDown size={22} />
          </div>
        </button>
<div className="mt-2 mb-4 mx-4 border-t border-gray-200 w-[calc(100%-2rem)]" />
        {/* Content */}
        <div className={`px-6 mb-2 text-gray-600 break-words relative ${!isOpen ? "line-clamp-4" : ""}`}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {sec.content}
          </ReactMarkdown>
        </div>
      </div>
    );
  })}
</div>
      </div>
    </div>
  );
}
                          return (
                            <div
                              className="relative bg-white rounded-3xl p-8 sm:p-12 border border-gray-100 shadow-sm prose prose-lg prose-gray max-w-none mx-auto
                              prose-headings:font-light prose-headings:text-gray-900 prose-headings:tracking-tight prose-headings:text-center
                              prose-h1:text-3xl prose-h1:mb-6 prose-h1:mt-0
                              prose-h2:text-2xl prose-h2:mb-5 prose-h2:mt-10
                              prose-h3:text-xl prose-h3:mb-4 prose-h3:mt-8
                              prose-p:text-gray-700 prose-p:leading-relaxed prose-p:mb-5 prose-p:text-center
                              prose-strong:text-gray-900 prose-strong:font-medium
                              prose-ul:my-6 prose-ul:pl-8 prose-ul:list-disc
                              prose-ol:my-6 prose-ol:pl-8 prose-ol:list-decimal
                              prose-li:text-gray-700 prose-li:my-3
                              prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline
                              prose-code:text-sm prose-code:bg-gray-100 prose-code:px-2 prose-code:py-1 prose-code:rounded prose-code:font-mono
                              prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-pre:rounded-2xl prose-pre:p-6 prose-pre:overflow-x-auto prose-pre:my-8
                              prose-blockquote:border-l-4 prose-blockquote:border-gray-300 prose-blockquote:pl-6 prose-blockquote:italic prose-blockquote:text-gray-600 prose-blockquote:my-8
                              prose-hr:border-gray-200 prose-hr:my-10
                              prose-table:w-full prose-table:border-collapse prose-table:my-8
                              prose-th:border prose-th:border-gray-300 prose-th:bg-gray-50 prose-th:px-5 prose-th:py-3 prose-th:text-left prose-th:font-medium prose-th:text-gray-900
                              prose-td:border prose-td:border-gray-200 prose-td:px-5 prose-td:py-3 prose-td:text-gray-700
                              prose-img:rounded-2xl prose-img:shadow-md prose-img:my-8 prose-img:mx-auto"
                            >
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {displayedDomainContext}
                              </ReactMarkdown>
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {/* Keywords - Table with Filters and Add Custom Keyword */}
                    {keywordsTableData.length > 0 && (
                      <div className="mt-16">
                        <div className="bg-white rounded-3xl border border-gray-100  overflow-hidden backdrop-blur-sm">
                          <div className="p-4 sm:p-6 border-b border-gray-100 bg-gradient-to-b from-gray-50/50 to-white">
                            <div className="flex items-center justify-between mb-4">
                              <h2 className="text-2xl font-light text-gray-900 tracking-tight">
                                Keywords
                              </h2>
                              <div className="flex items-center space-x-3">
                                <div className="flex items-center space-x-2">
                                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                                  <span className="text-sm font-medium text-gray-600">
                                    {keywordsTableData.length} keywords
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Add Custom Keywords Section */}
                            <div className="mb-6 border-t border-gray-100 pt-6">
                              <button
                                onClick={() =>
                                  setShowAddKeyword(!showAddKeyword)
                                }
                                className="flex items-center text-gray-700 hover:text-gray-900 font-medium text-sm mb-4 px-3 py-2 rounded-full hover:bg-gray-100 transition-all duration-200"
                              >
                                <Plus className="w-4 h-4 mr-2" />
                                Add Custom Keyword
                              </button>

                              {showAddKeyword && (
                                <div className="space-y-3">
                                  <div className="flex items-center space-x-3">
                                    <input
                                      type="text"
                                      value={newKeyword}
                                      onChange={(e) =>
                                        setNewKeyword(e.target.value)
                                      }
                                      placeholder="Enter keyword to analyze"
                                      className="flex-1 px-4 py-2.5 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm bg-gray-50/50 transition-all duration-200"
                                      disabled={isAddingKeyword}
                                    />
                                    <button
                                      onClick={handleAddCustomKeyword}
                                      disabled={
                                        !newKeyword.trim() || isAddingKeyword
                                      }
                                      className="px-5 py-2.5 bg-gray-900 text-white rounded-2xl hover:bg-gray-800 disabled:bg-gray-300 transition-all duration-200 text-sm font-medium shadow hover:shadow-md"
                                    >
                                      {isAddingKeyword ? (
                                        <>
                                          <Loader2 className="w-4 h-4 animate-spin mr-2 inline-block" />
                                          Analyzing...
                                        </>
                                      ) : (
                                        "Add"
                                      )}
                                    </button>
                                    <button
                                      onClick={() => {
                                        setShowAddKeyword(false);
                                        setNewKeyword("");
                                      }}
                                      className="px-5 py-2.5 border border-gray-200 text-gray-700 rounded-2xl hover:bg-gray-50 text-sm font-medium transition-all duration-200"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Search and Filters */}
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
                              <div className="flex items-center space-x-4">
                                <div className="relative">
                                  <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                                  <input
                                    type="text"
                                    placeholder="Search keywords..."
                                    value={searchTerm}
                                    onChange={(e) =>
                                      setSearchTerm(e.target.value)
                                    }
                                    className="pl-10 pr-3 py-2.5 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm bg-gray-50/50 transition-all duration-200 w-72"
                                  />
                                </div>

                                <select
                                  value={filters.competition}
                                  onChange={(e) =>
                                    setFilters((prev) => ({
                                      ...prev,
                                      competition: e.target.value,
                                    }))
                                  }
                                  className="px-3 py-2.5 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm bg-gray-50/50 transition-all duration-200 appearance-none cursor-pointer"
                                >
                                  <option value="">All Competition</option>
                                  <option value="Low">Low</option>
                                  <option value="Medium">Medium</option>
                                  <option value="High">High</option>
                                </select>

                                <select
                                  value={filters.intent}
                                  onChange={(e) =>
                                    setFilters((prev) => ({
                                      ...prev,
                                      intent: e.target.value,
                                    }))
                                  }
                                  className="px-3 py-2.5 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm bg-gray-50/50 transition-all duration-200 appearance-none cursor-pointer"
                                >
                                  <option value="">All Intent</option>
                                  <option value="Informational">
                                    Informational
                                  </option>
                                  <option value="Commercial">Commercial</option>
                                  <option value="Transactional">
                                    Transactional
                                  </option>
                                </select>
                              </div>

                              {/* View Mode Toggle + Rows per page */}
                              <div className="flex items-center gap-3">
                                <div className="flex items-center rounded-2xl p-1">
                                  {/* <button
                                    onClick={() => setViewMode("cards")}
                                    className={`flex items-center space-x-2 px-4 py-2 rounded-xl transition-all duration-200 text-sm font-medium ${
                                      viewMode === "cards"
                                        ? "bg-white text-gray-900 shadow-sm"
                                        : "text-gray-600 hover:text-gray-900"
                                    }`}
                                  >
                                    <Grid3X3 className="w-4 h-4" />
                                    <span>Cards</span>
                                  </button> */}
                                  <div
                                    onClick={() => setViewMode("table")}
                                    className={`flex items-center space-x-2 px-4 py-2 rounded-xl transition-all duration-200 text-sm font-medium ${
                                      viewMode === "table"
                                        ? "bg-white text-gray-900 border"
                                        : "text-gray-600 hover:text-gray-900"
                                    }`}
                                  >
                                    <List className="w-4 h-4" />
                                    <span>Table</span>
                                  </div>
                                </div>

                                {/* Rows per page control */}
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-gray-600">
                                    Rows
                                  </span>
                                  <div className="flex items-center bg-white border border-gray-200 rounded-2xl px-1 shadow-sm">
                                    <button
                                      onClick={() => {
                                        const next = Math.max(
                                          5,
                                          itemsPerPage - 5
                                        );
                                        setItemsPerPage(next);
                                        setCurrentPage(1);
                                      }}
                                      className="px-2 py-1 text-gray-700 hover:text-gray-900 disabled:text-gray-300"
                                      disabled={itemsPerPage <= 5}
                                      aria-label="Decrease rows"
                                    >
                                      âˆ’
                                    </button>
                                    <input
                                      type="number"
                                      min={5}
                                      max={200}
                                      step={5}
                                      value={itemsPerPage}
                                      onChange={(e) => {
                                        const raw = parseInt(
                                          e.target.value,
                                          10
                                        );
                                        if (Number.isNaN(raw)) return;
                                        const clamped = Math.max(
                                          5,
                                          Math.min(200, raw)
                                        );
                                        setItemsPerPage(clamped);
                                        setCurrentPage(1);
                                      }}
                                      className="w-16 text-center px-2 py-1.5 text-sm border-0 focus:outline-none focus:ring-0 bg-transparent"
                                    />
                                    <button
                                      onClick={() => {
                                        const next = Math.min(
                                          200,
                                          itemsPerPage + 5
                                        );
                                        setItemsPerPage(next);
                                        setCurrentPage(1);
                                      }}
                                      className="px-2 py-1 text-gray-700 hover:text-gray-900 disabled:text-gray-300"
                                      disabled={itemsPerPage >= 200}
                                      aria-label="Increase rows"
                                    >
                                      +
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Keyword Display - Table or Cards */}
                          <div className="p-4 sm:p-6">
                            {viewMode === "table" ? (
                              <div className="bg-white rounded-3xl border border-gray-200 overflow-hidden shadow-sm">
                                {/* Table Header */}
                                <div className="bg-gray-50/80 border-b border-gray-200">
                                  <div className="grid grid-cols-9 gap-4 px-6 py-4 text-sm font-semibold text-gray-700">
                                    <div
                                      className="col-span-3 flex items-center space-x-2 cursor-pointer hover:text-gray-900 transition-colors"
                                      onClick={() => handleSort("keyword")}
                                    >
                                      <span>Keyword</span>
                                      {getSortIcon("keyword")}
                                    </div>

                                    <div
                                      className="col-span-1 flex items-center space-x-2 cursor-pointer hover:text-gray-900 transition-colors justify-center"
                                      onClick={() => handleSort("volume")}
                                    >
                                      <span>Volume</span>
                                      {getSortIcon("volume")}
                                    </div>

                                    <div
                                      className="col-span-1 flex items-center space-x-2 cursor-pointer hover:text-gray-900 transition-colors justify-center"
                                      onClick={() => handleSort("competition")}
                                    >
                                      <span>Competition</span>
                                      {getSortIcon("competition")}
                                    </div>

                                    <div
                                      className="col-span-1 flex items-center space-x-2 cursor-pointer hover:text-gray-900 transition-colors justify-center"
                                      onClick={() => handleSort("organic")}
                                    >
                                      <span>Organic</span>
                                      {getSortIcon("organic")}
                                    </div>

                                    <div
                                      className="col-span-1 flex items-center space-x-2 cursor-pointer hover:text-gray-900 transition-colors justify-center"
                                      onClick={() => handleSort("intent")}
                                    >
                                      <span>Intent</span>
                                      {getSortIcon("intent")}
                                    </div>

                                    <div
                                      className="col-span-2 flex items-center space-x-2 cursor-pointer hover:text-gray-900 transition-colors justify-center"
                                      onClick={() => handleSort("trend")}
                                    >
                                      <span>Trend</span>
                                      {getSortIcon("trend")}
                                    </div>
                                  </div>
                                </div>

                                {/* Table Body */}
                                <div className="divide-y divide-gray-100">
                                  {currentKeywords.map((keyword) => (
                                    <div
                                      key={keyword.id}
                                      className="grid grid-cols-9 gap-4 px-6 py-4 hover:bg-gray-50/80 transition-all duration-200"
                                    >
                                      {/* Keyword Column */}
                                      <div className="col-span-3 flex items-center space-x-3">
                                        <div>
                                          <div className="font-medium text-gray-900 text-sm flex items-center space-x-2">
                                            <span>{keyword.keyword.charAt(0).toUpperCase() + keyword.keyword.slice(1)}</span>
                                            {keyword.isCustom && (
                                              <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full text-xs font-semibold">
                                                Custom
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      </div>

                                      {/* Volume Column */}
                                      <div className="col-span-1 flex items-center justify-center">
                                        <span className="font-medium text-gray-900 text-sm">
                                          {keyword.volume >= 1000
                                            ? `${(
                                                keyword.volume / 1000
                                              ).toFixed(1)}K`
                                            : keyword.volume.toLocaleString()}
                                        </span>
                                      </div>

                                      {/* Competition Column */}
                                      <div className="col-span-1 flex items-center justify-center">
                                        <span
                                          className={getCompetitionBadgeClassName(
                                            keyword.competition
                                          )}
                                        >
                                          {keyword.competition}
                                        </span>
                                      </div>

                                      {/* Organic Column */}
                                      <div className="col-span-1 flex items-center justify-center">
                                        <span className="text-gray-700 text-sm">
                                          {keyword.organic.toLocaleString()}
                                        </span>
                                      </div>

                                      {/* Intent Column */}
                                      <div className="col-span-1 flex items-center justify-center">
                                        <span
                                          className={`px-2 py-1 rounded-full text-sm font-medium `}
                                        >
                                          {keyword.intent}
                                        </span>
                                      </div>

                                      {/* Trend Column */}
                                      <div className="col-span-2 flex items-center justify-center">
                                        <div className="flex items-center space-x-1">
                                          <TrendingUp
                                            className={`w-4 h-4 ${
                                              keyword.trend === "Rising"
                                                ? "text-green-500"
                                                : keyword.trend === "Falling"
                                                ? "text-red-500"
                                                : "text-gray-500"
                                            }`}
                                          />
                                          <span className="text-sm text-gray-700">
                                            {keyword.trend}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>

                                {/* Pagination */}
                                {totalPages > 1 && (
                                  <div className="bg-gray-50/50 border-t border-gray-200 px-6 py-4">
                                    <div className="flex items-center justify-between">
                                      {/* Results info */}
                                      <div className="text-sm text-gray-600">
                                        Showing {startIndex + 1} to{" "}
                                        {Math.min(
                                          endIndex,
                                          sortedKeywords.length
                                        )}{" "}
                                        of {sortedKeywords.length} keywords
                                      </div>

                                      {/* Pagination controls */}
                                      <div className="flex items-center space-x-2">
                                        {/* Previous button */}
                                        <button
                                          onClick={() =>
                                            handlePageChange(currentPage - 1)
                                          }
                                          disabled={currentPage === 1}
                                          className={`flex items-center space-x-1 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                                            currentPage === 1
                                              ? "text-gray-400 cursor-not-allowed"
                                              : "text-gray-700 hover:text-gray-900 hover:bg-gray-100"
                                          }`}
                                        >
                                          <ChevronDown className="w-4 h-4 rotate-90" />
                                          <span>Previous</span>
                                        </button>

                                        {/* Page numbers */}
                                        <div className="flex items-center space-x-1">
                                          {getPageNumbers().map(
                                            (page, index) => (
                                              <React.Fragment key={index}>
                                                {page === "..." ? (
                                                  <span className="px-2 py-2 text-gray-400">
                                                    ...
                                                  </span>
                                                ) : (
                                                  <button
                                                    onClick={() =>
                                                      handlePageChange(
                                                        page as number
                                                      )
                                                    }
                                                    className={`w-8 h-8 rounded-xl text-sm font-medium transition-all duration-200 flex items-center justify-center ${
                                                      currentPage === page
                                                        ? "bg-gray-900 text-white shadow-sm"
                                                        : "text-gray-700 hover:text-gray-900 hover:bg-gray-100"
                                                    }`}
                                                  >
                                                    {page}
                                                  </button>
                                                )}
                                              </React.Fragment>
                                            )
                                          )}
                                        </div>

                                        {/* Next button */}
                                        <button
                                          onClick={() =>
                                            handlePageChange(currentPage + 1)
                                          }
                                          disabled={currentPage >= totalPages}
                                          className={`flex items-center space-x-1 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                                            currentPage >= totalPages
                                              ? "text-gray-400 cursor-not-allowed"
                                              : "text-gray-700 hover:text-gray-900 hover:bg-gray-100"
                                          }`}
                                        >
                                          <span>Next</span>
                                          <ChevronDown className="w-4 h-4 -rotate-90" />
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {/* Empty state */}
                                {sortedKeywords.length === 0 && (
                                  <div className="py-12 text-center">
                                    <p className="text-gray-500">
                                      No keywords match your current filters.
                                    </p>
                                  </div>
                                )}
                              </div>
                            ) : (
                              (() => {
                                const clusterTypes: Array<
                                  "Low" | "Medium" | "High"
                                > = ["Low", "Medium", "High"];
                                const initialShowCount = 8;

                                return (
                                  <div className="space-y-8">
                                    {clusterTypes.map((competition) => {
                                      const clusterKeywordsAll =
                                        sortedKeywords.filter(
                                          (k) => k.competition === competition
                                        );
                                      if (clusterKeywordsAll.length === 0)
                                        return null;

                                      const showCount =
                                        showCountByCompetition[competition] ||
                                        initialShowCount;
                                      const clusterKeywords =
                                        clusterKeywordsAll.slice(0, showCount);

                                      return (
                                        <div
                                          key={competition}
                                          className="space-y-4"
                                        >
                                          {/* Cluster Header */}
                                          <div className="flex items-center justify-between">
                                            <div className="flex items-center space-x-3">
                                              <h3 className="text-xl font-semibold text-gray-900 tracking-tight">
                                                {competition} Competition
                                              </h3>
                                              <div
                                                className={`${
                                                  competition === "High"
                                                    ? "bg-red-100 text-red-800 border border-red-200"
                                                    : competition === "Medium"
                                                    ? "bg-yellow-100 text-yellow-800 border border-yellow-200"
                                                    : "bg-green-100 text-green-800 border border-green-200"
                                                } px-3 py-1.5 rounded-full text-xs font-medium`}
                                              >
                                                {clusterKeywordsAll.length}{" "}
                                                keywords
                                              </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                              {showCount > initialShowCount && (
                                                <button
                                                  onClick={() =>
                                                    setShowCountByCompetition(
                                                      (prev) => ({
                                                        ...prev,
                                                        [competition]:
                                                          initialShowCount,
                                                      })
                                                    )
                                                  }
                                                  className="px-3 py-1.5 text-xs border border-gray-200 rounded-2xl hover:bg-gray-50 text-gray-700"
                                                >
                                                  Show less
                                                </button>
                                              )}
                                              {showCount <
                                                clusterKeywordsAll.length && (
                                                <button
                                                  onClick={() =>
                                                    setShowCountByCompetition(
                                                      (prev) => ({
                                                        ...prev,
                                                        [competition]: Math.min(
                                                          clusterKeywordsAll.length,
                                                          showCount +
                                                            initialShowCount
                                                        ),
                                                      })
                                                    )
                                                  }
                                                  className="px-3 py-1.5 text-xs border border-gray-200 rounded-2xl hover:bg-gray-50 text-gray-700"
                                                >
                                                  Show more
                                                </button>
                                              )}
                                            </div>
                                          </div>

                                          {/* Keywords Grid */}
                                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                            {clusterKeywords.map((keyword) => (
                                              <div
                                                key={keyword.id}
                                                className={`relative overflow-hidden rounded-3xl border-2 min-h-[160px] flex flex-col transition-all duration-300 ease-out ${
                                                  keyword.isCustom
                                                    ? "border-purple-200 bg-gradient-to-br from-purple-50 to-purple-100/50 hover:border-purple-300 hover:shadow"
                                                    : "border-gray-200 bg-white hover:border-gray-300 hover:shadow"
                                                }`}
                                              >
                                                {keyword.isCustom && (
                                                  <div className="absolute top-3 left-3">
                                                    <div className="bg-purple-500 text-white px-2.5 py-1 rounded-full text-[10px] font-semibold">
                                                      Custom
                                                    </div>
                                                  </div>
                                                )}

                                                <div className="p-5 pt-10 flex-1 flex flex-col">
                                                  <h4 className="text-base font-semibold mb-3 leading-tight min-h-[40px] text-gray-900">
                                                    {keyword.keyword}
                                                  </h4>

                                                  <div className="space-y-2">
                                                    <div className="flex items-center justify-between">
                                                      <div className="flex items-center space-x-2">
                                                        <TrendingUp
                                                          className="text-gray-500"
                                                          style={{
                                                            width: 16,
                                                            height: 16,
                                                          }}
                                                        />
                                                        <span className="text-xs font-medium text-gray-600">
                                                          Volume
                                                        </span>
                                                      </div>
                                                      <span className="text-sm font-bold text-gray-900">
                                                        {keyword.volume >= 1000
                                                          ? `${(
                                                              keyword.volume /
                                                              1000
                                                            ).toFixed(1)}K`
                                                          : keyword.volume.toLocaleString()}
                                                      </span>
                                                    </div>
                                                  </div>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              })()
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Action Buttons */}
                    {/* <div className="flex items-center justify-center gap-4 mt-12">
                      {createdDomainId && (
                        <button
                          onClick={() => {
                            const maskedId = maskDomainId(createdDomainId);
                            navigate(`/dashboard/${maskedId}`);
                          }}
                          className="inline-flex items-center gap-2 px-6 py-3 bg-black text-white rounded-full text-sm font-medium hover:bg-gray-600  disabled:opacity-60 transition"
                        >
                          View Full Dashboard
                        </button>
                      )}
                    </div> */}
                  </div>
                )}

                {/* Integration Tab Content */}
                {activeCompanySubTab === 'integration' && (
                  <div className="min-w-6xl mx-auto space-y-6">
                    {gscStatusLoading ? (
                      <IntegrationSkeleton />
                    ) : !gscConnected ? (
                      <div className="bg-white rounded-3xl p-12 border border-gray-100 shadow-sm text-center">
                        <div className="w-16 h-16 mx-auto mb-6 bg-gray-100 rounded-full flex items-center justify-center ">
                          <Plug className="h-8 w-8 text-gray-400" />
                        </div>
                        <h2 className="text-2xl font-light text-black tracking-tight mb-3 ">
                          Google Search Console
                        </h2>
                        <p className="text-base font-light text-gray-600 mb-8">
                          Connect your Google Search Console account to view
                          search performance data
                        </p>
                        <button
                          onClick={handleConnectGsc}
                          className="px-8 py-3 inline-flex items-center gap-2 px-6 py-3 bg-black text-white rounded-full text-sm font-medium hover:bg-gray-600  disabled:opacity-60 transitions"
                        >
                          Connect Google Search Console
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white rounded-3xl p-8 border border-gray-100 ">
                          <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                              <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center">
                                <CheckCircle className="h-6 w-6 text-green-600" />
                              </div>
                              <div>
                                <h3 className="text-xl font-light text-black tracking-tight">
                                  Connected
                                </h3>
                                <p className="text-sm font-light text-gray-600">
                                  {gscEmail}
                                </p>
                              </div>
                            </div>
                            <button
                              onClick={handleDisconnectGsc}
                              className="px-4 py-2 text-sm font-light text-red-600 hover:text-red-700 transition-colors"
                            >
                              Disconnect
                            </button>
                          </div>
                          <p className="text-sm text-neutral-400 font-light max-w-xl mb-2">
                             Connect Google Search Console to analyze your content and SEO automatically.
                            </p>
                          <div className="relative w-full aspect-video rounded-2xl overflow-hidden border border-gray-100 mb-4">
    <iframe
      className="w-full h-full"
      src="https://www.youtube.com/embed/JnX6_YAflt8?si=EvfXp_9hEyyCSI0m"
      title="Google Search Console Tutorial"
      frameBorder="0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
    ></iframe>
  </div>
                          {gscLastSynced && (
                            <p className="text-xs font-light text-gray-500 ">
                              Last synced:{" "}
                              {new Date(gscLastSynced).toLocaleString()}
                            </p>
                          )}
                        </div>

                        {!gscSelectedProperty ? (
                          <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                            <h3 className="text-xl font-light text-black tracking-tight mb-4">
                              Select Property
                            </h3>
                            <p className="text-sm font-light text-gray-600 mb-6">
                              Choose which Search Console property to use
                            </p>
                            {gscLoading ? (
                              <div className="text-center py-8">
                                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                                <p className="text-sm font-light text-gray-600 mt-4">
                                  Loading properties...
                                </p>
                              </div>
                            ) : gscProperties.length > 0 ? (
                              <div className="space-y-3">
                                {gscProperties.map((property) => (
                                  <button
                                    key={property.siteUrl}
                                    onClick={() =>
                                      handleSelectProperty(property.siteUrl)
                                    }
                                    className="w-full text-left p-4 rounded-2xl border border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-all duration-200"
                                  >
                                    <div className="flex items-center justify-between ">
                                      <div>
                                        <p className="text-base font-light text-black">
                                          {property.siteUrl}
                                        </p>
                                        <p className="text-xs font-light text-gray-500 mt-1">
                                          {property.permissionLevel}
                                        </p>
                                      </div>
                                      <Globe className="h-5 w-5 text-gray-400" />
                                    </div>
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <div className="text-center py-8">
                                <p className="text-sm font-light text-gray-600">
                                  No properties found. Make sure your site is
                                  verified in Google Search Console.
                                </p>
                                <button
                                  onClick={fetchGscProperties}
                                  className="mt-4 px-4 py-2 text-sm font-light text-blue-600 hover:text-blue-700"
                                >
                                  Refresh Properties
                                </button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="bg-white rounded-3xl p-8 border border-gray-100 ">
                            <div className="flex items-center justify-between mb-6">
                              <div>
                              <div className="flex items-center gap-3">
                                <img src="/public/gsc-icon.png" alt="" srcset="" />
                                <h3 className="text-xl font-light text-black tracking-tight mb-1">
                                  Selected Property
                                </h3>
                                </div>
                                <p className="text-sm font-light text-gray-600">
                                  {gscSelectedProperty}
                                </p>
                              </div>
                              <button
                                onClick={() => {
                                  setGscSelectedProperty("");
                                  fetchGscProperties();
                                }}
                                className="px-4 py-2 text-sm font-light text-gray-600 hover:text-gray-900"
                              >
                                Change
                              </button>
                            </div>
                            <p className="text-sm text-neutral-400 font-light max-w-xl mb-2">
                              Search Console data will be available for this
                              property, and the same Google connection now
                              includes Analytics read access for reporting.
                            </p>
                              <div className="relative w-full aspect-video rounded-2xl overflow-hidden border border-gray-100 mb-4">
    <iframe
      className="w-full h-full"
      src="https://www.youtube.com/embed/JnX6_YAflt8?si=EvfXp_9hEyyCSI0m"
      title="Google Search Console Tutorial"
      frameBorder="0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
    ></iframe>
  </div>
                          </div>
                        )}

                        {/* Google Analytics Section */}
                        <div className="bg-white rounded-3xl p-8 border border-gray-100 ">

  {/* Header */}
  <div>
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
      <img src="icons8-google-analytics-24.png" alt="" srcset="" />
      <h3 className="text-2xl font-light text-black tracking-tight">
        Google Analytics
      </h3>
      </div>
      {googleAnalyticsId && (
        <div className="flex items-center gap-1.5 bg-green-50 text-green-700 px-3 py-1 rounded-full text-[10px] font-medium border border-green-100 uppercase tracking-wider">
          Connected
        </div>
      )}
    </div>

    <p className="text-sm text-neutral-400 font-light max-w-xl mb-2">
      Connect Google for Search Console, then add your GA4 ID for reporting.
    </p>
  </div>

  {/* ✅ Bigger Video */}
  <div className="w-full aspect-video rounded-2xl overflow-hidden border border-gray-100">
    <iframe
      className="w-full h-full"
      src="https://www.youtube.com/embed/pJxNPfwQfHs"
      title="Google Search Console Tutorial"
      frameBorder="0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
    ></iframe>
  </div>

  {/* ✅ Input + Button Row */}
  <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center py-3">

    {/* Input */}
    <div className="relative flex-1 group">
      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 group-focus-within:text-black transition">
        <Database className="h-4 w-4" />
      </div>

      <input
        type="text"
        value={googleAnalyticsId}
        onChange={(e) => setGoogleAnalyticsId(e.target.value)}
        placeholder="GA4 Property ID (e.g. 123456789)"
        className="w-full h-12 pl-11 pr-4 text-sm rounded-md border border-neutral-200 bg-neutral-50 focus:bg-white focus:border-black/20 focus:ring-4 focus:ring-black/5 outline-none transition-all placeholder:text-neutral-400 font-light"
      />
    </div>

    {/* Button */}
    <button
      onClick={handleSaveGoogleAnalyticsId}
      disabled={gaSaving || !googleAnalyticsId}
      className={cn(
        "h-12 px-6 whitespace-nowrap inline-flex items-center justify-center gap-2 rounded-md bg-[#2D4059] text-md font-medium transition",
        googleAnalyticsId && !gaSaving
          ? "text-white shadow-md hover:shadow-lg active:scale-95"
          : "bg-neutral-100 text-neutral-400 cursor-not-allowed"
      )}
    >
      {gaSaving ? (
        <>
          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          Syncing
        </>
      ) : (
        "Update Analytics ID"
      )}
      <ArrowRight />
    </button>

  </div>
</div>
                         <div className="bg-white rounded-3xl p-8 border border-gray-100 ">
                      <div className="flex flex-wrap items-center justify-between gap-4 ">
                        <div>
                          <div className="flex items-center gap-3">
                          <img src="/public/skill-icons_wordpress.png" alt="" srcset="" />
                          <h3 className="text-2xl font-light text-black tracking-tight">
                            WordPress Publishing
                          </h3></div>
                          <p className="text-sm text-neutral-400 font-light max-w-xl mb-2">
                            Securely store credentials to auto-publish generated content
                          </p>
                        </div>
                        <div
                          className={`flex items-center gap-1.5 bg-green-50 text-green-700 px-3 py-1 rounded-full text-[10px] font-medium border border-green-100 uppercase tracking-wider ${
                            hasWordpressIntegration ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {hasWordpressIntegration ? 'Connected' : 'Not Connected'}
                        </div>
                      </div>

                      {wpIntegrationLoading ? (
                        <div className="animate-pulse space-y-3">
                          <div className="h-4 bg-gray-100 rounded"></div>
                          <div className="h-4 bg-gray-100 rounded"></div>
                          <div className="h-4 bg-gray-100 rounded w-1/2"></div>
                        </div>
                      ) : (
                        
  <div>
                           <div className="relative w-full aspect-video rounded-2xl overflow-hidden border border-gray-100 mb-4">
    <iframe
      className="w-full h-full"
      src="https://www.youtube.com/embed/pJxNPfwQfHs?si=DmLV-gdgqw9TJUdZ"
      title="Google Search Console Tutorial"
      frameBorder="0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
    ></iframe>
  </div>
  <button
    onClick={() => navigate('/wordpress-connection')}
    className={cn(
      "h-12 px-6 whitespace-nowrap inline-flex items-center justify-center gap-2 rounded-md bg-[#2D4059] text-md font-medium transition text-white shadow-md hover:shadow-lg active:scale-95",
      
    )}
  >Wordpress
  <ArrowRight />
  </button>
  </div>
                      )}
                    </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            
              )}
              loadingContent={(

              <div className="min-h-screen bg-white flex items-center justify-center px-4">
                <div className="max-w-2xl w-full">
                  <div className="text-center mb-12">
                    <div className="w-16 h-16 mx-auto mb-6 bg-gray-100 rounded-full flex items-center justify-center">
                      <svg
                        className="w-8 h-8 text-gray-600 animate-pulse"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M13 10V3L4 14h7v7l9-11h-7z"
                        />
                      </svg>
                    </div>
                    <h2 className="text-3xl font-semibold tracking-tight text-gray-900 mb-3">
                      Domain Setup in Progress
                    </h2>
                    <p className="text-lg text-gray-600 leading-relaxed">
                      Setting up your domain for analysis
                    </p>
                  </div>

                  {/* Domain Info */}
                  <div className="mb-8 p-6 bg-blue-50 rounded-2xl border border-blue-100">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-base font-medium text-blue-900">
                        Target Domain: {companyDomain}
                      </span>
                    </div>
                  </div>

                  {/* Apple-style Carousel */}
                  <div className="relative h-24 mb-8 overflow-hidden">
                    <div
                      className="flex transition-transform duration-1000 ease-out"
                      style={{
                        transform: `translateX(-${currentTaskIndex * 100}%)`,
                      }}
                    >
                      {loadingSteps.map((task, index) => (
                        <div
                          key={index}
                          className="w-full flex-shrink-0 text-center"
                        >
                          <h3 className="text-xl font-medium text-gray-900 mb-2 transition-opacity duration-700">
                            {task.name}
                          </h3>
                          <p className="text-base text-gray-600 transition-opacity duration-700">
                            {task.status === "completed"
                              ? "Completed successfully"
                              : task.status === "running"
                              ? "In progress..."
                              : "Pending"}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Apple-style Progress Dots */}
                  <div className="flex justify-center space-x-3 mb-8">
                    {loadingSteps.map((task, index) => (
                      <div
                        key={index}
                        className={`w-3 h-3 rounded-full transition-all duration-700 ease-out ${
                          task.status === "completed"
                            ? "bg-gray-800 scale-110 shadow-md"
                            : index === currentTaskIndex
                            ? "bg-gray-600 scale-125 shadow-lg"
                            : "bg-gray-300"
                        }`}
                      ></div>
                    ))}
                  </div>

                  <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100">
                    <div className="flex items-center text-gray-600">
                      <svg
                        className="w-6 h-6 mr-3 text-gray-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                        />
                      </svg>
                      <span className="text-base font-medium">
                        Your data is being securely processed and encrypted
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            
              )}
              setupContent={(

              <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
                {/* Apple-like Hero */}
                <div className="text-center mb-8 sm:mb-10">
                  <h1 className="text-4xl sm:text-5xl font-thin text-black leading-tight tracking-tight">
                    Company Domain
                  </h1>
                  <p className="text-base sm:text-lg text-gray-600 font-light mt-3">
                    Enter your company domain name
                  </p>
                </div>

                <div className="rounded-[28px] border border-gray-100 bg-white p-6 sm:p-8 shadow-sm">
                  <form
                    onSubmit={handleSubmit}
                    className="space-y-5 sm:space-y-6"
                  >
                    {/* Domain Input */}
                    <div className="space-y-3">
                      <label className="block text-base font-light text-black">
                        Domain
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={companyDomain}
                          onChange={(e) => handleDomainChange(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); } }}
                          placeholder="example.org or brand.co.uk"
                          className={`w-full px-4 py-3 text-base font-light rounded-2xl border ${
                            domainError ? "border-red-300" : "border-gray-200"
                          } bg-gray-50 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all`}
                          required
                          disabled={isSubmitting}
                        />
                      </div>
                      {domainError && (
                        <p className="text-red-500 text-sm font-light mt-2">
                          {domainError}
                        </p>
                      )}
                    </div>

                    {/* Submit Button */}
                    <div className="pt-3 sm:pt-4">
                      <button
                        type="submit"
                        disabled={
                          !companyDomain || !!domainError || isSubmitting
                        }
                        className={`w-full py-3 px-5 bg-black text-white text-base font-medium rounded-full hover:bg-black/90 focus:outline-none focus:ring-4 focus:ring-black/10 transition-all shadow ${
                          !companyDomain || domainError || isSubmitting
                            ? "opacity-60 cursor-not-allowed hover:-translate-y-0"
                            : ""
                        }`}
                      >
                        {isSubmitting && (
                          <span className="inline-flex items-center">
                            <svg
                              className="animate-spin h-5 w-5 mr-2 text-white"
                              xmlns="http://www.w3.org/2000/svg"
                              fill="none"
                              viewBox="0 0 24 24"
                            >
                              <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                              ></circle>
                              <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8v8z"
                              ></path>
                            </svg>
                            Starting...
                          </span>
                        )}
                        {!isSubmitting && "Start Analysis"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            
              )}
            />
  );
}

