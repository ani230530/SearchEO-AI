import { useState, useMemo } from "react";
import { format, differenceInDays, parseISO } from "date-fns";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, Download, ArrowLeft, ChevronUp, TrendingUp, TrendingDown, Loader2, ChevronDown, Search, Filter, X } from "lucide-react";
import { formatDateForDisplay, getDateRangeDescription } from "@/lib/gsc/dateUtils";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import TrendsChart, { TrendDataPoint } from "./TrendsChart";

export interface QueryData {
  query: string;
  clicks: number;
  impressions: number;
  position: number;
  ctr: number;
}

interface DateRange {
  startDate: string;
  endDate: string;
  requestedStartDate: string;
  requestedEndDate: string;
  filterType: string;
  daysRequested: number;
  totalResults: number;
}

interface PageQueriesTableProps {
  data: QueryData[];
  pageUrl: string;
  dateRange?: DateRange | null;
  isLoading?: boolean;
  onBack: () => void;
  showTrends?: boolean;
  onShowTrendsChange?: (show: boolean) => void;
  trendsData?: { [query: string]: { [date: string]: { clicks: number; impressions: number; position: number; ctr: number } } };
  isLoadingTrends?: boolean;
}

const PageQueriesTable = ({
  data,
  pageUrl,
  dateRange,
  isLoading = false,
  onBack,
  showTrends = false,
  onShowTrendsChange,
  trendsData,
  isLoadingTrends = false,
}: PageQueriesTableProps) => {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "impressions", desc: true },
  ]);
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState(0);
  const [selectedQueries, setSelectedQueries] = useState<string[]>([]);
  const [selectedMetrics, setSelectedMetrics] = useState<("clicks" | "impressions" | "ctr" | "position")[]>(["clicks", "impressions"]);
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Filter states
  const [clicksRange, setClicksRange] = useState<{ min: string; max: string }>({ min: "", max: "" });
  const [impressionsRange, setImpressionsRange] = useState<{ min: string; max: string }>({ min: "", max: "" });
  const [positionRange, setPositionRange] = useState<{ min: string; max: string }>({ min: "", max: "" });
  const [ctrRange, setCtrRange] = useState<{ min: string; max: string }>({ min: "", max: "" });
  
  const activeFilterCount = [
    clicksRange.min, clicksRange.max,
    impressionsRange.min, impressionsRange.max,
    positionRange.min, positionRange.max,
    ctrRange.min, ctrRange.max
  ].filter(Boolean).length;

  const clearFilters = () => {
    setClicksRange({ min: "", max: "" });
    setImpressionsRange({ min: "", max: "" });
    setPositionRange({ min: "", max: "" });
    setCtrRange({ min: "", max: "" });
  };

  // Export to CSV
  const handleExport = () => {
    const csvContent = [
      ["Query", "Clicks", "Impressions", "Position", "CTR"].join(","),
      ...data.map((row) =>
        [
          `"${row.query}"`,
          row.clicks,
          row.impressions,
          row.position.toFixed(1),
          (row.ctr * 100).toFixed(1) + "%",
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `queries-${pageUrl.replace(/[^a-z0-9]/gi, "-")}-${new Date()
        .toISOString()
        .split("T")[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("CSV file downloaded");
  };

  // Column definitions
  const columns: ColumnDef<QueryData>[] = useMemo(
    () => [
      {
        accessorKey: "query",
        header: "Search Query",
        cell: ({ row }) => (
          <div className="font-semibold text-gray-900 text-sm">{row.getValue("query")}</div>
        ),
      },
      {
        accessorKey: "clicks",
        header: "Clicks",
        cell: ({ row }) => (
          <span className="font-semibold text-gray-900 text-sm">
            {typeof row.getValue("clicks") === 'number' ? row.getValue("clicks").toLocaleString() : row.getValue("clicks")}
          </span>
        ),
      },
      {
        accessorKey: "impressions",
        header: "Impressions",
        cell: ({ row }) => (
          <span className="font-semibold text-gray-900 text-sm">
            {typeof row.getValue("impressions") === 'number' ? row.getValue("impressions").toLocaleString() : row.getValue("impressions")}
          </span>
        ),
      },
      {
        accessorKey: "position",
        header: "Avg Position",
        cell: ({ row }) => {
          const position = row.getValue("position") as number;
          return <span className="text-gray-700 text-sm">{position.toFixed(1)}</span>;
        },
      },
      {
        accessorKey: "ctr",
        header: "CTR",
        cell: ({ row }) => {
          const ctr = row.getValue("ctr") as number;
          return <span className="text-gray-700 text-sm">{(ctr * 100).toFixed(1)}%</span>;
        },
      },
    ],
    []
  );

  // Initialize the table
  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      pagination: {
        pageSize,
        pageIndex: currentPage,
      },
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onPaginationChange: (updater) => {
      const newState =
        typeof updater === "function"
          ? updater({ pageIndex: currentPage, pageSize })
          : updater;
      setCurrentPage(newState.pageIndex);
      setPageSize(newState.pageSize);
    },
  });

  const totalPages = table.getPageCount();
  const startIndex = currentPage * pageSize;
  const endIndex = Math.min(startIndex + pageSize, data.length);

  // Sort handlers
  const handleSort = (columnId: string) => {
    const column = table.getColumn(columnId);
    if (!column) return;
    
    const currentSort = sorting.find(s => s.id === columnId);
    if (!currentSort) {
      setSorting([{ id: columnId, desc: true }]);
    } else if (currentSort.desc) {
      setSorting([{ id: columnId, desc: false }]);
    } else {
      setSorting([]);
    }
  };

  const getSortIcon = (columnId: string) => {
    const column = table.getColumn(columnId);
    if (!column) return null;
    const sorted = sorting.find(s => s.id === columnId);
    if (!sorted) return null;
    return sorted.desc ? (
      <ArrowDown className="w-4 h-4 text-gray-400" />
    ) : (
      <ArrowUp className="w-4 h-4 text-gray-400" />
    );
  };

  // Sort data - MUST be called before any early returns to maintain hook order
  // Sort data - MUST be called before any early returns to maintain hook order
  const sortedData = useMemo(() => {
    // Filter by search query
    let filtered = data;
    if (searchQuery) {
      filtered = data.filter((item) => 
        item.query.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Filter by metrics
    if (activeFilterCount > 0) {
      filtered = filtered.filter(item => {
        // Clicks
        if (clicksRange.min && item.clicks < Number(clicksRange.min)) return false;
        if (clicksRange.max && item.clicks > Number(clicksRange.max)) return false;
        
        // Impressions
        if (impressionsRange.min && item.impressions < Number(impressionsRange.min)) return false;
        if (impressionsRange.max && item.impressions > Number(impressionsRange.max)) return false;

        // Position
        if (positionRange.min && item.position < Number(positionRange.min)) return false;
        if (positionRange.max && item.position > Number(positionRange.max)) return false;

        // CTR
        if (ctrRange.min && (item.ctr * 100) < Number(ctrRange.min)) return false;
        if (ctrRange.max && (item.ctr * 100) > Number(ctrRange.max)) return false;

        return true;
      });
    }

    if (sorting.length === 0) return filtered;
    const sorted = [...filtered];
    const sort = sorting[0];
    sorted.sort((a, b) => {
      const aVal = a[sort.id as keyof QueryData];
      const bVal = b[sort.id as keyof QueryData];
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sort.desc ? bVal - aVal : aVal - bVal;
      }
      return String(aVal).localeCompare(String(bVal)) * (sort.desc ? -1 : 1);
    });
    return sorted;
  }, [data, sorting, searchQuery, clicksRange, impressionsRange, positionRange, ctrRange, activeFilterCount]);

  // Render date range info
  const renderDateRangeInfo = () => {
    if (!dateRange || !dateRange.startDate || !dateRange.endDate) {
      return null;
    }

    try {
      const startDateFormatted = formatDateForDisplay(dateRange.startDate);
      const endDateFormatted = formatDateForDisplay(dateRange.endDate);
      const rangeLabel = getDateRangeDescription(
        dateRange.filterType === "custom" ? "custom" : dateRange.daysRequested
      );
      const actualDaysInRange =
        differenceInDays(parseISO(dateRange.endDate), parseISO(dateRange.startDate)) + 1;

      return (
        <div className="mb-6 p-4 rounded-2xl bg-gray-50/50 border border-gray-200 text-center">
          <div className="text-xs font-light text-gray-600 tracking-tight">
            <span className="font-medium text-gray-900">
              GSC data from {startDateFormatted} to {endDateFormatted}
            </span>
            <span className="ml-2">
              ({rangeLabel} • {actualDaysInRange} days)
            </span>
          </div>
        </div>
      );
    } catch (error) {
      console.error("Error formatting date range info:", error);
      return null;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="h-10 w-40 bg-gray-100 rounded-full animate-pulse" />
          <div className="flex gap-3">
            <div className="h-10 w-32 bg-gray-100 rounded-full animate-pulse" />
            <div className="h-10 w-32 bg-gray-100 rounded-full animate-pulse" />
          </div>
        </div>
        {/* Table skeleton */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200 bg-gray-50/50">
            <div className="grid grid-cols-5 gap-4 px-6 py-3">
              {Array(5).fill(0).map((_, i) => (
                <div key={i} className="h-4 bg-gray-200 rounded animate-pulse" />
              ))}
            </div>
          </div>
          <div className="divide-y divide-gray-100">
            {Array(8).fill(0).map((_, i) => (
              <div key={i} className="grid grid-cols-5 gap-4 px-6 py-4">
                {Array(5).fill(0).map((_, j) => (
                  <div key={j} className="h-5 bg-gray-100 rounded animate-pulse" />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const currentQueries = sortedData.slice(startIndex, endIndex);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="text-center mb-8 space-y-2">
        <button
          onClick={onBack}
          className="h-10 px-5 border border-gray-200 text-gray-700 rounded-full hover:bg-gray-50 text-sm font-light tracking-tight transition-all duration-200 inline-flex items-center gap-2 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Pages
        </button>
        <h2 className="text-4xl font-light text-gray-900 tracking-tight">Page Queries</h2>
        <p className="text-sm font-light text-gray-600 truncate max-w-2xl mx-auto" title={pageUrl}>
          {pageUrl}
        </p>
      </div>

      {/* Controls */}
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center mb-6">
        <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input 
              placeholder="Search queries..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-white border-gray-200 rounded-full text-sm font-light focus-visible:ring-gray-900"
            />
          </div>

          <div className="flex items-center gap-2">
            {activeFilterCount > 0 && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={clearFilters}
                className="text-gray-500 hover:text-gray-900 h-9 hidden sm:flex"
              >
                Clear Filters
                <X className="ml-2 h-3.5 w-3.5" />
              </Button>
            )}

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-2 rounded-full border-gray-200 h-10">
                  <Filter className="h-4 w-4" />
                  Filters
                  {activeFilterCount > 0 && (
                    <Badge variant="secondary" className="ml-1 px-1.5 h-5 min-w-[1.25rem] flex items-center justify-center bg-gray-100 text-gray-900">
                      {activeFilterCount}
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-4" align="end">
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b pb-2">
                    <h4 className="font-medium text-sm">Filter by Metrics</h4>
                    {activeFilterCount > 0 && (
                      <Button variant="ghost" size="sm" onClick={clearFilters} className="h-auto p-0 text-xs text-gray-500 hover:text-gray-900">
                        Reset
                      </Button>
                    )}
                  </div>
                  
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-gray-500">Clicks</Label>
                      <div className="flex items-center gap-2">
                        <Input 
                          placeholder="Min" 
                          type="number" 
                          value={clicksRange.min}
                          onChange={(e) => setClicksRange(prev => ({ ...prev, min: e.target.value }))}
                          className="h-8 text-xs"
                        />
                        <span className="text-gray-300">-</span>
                        <Input 
                          placeholder="Max" 
                          type="number" 
                          value={clicksRange.max}
                          onChange={(e) => setClicksRange(prev => ({ ...prev, max: e.target.value }))}
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-gray-500">Impressions</Label>
                      <div className="flex items-center gap-2">
                        <Input 
                          placeholder="Min" 
                          type="number" 
                          value={impressionsRange.min}
                          onChange={(e) => setImpressionsRange(prev => ({ ...prev, min: e.target.value }))}
                          className="h-8 text-xs"
                        />
                        <span className="text-gray-300">-</span>
                        <Input 
                          placeholder="Max" 
                          type="number" 
                          value={impressionsRange.max}
                          onChange={(e) => setImpressionsRange(prev => ({ ...prev, max: e.target.value }))}
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-gray-500">Avg Position</Label>
                      <div className="flex items-center gap-2">
                        <Input 
                          placeholder="Min (Best: 1)" 
                          type="number" 
                          value={positionRange.min}
                          onChange={(e) => setPositionRange(prev => ({ ...prev, min: e.target.value }))}
                          className="h-8 text-xs"
                        />
                        <span className="text-gray-300">-</span>
                        <Input 
                          placeholder="Max" 
                          type="number" 
                          value={positionRange.max}
                          onChange={(e) => setPositionRange(prev => ({ ...prev, max: e.target.value }))}
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-gray-500">CTR (%)</Label>
                      <div className="flex items-center gap-2">
                        <Input 
                          placeholder="Min %" 
                          type="number" 
                          value={ctrRange.min}
                          onChange={(e) => setCtrRange(prev => ({ ...prev, min: e.target.value }))}
                          className="h-8 text-xs"
                        />
                        <span className="text-gray-300">-</span>
                        <Input 
                          placeholder="Max %" 
                          type="number" 
                          value={ctrRange.max}
                          onChange={(e) => setCtrRange(prev => ({ ...prev, max: e.target.value }))}
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="flex items-center gap-3">
        {onShowTrendsChange && (
          <button
            onClick={() => onShowTrendsChange(!showTrends)}
            className={`h-10 px-5 border rounded-full text-sm font-light tracking-tight transition-all duration-200 inline-flex items-center gap-2 ${
              showTrends
                ? 'border-gray-900 bg-gray-900 text-white hover:bg-gray-800'
                : 'border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {showTrends ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
            {showTrends ? 'Hide Trends' : 'Show Trends'}
          </button>
        )}
        <button
          onClick={handleExport}
          className="h-10 px-5 border border-gray-200 text-gray-700 rounded-full hover:bg-gray-50 text-sm font-light tracking-tight transition-all duration-200 inline-flex items-center gap-2"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      {renderDateRangeInfo()}

      {/* Trends Chart */}
      {showTrends && (
        <div className="space-y-4 mb-8">
          {/* Metrics Selection */}
          <div className="bg-white rounded-2xl border border-gray-200 p-4">
            <div className="flex items-center justify-center gap-4 flex-wrap">
              <span className="text-xs font-light text-gray-600 uppercase tracking-wider">Metrics:</span>
              {(['clicks', 'impressions', 'ctr', 'position'] as const).map((metric) => (
                <label key={metric} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedMetrics.includes(metric)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedMetrics([...selectedMetrics, metric]);
                      } else {
                        setSelectedMetrics(selectedMetrics.filter((m) => m !== metric));
                      }
                    }}
                    className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-900"
                  />
                  <span className="text-xs font-light text-gray-700 capitalize tracking-tight">{metric}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Chart */}
          {isLoadingTrends ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-16 flex items-center justify-center">
              <div className="text-center space-y-3">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-gray-400" />
                <p className="text-sm font-light text-gray-600">Loading trends data...</p>
              </div>
            </div>
          ) : !trendsData ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-16 flex items-center justify-center">
              <div className="text-center space-y-3">
                <TrendingUp className="h-8 w-8 mx-auto text-gray-400" />
                <p className="text-sm font-light text-gray-600">No trends data available</p>
              </div>
            </div>
          ) : (() => {
            // Convert trendsData to chart format
            const chartDataMap = new Map<string, TrendDataPoint>();
            
            // Get selected queries (default to top 5 by clicks if none selected)
            const queriesToShow = selectedQueries.length > 0 
              ? selectedQueries 
              : data.slice(0, 5).map((q) => q.query);

            queriesToShow.forEach((query) => {
              const queryData = trendsData[query];
              if (queryData) {
                Object.entries(queryData).forEach(([date, metrics]) => {
                  const existing = chartDataMap.get(date);
                  if (existing) {
                    existing.clicks = (existing.clicks || 0) + metrics.clicks;
                    existing.impressions = (existing.impressions || 0) + metrics.impressions;
                    existing.ctr = existing.clicks && existing.impressions 
                      ? existing.clicks / existing.impressions 
                      : 0;
                    existing.position = existing.position 
                      ? (existing.position + metrics.position) / 2 
                      : metrics.position;
                  } else {
                    chartDataMap.set(date, {
                      date,
                      clicks: metrics.clicks,
                      impressions: metrics.impressions,
                      ctr: metrics.ctr,
                      position: metrics.position,
                    });
                  }
                });
              }
            });

            const chartData = Array.from(chartDataMap.values()).sort((a, b) => 
              a.date.localeCompare(b.date)
            );

            if (chartData.length === 0) {
              return (
                <div className="bg-white rounded-2xl border border-gray-200 p-12 flex items-center justify-center">
                  <p className="text-sm text-gray-600 font-medium">No trends data available</p>
                </div>
              );
            }

            return (
              <TrendsChart
                data={chartData}
                selectedMetrics={selectedMetrics}
                chartType="line"
                height={350}
              />
            );
          })()}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {/* Table Header */}
        <div className="border-b border-gray-200 bg-gray-50/50">
          <div className="grid grid-cols-5 gap-4 px-6 py-3 text-xs font-medium text-gray-600 uppercase tracking-wider">
            <div 
              className="flex items-center space-x-2 cursor-pointer hover:text-gray-900 transition-colors"
              onClick={() => handleSort('query')}
            >
              <span>Search Query</span>
              {getSortIcon('query')}
            </div>
            <div 
              className="flex items-center space-x-2 cursor-pointer hover:text-gray-900 transition-colors justify-center"
              onClick={() => handleSort('clicks')}
            >
              <span>Clicks</span>
              {getSortIcon('clicks')}
            </div>
            <div 
              className="flex items-center space-x-2 cursor-pointer hover:text-gray-900 transition-colors justify-center"
              onClick={() => handleSort('impressions')}
            >
              <span>Impressions</span>
              {getSortIcon('impressions')}
            </div>
            <div 
              className="flex items-center space-x-2 cursor-pointer hover:text-gray-900 transition-colors justify-center"
              onClick={() => handleSort('position')}
            >
              <span>Avg Position</span>
              {getSortIcon('position')}
            </div>
            <div 
              className="flex items-center space-x-2 cursor-pointer hover:text-gray-900 transition-colors justify-center"
              onClick={() => handleSort('ctr')}
            >
              <span>CTR</span>
              {getSortIcon('ctr')}
            </div>
          </div>
        </div>
        
        {/* Table Body */}
        <div className="divide-y divide-gray-100">
          {currentQueries.length > 0 ? (
            currentQueries.map((query, index) => (
              <div
                key={index}
                className="grid grid-cols-5 gap-4 px-6 py-3.5 hover:bg-gray-50/50 transition-all duration-200 border-b border-gray-50 last:border-b-0"
              >
                <div className="flex items-center gap-2">
                  {showTrends && onShowTrendsChange && (
                    <input
                      type="checkbox"
                      checked={selectedQueries.includes(query.query)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedQueries([...selectedQueries, query.query]);
                        } else {
                          setSelectedQueries(selectedQueries.filter((q) => q !== query.query));
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-900"
                    />
                  )}
                  <div className="font-semibold text-gray-900 text-sm">{query.query}</div>
                </div>
                <div className="flex items-center justify-center">
                  <span className="font-semibold text-gray-900 text-sm">
                    {query.clicks.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-center">
                  <span className="font-semibold text-gray-900 text-sm">
                    {query.impressions.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-center">
                  <span className="text-gray-700 text-sm">
                    {query.position.toFixed(1)}
                  </span>
                </div>
                <div className="flex items-center justify-center">
                  <span className="text-gray-700 text-sm">
                    {(query.ctr * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="grid grid-cols-5 gap-4 px-6 py-12">
              <div className="col-span-5 text-center text-sm text-gray-500">
                No queries found for this page.
              </div>
            </div>
          )}
        </div>
        
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="border-t border-gray-200 px-6 py-4 bg-gray-50/30">
            <div className="flex items-center justify-between">
              {/* Results info */}
              <div className="text-xs font-light text-gray-600 tracking-tight">
                Showing {startIndex + 1} to {Math.min(endIndex, sortedData.length)} of {sortedData.length} queries
              </div>
              
              {/* Pagination controls */}
              <div className="flex items-center space-x-2">
                {/* Previous button */}
                <button
                  onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))}
                  disabled={currentPage === 0}
                  className={`h-8 px-4 rounded-full text-xs font-light tracking-tight transition-all duration-200 inline-flex items-center gap-1.5 ${
                    currentPage === 0
                      ? 'text-gray-400 cursor-not-allowed'
                      : 'text-gray-700 hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  <ChevronDown className="w-3.5 h-3.5 rotate-90" />
                  <span>Previous</span>
                </button>
                
                {/* Page numbers */}
                <div className="flex items-center space-x-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i;
                    } else if (currentPage < 3) {
                      pageNum = i;
                    } else if (currentPage > totalPages - 4) {
                      pageNum = totalPages - 5 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`w-8 h-8 rounded-full text-xs font-light tracking-tight transition-all duration-200 flex items-center justify-center ${
                          currentPage === pageNum
                            ? 'bg-gray-900 text-white'
                            : 'text-gray-700 hover:bg-gray-100 border border-gray-200'
                        }`}
                      >
                        {pageNum + 1}
                      </button>
                    );
                  })}
                </div>
                
                {/* Next button */}
                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages - 1, prev + 1))}
                  disabled={currentPage >= totalPages - 1}
                  className={`h-8 px-4 rounded-full text-xs font-light tracking-tight transition-all duration-200 inline-flex items-center gap-1.5 ${
                    currentPage >= totalPages - 1
                      ? 'text-gray-400 cursor-not-allowed'
                      : 'text-gray-700 hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  <span>Next</span>
                  <ChevronDown className="w-3.5 h-3.5 -rotate-90" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Rows per page control */}
      <div className="flex items-center justify-end gap-2 mt-4">
        <span className="text-xs font-light text-gray-600 tracking-tight">Rows per page</span>
        <select
          value={pageSize}
          onChange={(e) => {
            const newSize = Number(e.target.value);
            setPageSize(newSize);
            setCurrentPage(0);
          }}
          className="h-8 px-3 border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-xs font-light tracking-tight bg-white transition-all duration-200"
        >
          <option value="10">10</option>
          <option value="20">20</option>
          <option value="50">50</option>
          <option value="100">100</option>
        </select>
      </div>
    </div>
  );
};

export default PageQueriesTable;
