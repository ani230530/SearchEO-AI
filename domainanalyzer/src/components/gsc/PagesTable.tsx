import { useState, useMemo } from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronRight, ChevronUp, ExternalLink, Copy, Check, Search, Download, Loader2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";

export interface PageData {
  page: string;
  clicks: number;
  impressions: number;
  position: number;
  ctr: number;
}

interface PagesTableProps {
  data: PageData[];
  onPageSelect: (pageUrl: string) => void;
  isLoading?: boolean;
  loadingPageUrl?: string | null;
  isQueriesLoading?: boolean;
}

const PagesTable = ({ data, onPageSelect, isLoading = false, loadingPageUrl = null, isQueriesLoading = false }: PagesTableProps) => {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "impressions", desc: true },
  ]);
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState(0);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Copy URL to clipboard
  const handleCopyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      setTimeout(() => setCopiedUrl(null), 2000);
    } catch (err) {
      console.error('Failed to copy URL:', err);
    }
  };

  // Export to CSV
  const handleExport = () => {
    const filteredData = searchQuery
      ? data.filter((page) => page.page.toLowerCase().includes(searchQuery.toLowerCase()))
      : data;

    const csvContent = [
      ["Page URL", "Clicks", "Impressions", "Avg Position", "CTR (%)"].join(","),
      ...filteredData.map((row) =>
        [
          `"${row.page}"`,
          row.clicks,
          row.impressions,
          row.position.toFixed(1),
          (row.ctr * 100).toFixed(1),
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `gsc-pages-${new Date().toISOString().split("T")[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("CSV file downloaded");
  };

  // Column definitions
  const columns: ColumnDef<PageData>[] = useMemo(() => [
    {
      accessorKey: "page",
      header: "Page URL",
      cell: ({ row }) => (
        <div className="font-semibold text-gray-900 text-sm max-w-md truncate" title={row.getValue("page")}>
          {row.getValue("page")}
        </div>
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
  ], []);

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

  // Sort and filter data - must be before early return (Rules of Hooks)
  const sortedData = useMemo(() => {
    // Filter by search query
    let filtered = data;
    if (searchQuery) {
      filtered = data.filter((page) => 
        page.page.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Sort
    if (sorting.length === 0) return filtered;
    const sorted = [...filtered];
    const sort = sorting[0];
    sorted.sort((a, b) => {
      const aVal = a[sort.id as keyof PageData];
      const bVal = b[sort.id as keyof PageData];
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sort.desc ? bVal - aVal : aVal - bVal;
      }
      return String(aVal).localeCompare(String(bVal)) * (sort.desc ? -1 : 1);
    });
    return sorted;
  }, [data, sorting, searchQuery]);

  const currentPages = sortedData.slice(startIndex, endIndex);

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

  if (isLoading) {
    return (
      <TooltipProvider>
        <div className="space-y-4">
          {/* Search skeleton */}
          <div className="flex items-center justify-between gap-4">
            <div className="h-10 w-full max-w-md bg-gray-100 rounded-full animate-pulse" />
            <div className="h-10 w-32 bg-gray-100 rounded-full animate-pulse" />
          </div>
          {/* Table skeleton */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="border-b border-gray-200 bg-gray-50/50">
              <div className="grid grid-cols-6 gap-4 px-6 py-3">
                {Array(6).fill(0).map((_, i) => (
                  <div key={i} className="h-4 bg-gray-200 rounded animate-pulse" />
                ))}
              </div>
            </div>
            <div className="divide-y divide-gray-100">
              {Array(8).fill(0).map((_, i) => (
                <div key={i} className="grid grid-cols-6 gap-4 px-6 py-4">
                  {Array(6).fill(0).map((_, j) => (
                    <div key={j} className="h-5 bg-gray-100 rounded animate-pulse" />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
      {/* Table */}
      <div className="bg-white rounded-3xl border border-gray-200 overflow-hidden shadow-sm">
        {/* Table Header */}
        <div className="border-b border-gray-200 bg-gray-50/50">
          <div className="grid grid-cols-6 gap-4 px-6 py-3 text-xs font-medium text-gray-600 uppercase tracking-wider">
            <div 
              className="flex items-center space-x-2 cursor-pointer hover:text-gray-900 transition-colors"
              onClick={() => handleSort('page')}
            >
              <span>Page URL</span>
              {getSortIcon('page')}
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
            <div className="text-center">Actions</div>
          </div>
        </div>
        
        {/* Table Body */}
        <div className="divide-y divide-gray-100">
          {currentPages.map((page, index) => (
            <div
              key={index}
              className="grid grid-cols-6 gap-4 px-6 py-3.5 hover:bg-gray-50/50 transition-all duration-200 border-b border-gray-50 last:border-b-0"
            >
              <div className="flex items-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <a
                      href={page.page}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-light text-gray-900 text-sm hover:text-blue-600 hover:underline truncate max-w-md inline-flex items-center gap-1.5 tracking-tight"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="truncate">{page.page}</span>
                      <ExternalLink className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                    </a>
                  </TooltipTrigger>
                  <TooltipContent 
                    side="top" 
                    className="max-w-lg break-all"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs">{page.page}</span>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          handleCopyUrl(page.page);
                        }}
                        className="ml-2 p-1 hover:bg-gray-200 rounded transition-colors"
                        title="Copy URL"
                      >
                        {copiedUrl === page.page ? (
                          <Check className="h-3 w-3 text-green-600" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="flex items-center justify-center">
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                  {page.clicks.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-center">
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-100">
                  {page.impressions.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-center">
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-100">
                  {page.position.toFixed(1)}
                </span>
              </div>
              <div className="flex items-center justify-center">
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-100">
                  {(page.ctr * 100).toFixed(1)}%
                </span>
              </div>
              <div className="flex items-center justify-center">
                <button
                  onClick={() => onPageSelect(page.page)}
                  disabled={isQueriesLoading && loadingPageUrl === page.page}
                  className="h-8 px-4 border border-gray-200 text-gray-700 rounded-full hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-light tracking-tight transition-all duration-200 inline-flex items-center gap-1.5"
                >
                  {isQueriesLoading && loadingPageUrl === page.page ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      View Queries
                      <ChevronRight className="h-3.5 w-3.5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
        
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="border-t border-gray-200 px-6 py-4 bg-gray-50/30">
            <div className="flex items-center justify-between">
              {/* Results info */}
              <div className="text-xs font-light text-gray-600 tracking-tight">
                Showing {startIndex + 1} to {Math.min(endIndex, sortedData.length)} of {sortedData.length} page{sortedData.length !== 1 ? 's' : ''}
                {searchQuery && ` (filtered from ${data.length} total)`}
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
                  <ChevronUp className="w-3.5 h-3.5 rotate-90" />
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
                  <ChevronUp className="w-3.5 h-3.5 -rotate-90" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Rows per page control */}
      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-gray-600">Rows per page</span>
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
    </TooltipProvider>
  );
};

export default PagesTable;
