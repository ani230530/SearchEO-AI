"use client";
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronRight,
  Plus,
  Trash2,
  Edit,
  Ellipsis,
  AlertCircle,
  Loader2,
  Sparkles,
  Layout,
  List,
  Network,
  LayoutDashboard,
  Building,
  BriefcaseBusiness,
  Megaphone,
  Send,
  ClipboardList,
  FileChartColumnIncreasing,
  Settings,
  Star,
  SquarePen,
  User,
  Grid3X3,
  ChevronLeft,
  ChevronDown,
  ChartNoAxesCombined,
  Check,
  FileText,
  X,
  ListCheck,
  LogOut,
  ChevronUp,
  ArrowUpDown,
  TrendingUp,
  Menu,
  Eye,
  ExternalLink,
  Pencil,
  RefreshCw,
  ArrowRight,
  Table
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { usePublishStatus } from '@/hooks/usePublishStatus';
import { GenerationPageStatus, KeywordTableItem } from '@/types';
import { WordpressIntegration } from '@/types/publish';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@radix-ui/react-accordion';
import TrendsChart, { TrendDataPoint } from "@/components/gsc/TrendsChart";
import { DashboardContentRouter } from "@/features/sidebar-dashboard/components/DashboardContentRouter";
import { DashboardHeader } from "@/features/sidebar-dashboard/components/DashboardHeader";
import { DashboardSidebar } from "@/features/sidebar-dashboard/components/DashboardSidebar";
import { AnalyticsCompanySection } from "@/features/sidebar-dashboard/sections/AnalyticsCompanySection";
import { DomainInfoContent } from "@/features/sidebar-dashboard/sections/DomainInfoContent";
import { DomainInfoEmpty } from "@/features/sidebar-dashboard/sections/DomainInfoEmpty";
import { ProjectsSection } from "@/features/sidebar-dashboard/sections/ProjectsSection";
import WorksheetDraftOverlay from "@/features/campaign/WorksheetDraftOverlay";
import { DASHBOARD_TABS } from "@/features/sidebar-dashboard/constants";
import CompetitorPage from '@/features/sidebar-dashboard/sections/CompetitorPage';

import type {
  CompanySubTabId,
  DashboardContentRouterProps,
  DashboardSidebarTab,
  DomainCheckResult,
  GscSubTabId,
  TabId,
} from "@/features/sidebar-dashboard/types";
import {
  buildKeywordTableData,
  buildPageNumbers,
  extractOrgName,
  filterKeywordTableData,
  getCompetitionBadgeClassName,
  getStoredActiveTab,
  normalizeDomain,
  normalizeTerm,
  paginateItems,
  parseDashboardSearchState,
  sortKeywordTableData,
  summarizeDomainContext,
} from "@/features/sidebar-dashboard/utils";
import type { ParsedDomainInput } from "@/lib/domainValidation";
import { validateDomainInput } from "@/lib/domainValidation";
import { useCompetitorAnalysis } from "@/features/ai-results/queries";



const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3002";
const WORKSHEET_TARGET_KEY = 'ai-results/pending-worksheet-target';

const formatDashboardCount = (value: number | null | undefined) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "—";
  }

  return Math.round(value).toLocaleString();
};

const formatDashboardPercent = (value: number | null | undefined) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "—";
  }

  const normalized = value > 1 ? value : value * 100;
  return `${Math.round(normalized)}%`;
};

const formatDashboardTraffic = (value: number | null | undefined) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "—";
  }

  const normalized = value > 0 && value <= 1 ? value * 1000000 : value;
  return Math.round(normalized).toLocaleString();
};




const SidebarDashboard = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const searchState = useMemo(
    () => parseDashboardSearchState(location.search),
    [location.search]
  );
const [activeTab, setActiveTab] = useState<TabId>(() =>
  getStoredActiveTab(localStorage.getItem("activeTab"))
);
useEffect(() => {
  if (activeTab) {
    localStorage.setItem("activeTab", activeTab);
  }
}, [activeTab]);

  const [activeCompanySubTab, setActiveCompanySubTab] =
    useState<CompanySubTabId>("company-info");
  const [activeGscSubTab, setActiveGscSubTab] = useState<GscSubTabId>("whole-analytics");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const [companyDomain, setCompanyDomain] = useState("");
  const [companyDomainLoading, setCompanyDomainLoading] = useState(false);
  const [companyDomainFetchError, setCompanyDomainFetchError] = useState<string | null>(null);
  const [domainError, setDomainError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteLabel, setDeleteLabel] = useState<string>('');
  const [deleteAction, setDeleteAction] = useState<(() => void) | null>(null);

  function confirmDelete(label: string, action: () => void) {
    setDeleteLabel(label);
    setDeleteAction(() => action);
    setShowDeleteModal(true);
  }
const [auditData, setAuditData] = useState<any>(null);
const [auditLoading, setAuditLoading] = useState(false);
const [auditError, setAuditError] = useState<string | null>(null);
const [auditResult, setAuditResult] = useState<any>(null);
const [auditComplete, setAuditComplete] = useState(false);
const [selectedMetric, setSelectedMetric] = useState<string | undefined>();
const [showAuditModal, setShowAuditModal] = useState(false);
const resultsRef = useRef<HTMLDivElement | null>(null);
  const [activeChartTab, setActiveChartTab] = useState<'overview' | 'comparison' | 'distribution'>('overview');
  const [n8nSending, setN8nSending] = useState(false);
const [n8nRequestId, setN8nRequestId] = useState<string | null>(null);
const [n8nStatus, setN8nStatus] = useState<'processing' | 'completed' | 'failed' | null>(null);
const [n8nResults, setN8nResults] = useState<{sheetsUrl?: string; slidesUrl?: string} | null>(null);
const sseRef = useRef<EventSource | null>(null);
  const autoAuditTriggeredRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingSteps, setLoadingSteps] = useState([
    {
      name: "Domain Validation",
      status: "pending" as "pending" | "running" | "completed" | "failed",
      progress: 0,
    },
    {
      name: "SSL Certificate Check",
      status: "pending" as "pending" | "running" | "completed" | "failed",
      progress: 0,
    },
    {
      name: "Server Response Analysis",
      status: "pending" as "pending" | "running" | "completed" | "failed",
      progress: 0,
    },
    {
      name: "Domain Extraction & Keyword Generation",
      status: "pending" as "pending" | "running" | "completed" | "failed",
      progress: 0,
    },
  ]);
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [createdDomainId, setCreatedDomainId] = useState<number | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [domainContext, setDomainContext] = useState<string>("");
  const [isContextExpanded, setIsContextExpanded] = useState(false);
  const [keywords, setKeywords] = useState<
    Array<{
      id: number;
      term: string;
      volume: number;
      difficulty: string;
      cpc: number;
      intent?: string;
    }>
  >([]);
  const [keywordsTableData, setKeywordsTableData] = useState<
    KeywordTableItem[]
  >([]);
  const [filters, setFilters] = useState({
    competition: "",
    intent: "",
    volume: "",
    trends: "",
    date: "",
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [sortConfig, setSortConfig] = useState<{
    key: keyof KeywordTableItem;
    direction: "asc" | "desc";
  } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [showAddKeyword, setShowAddKeyword] = useState(false);
  const [newKeyword, setNewKeyword] = useState("");
  const [isAddingKeyword, setIsAddingKeyword] = useState(false);
  const [confirmUpdateOpen, setConfirmUpdateOpen] = useState(false);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [awaitingNewDomain, setAwaitingNewDomain] = useState(false);
  const [showCountByCompetition, setShowCountByCompetition] = useState<
    Record<string, number>
  >({
    Low: 8,
    Medium: 8,
    High: 8,
  });
  const [gscConnected, setGscConnected] = useState(false);
  const [gscAnalysis, setGscAnalysis] = useState(null);

  const openSettingsIntegrations = useCallback(() => {
    setActiveTab("settings");
    setActiveCompanySubTab("integration");
    const basePath = location.pathname.startsWith("/newdashboard") ? "/newdashboard" : "/dashboard";
    navigate(`${basePath}?tab=settings&subtab=integrations`);
  }, [location.pathname, navigate]);

  // Track pages currently being published (waiting for SSE confirmation)
  const [publishingPageIds, setPublishingPageIds] = useState<Set<number>>(new Set());
  // Map draftId to pageId so SSE handler knows which page to update
  const [draftToPageMap, setDraftToPageMap] = useState<Map<number, number>>(new Map());
  // Track draft statuses (published/local drafts/failed)
  const [draftStatuses, setDraftStatuses] = useState<Map<number, { isPublished: boolean; isFailed?: boolean; publishedUrl?: string; draftId?: number; error?: string }>>(new Map());
  const [sharedPublishStatuses, setSharedPublishStatuses] = useState<Map<number, {
    status: 'generating' | 'published' | 'failed';
    publishedUrl?: string;
    wordpressPostId?: number | null;
    error?: string;
    updatedAt?: string;
  }>>(new Map());

  // Track generation job statuses
  const [generationJobs, setGenerationJobs] = useState<Map<number, GenerationPageStatus>>(new Map());
  const notifiedReadyPageIdsRef = useRef<Set<number>>(new Set());
const [improvedContent, setImprovedContent] = useState("");
  const [gscEmail, setGscEmail] = useState<string>("");
  const [gscSelectedProperty, setGscSelectedProperty] = useState<string>("");
  const [gscProperties, setGscProperties] = useState<
    Array<{ siteUrl: string; permissionLevel: string }>
  >([]);
  const [gscLoading, setGscLoading] = useState(false);
  const [gscStatusLoading, setGscStatusLoading] = useState(false);
  const [gscLastSynced, setGscLastSynced] = useState<Date | null>(null);
  const [googleAnalyticsId, setGoogleAnalyticsId] = useState("");
  const [gaSaving, setGaSaving] = useState(false);
  const [wpIntegration, setWpIntegration] = useState<WordpressIntegration | null>(null);
  const [wpIntegrationLoading, setWpIntegrationLoading] = useState(false);
  const [wpIntegrationSaving, setWpIntegrationSaving] = useState(false);
  const [wpIntegrationDeleting, setWpIntegrationDeleting] = useState(false);
  const [openWordpressConnectionView, setOpenWordpressConnectionView] = useState(false);
  const [wpForm, setWpForm] = useState({ siteUrl: '', username: '', password: '' });
  const [campaigns, setCampaigns] = useState<Array<{ id: number; title: string; description: string | null; createdAt: string; updatedAt: string }>>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [campaignTabDataLoading, setCampaignTabDataLoading] = useState(false);
  const [showCreateCampaign, setShowCreateCampaign] = useState(false);
  const [campaignLayout, setCampaignLayout] = useState<'grid' | 'list'>('grid');
  const [newCampaignTitle, setNewCampaignTitle] = useState("");
  const [newCampaignDescription, setNewCampaignDescription] = useState("");
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(
    null
  );
  const [activeSection, setActiveSection] = useState<'all' | 'favourites' | 'published'>('all');
  /** Set when a worksheet row's "Draft Blog" action is clicked. The
   *  dashboard renders an overlay hosting PublishExperience in its embedded
   *  (disablePreviewOverlay) mode. The Publish action on the worksheet row
   *  doesn't go through here — it fires direct via /api/publish/publish.
   *  This overlay is only for viewing/editing the draft. */
  const [draftOverlayId, setDraftOverlayId] = useState<number | null>(null);

  const handleOpenDraftInPublish = useCallback((draftId: number) => {
    setDraftOverlayId(draftId);
  }, []);

  const handleCloseDraftOverlay = useCallback(() => {
    setDraftOverlayId(null);
  }, []);
  const [openSortMenu, setOpenSortMenu] = useState(false);
const [sortBy, setSortBy] = useState<"date" | "name">("date");
  const [favouriteIds, setFavouriteIds] = useState<Set<number>>(new Set());
const [openMenuId, setOpenMenuId] = useState<number | null>(null);
const toggleFavourite = (id: number) => {
  setFavouriteIds(prev => {
    const newSet = new Set(prev);
    newSet.has(id) ? newSet.delete(id) : newSet.add(id);
    return newSet;
  });
};
  // PUBLISH PAGE STATES
const [primaryKeyword, setPrimaryKeyword] = useState("");
const [longtailKeywords, setLongtailKeywords] = useState("");
const [brandName, setBrandName] = useState("");
const [brandDescription, setBrandDescription] = useState("");
const [image, setImage] = useState(1);
const [wordCount, setWordCount] = useState(1500);
const [featuredImage, setFeaturedImage] = useState("");

// UI STATES
const [publishLoading, setPublishLoading] = useState(false);
const [publishSuccess, setPublishSuccess] = useState(false);
const [publishError, setPublishError] = useState("");
const [openIndex, setOpenIndex] = useState<number | null>(null);

const toggleSection = (idx: number) => {
  setOpenIndex(prev => (prev === idx ? null : idx));
};
  // Company info carousel: track index and count to show arrows conditionally
  const companyCarouselRef = useRef<HTMLDivElement | null>(null);
  const [companyCurrentIndex, setCompanyCurrentIndex] = useState(0);
  const [companySectionsCount, setCompanySectionsCount] = useState(0);
  
  const extractOrgName = (context: string) => {
    if (!context) return "";
    const lines = context.split('\n');
    for (const line of lines) {
      const match = line.match(/(?:Organization|Company|Brand)\s*:\s*([^\n]+)/i) || 
                    line.match(/###\s*(?:Brand Analysis for|Company Profile:)\s*([^\n]+)/i);
      if (match && match[1]) {
        return match[1].trim().replace(/\*+/g, '');
      }
    }
    return "";
  };
  
  const companyCarouselCleanupRef = useRef<(() => void) | null>(null);
  const setCompanyCarouselRef = useCallback((el: HTMLDivElement | null) => {
    if (companyCarouselCleanupRef.current) {
      companyCarouselCleanupRef.current();
      companyCarouselCleanupRef.current = null;
    }
    companyCarouselRef.current = el;
    if (!el) {
      setCompanySectionsCount(0);
      setCompanyCurrentIndex(0);
      return;
    }
    const update = () => {
      const count = Math.max(0, el.children.length);
      setCompanySectionsCount(count);
      const idx = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
      setCompanyCurrentIndex(Math.min(Math.max(0, idx), Math.max(0, count - 1)));
    };
    update();
    el.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    companyCarouselCleanupRef.current = () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const isSidebarExpanded = sidebarOpen || isSidebarHovered;

// For inline editing of campaigns
const [showEditModal, setShowEditModal] = useState(false);
const [editingCampaignId, setEditingCampaignId] = useState<number | null>(null);
const [editTitle, setEditTitle] = useState('');
const [editDescription, setEditDescription] = useState('');


  useEffect(() => {
    if (sidebarOpen) {
      setIsSidebarHovered(false);
    }
  }, [sidebarOpen]);

  const handlePublishUpdate = useCallback((data: {
    draftId?: number;
    pageId?: number;
    status: 'published' | 'failed' | 'generating';
    publishedUrl?: string;
    wordpressPostId?: number | null;
    error?: string;
  }) => {
    console.log('[Dashboard:SSE] Received update:', data);

    const incomingDraftId = data.draftId ? Number(data.draftId) : null;
    const incomingPageId = data.pageId ? Number(data.pageId) : null;

    if (incomingDraftId) {
      setSharedPublishStatuses((prev) => {
        const updated = new Map(prev);
        updated.set(incomingDraftId, {
          status: data.status,
          publishedUrl: data.publishedUrl,
          wordpressPostId: data.wordpressPostId,
          error: data.error,
          updatedAt: new Date().toISOString()
        });
        return updated;
      });
    }

    let targetPageId: number | null = incomingPageId;

    if (!targetPageId && incomingDraftId) {
      for (const [dId, pId] of draftToPageMapRef.current.entries()) {
        if (Number(dId) === incomingDraftId) {
          targetPageId = Number(pId);
          break;
        }
      }
    }

    if (data.status === 'published' || data.status === 'failed') {
      if (targetPageId) {
        setPublishingPageIds(prev => {
          const next = new Set(prev);
          next.delete(targetPageId!);
          return next;
        });
      }

      if (incomingDraftId) {
        setDraftToPageMap(prev => {
          const next = new Map(prev);
          next.delete(incomingDraftId);
          return next;
        });
      }
    }

    if (data.status === 'published' && data.publishedUrl && targetPageId) {
      setGenerationJobs(prev => {
        const updated = new Map(prev);
        const existing = updated.get(targetPageId!);
        if (existing) {
          updated.set(targetPageId!, {
            ...existing,
            wordpressUrl: data.publishedUrl || null,
            status: 'published',
          });
        }
        return updated;
      });

      setDraftStatuses(prev => {
        const updated = new Map(prev);
        const existing = updated.get(targetPageId!);
        updated.set(targetPageId!, {
          ...(existing || {}),
          isPublished: true,
          publishedUrl: data.publishedUrl,
          draftId: incomingDraftId || existing?.draftId
        });
        return updated;
      });

      toast({
        title: 'Published Successfully',
        description: `Your content is live! View it at: ${data.publishedUrl}`,
      });
      return;
    }

    if (data.status === 'failed') {
      setDraftStatuses(prev => {
        const updated = new Map(prev);
        if (targetPageId && updated.has(targetPageId)) {
          const existing = updated.get(targetPageId)!;
          updated.set(targetPageId, {
            ...existing,
            isFailed: true,
            isPublished: false,
            publishedUrl: undefined,
            error: data.error,
            draftId: incomingDraftId || existing.draftId
          });
        } else if (incomingDraftId) {
          for (const [pid, status] of updated.entries()) {
            if (Number(status.draftId) === incomingDraftId) {
              updated.set(pid, {
                ...status,
                isFailed: true,
                isPublished: false,
                publishedUrl: undefined,
                error: data.error,
              });
              break;
            }
          }
        }
        return updated;
      });

      if (targetPageId) {
        setGenerationJobs(prev => {
          const updated = new Map(prev);
          const existing = updated.get(targetPageId);
          if (existing) {
            updated.set(targetPageId, {
              ...existing,
              wordpressUrl: null,
            });
          }
          return updated;
        });
      }

      toast({
        title: 'Publish Failed',
        description: data.error || 'An error occurred while publishing to WordPress',
        variant: 'destructive',
      });
    }
  }, [draftToPageMap, toast]);

  // Subscribe to backend publish_update SSE events. Without this hook nobody
  // would consume the events broadcast by /api/publish/publish-webhook —
  // generation SSE explicitly drops anything other than `generation:update`,
  // so the worksheet's optimistic "Publishing…" flag would never clear and
  // sharedPublishStatuses would stay empty until a full page reload.
  usePublishStatus({
    onUpdate: (data) => {
      handlePublishUpdate({
        draftId: data.draftId,
        pageId: data.pageId,
        status: data.status === 'draft' ? 'generating' : data.status,
        publishedUrl: data.publishedUrl,
        wordpressPostId: data.wordpressPostId,
        error: data.error,
      });
    },
  });

  const tabs: DashboardSidebarTab[] = DASHBOARD_TABS.map((tab) => ({
    ...tab,
    icon: <tab.icon className="h-5 w-5" />,
  }));

  const validateDomain = (value: string): ParsedDomainInput | null => {
    const result = validateDomainInput(value);
    setDomainError(result.error);
    return result.parsed;
  };

  //Handle Analyze Button----
const handleAnalyze = async () => {
  try {
    setCompanyDomainLoading(true);

    // 1️⃣ Fetch GSC Analysis
    const gscRes = await fetch(
      `${import.meta.env.VITE_API_URL}/api/gsc/analyze?domain=${companyDomain}`,
      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("authToken")}`,
        },
      }
    );

    const gscData = await gscRes.json();
    setGscAnalysis(gscData);

    // 2️⃣ Fetch Page HTML Content
    const pageRes = await fetch(
      `${import.meta.env.VITE_API_URL}/api/scraper/content?domain=${companyDomain}`,
      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("authToken")}`,
        },
      }
    );

    const pageData = await pageRes.json();
    setImprovedContent(pageData.html); 

  } catch (err) {
    console.error(err);
  } finally {
    setCompanyDomainLoading(false);
  }
};


const normalizedDomain = normalizeDomain(companyDomain);

const competitorAnalysisQuery = useCompetitorAnalysis<any>(createdDomainId);

const competitorIntelligenceRows = useMemo(() => {
  const competitorRows = Array.isArray(competitorAnalysisQuery.data?.competitors)
    ? competitorAnalysisQuery.data.competitors
    : [];

  return competitorRows
    .map((competitor: any) => {
      const estimatedTraffic =
        typeof competitor?.estimatedTraffic === "number"
          ? competitor.estimatedTraffic
          : Math.round(
              (typeof competitor?.marketShare === "number" ? competitor.marketShare : 0) * 1_000_000
            );

      return {
        domain: String(competitor?.host ?? competitor?.domain ?? "Unknown"),
        keywords: Number(
          competitor?.promptCoverage ?? competitor?.mentions ?? competitor?.keywordCount ?? competitor?.frequency ?? 0
        ),
        overlap: Number(
          competitor?.coveragePct ?? competitor?.similarityScore ?? competitor?.overlap ?? 0
        ),
        mentions: Number(competitor?.mentions ?? 0),
        marketShare: Number(competitor?.marketShare ?? 0),
        estimatedTraffic,
        traffic: estimatedTraffic,
        rank: typeof competitor?.rank === "number" ? competitor.rank : null,
        threatLevel: competitor?.threatLevel ?? null,
        reasoning: competitor?.reasoning ?? null,
      };
    })
    .sort((a, b) => {
      const aRank = typeof a.rank === "number" ? a.rank : Number.MAX_SAFE_INTEGER;
      const bRank = typeof b.rank === "number" ? b.rank : Number.MAX_SAFE_INTEGER;
      if (aRank !== bRank) return aRank - bRank;
      return b.estimatedTraffic - a.estimatedTraffic;
    });
}, [competitorAnalysisQuery.data]);

const competitorOverview = useMemo(() => {
  const rows = competitorIntelligenceRows.slice(0, 4).map((competitor) => ({
    domain: competitor.domain,
    keywords: formatDashboardCount(competitor.keywords),
    overlap: formatDashboardPercent(competitor.overlap),
    traffic: formatDashboardTraffic(competitor.estimatedTraffic ?? competitor.traffic),
  }));

  return {
    loading: createdDomainId != null && competitorAnalysisQuery.isLoading,
    error: competitorAnalysisQuery.isError
      ? "Unable to load competitor overview right now."
      : null,
    rows,
  };
}, [
  competitorAnalysisQuery.data,
  competitorAnalysisQuery.isError,
  competitorAnalysisQuery.isLoading,
  competitorIntelligenceRows,
  createdDomainId,
]);


// Fetch existing audit for company domain
const fetchAudit = useCallback(async () => {
  const token = localStorage.getItem("authToken");
  if (!token) return;

  try {
    const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/audit`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (resp.ok) {
      const data = await resp.json();
      if (data.success && data.audit) {
        // Convert database format to normalized format for frontend
        setAuditResult({
          performance: data.audit.performance,
          seo: data.audit.seo,
          accessibility: data.audit.accessibility,
          bestPractices: data.audit.bestPractices,
          audits: data.audit.audits,
          screenshot: data.audit.screenshotUrl || null,
          recommendations: data.audit.recommendations ?? null,
          suggestions: data.audit.suggestions ?? null,
          opportunities: data.audit.opportunities ?? null,
          insights: data.audit.insights ?? null,
          pageSpeedSuggestions:
            data.audit.pageSpeedSuggestions ?? data.audit.pagespeedSuggestions ?? null,
        });
        setAuditData(data.audit);
      }
    }
  } catch (err) {
    console.error('Error fetching audit:', err);
  }
}, []);

const overallScore =
  auditData
    ? (auditData.performance +
        auditData.seo +
        auditData.accessibility +
        auditData.bestPractices) / 4
    : 0;


//Handle Run Audit
const handleRunAudit = async (url?: string) => {
  const token = localStorage.getItem("authToken");   

  if (!url || !token) {
    console.error("Missing URL or token");
    return;
  }

  setAuditLoading(true);
  setAuditError(null);

  const runAuditRequest = async () => {
    const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/audit`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
    });

    if (!resp.ok) {
      const errorData = await resp.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to run audit (${resp.status})`);
    }

    return resp.json();
  };

  try {
    let data: any;
    try {
      data = await runAuditRequest();
    } catch (firstError) {
      // First-run failures can happen on cold starts / transient infra hiccups.
      // Retry once automatically before surfacing an error.
      await new Promise((resolve) => setTimeout(resolve, 1200));
      data = await runAuditRequest();
    }

    if (data.success) {
      const normalizedAudit = data.normalized ?? data.audit ?? data;
      setAuditResult({
        performance: normalizedAudit?.performance ?? 0,
        seo: normalizedAudit?.seo ?? 0,
        accessibility: normalizedAudit?.accessibility ?? 0,
        bestPractices: normalizedAudit?.bestPractices ?? 0,
        audits: normalizedAudit?.audits ?? null,
        screenshot:
          normalizedAudit?.screenshot ??
          normalizedAudit?.screenshotUrl ??
          data?.screenshot ??
          data?.screenshotUrl ??
          null,
        screenshotUrl:
          normalizedAudit?.screenshotUrl ??
          normalizedAudit?.screenshot ??
          data?.screenshotUrl ??
          data?.screenshot ??
          null,
        recommendations:
          normalizedAudit?.recommendations ?? data?.recommendations ?? null,
        suggestions: normalizedAudit?.suggestions ?? data?.suggestions ?? null,
        opportunities: normalizedAudit?.opportunities ?? data?.opportunities ?? null,
        insights: normalizedAudit?.insights ?? data?.insights ?? null,
        pageSpeedSuggestions:
          normalizedAudit?.pageSpeedSuggestions ??
          normalizedAudit?.pagespeedSuggestions ??
          data?.pageSpeedSuggestions ??
          data?.pagespeedSuggestions ??
          null,
        pagespeedSuggestions:
          normalizedAudit?.pagespeedSuggestions ??
          normalizedAudit?.pageSpeedSuggestions ??
          data?.pagespeedSuggestions ??
          data?.pageSpeedSuggestions ??
          null,
      });
      setAuditData({
        performance: normalizedAudit?.performance ?? 0,
        seo: normalizedAudit?.seo ?? 0,
        accessibility: normalizedAudit?.accessibility ?? 0,
        bestPractices: normalizedAudit?.bestPractices ?? 0,
        audits: normalizedAudit?.audits ?? null,
        screenshotUrl:
          normalizedAudit?.screenshot ??
          normalizedAudit?.screenshotUrl ??
          data?.screenshot ??
          data?.screenshotUrl ??
          null,
      });
      setAuditComplete(true);
      setShowAuditModal(true);
      setTimeout(() => setAuditComplete(false), 3500);
      return;
    }
    throw new Error('Audit did not complete successfully');
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : 'Failed to run audit';
    setAuditError(message);
    toast({
      title: 'Audit Failed',
      description: message,
      variant: 'destructive',
    });
  } finally {
    setAuditLoading(false);
  }
};
// Handle Send to N8n
const handleSendToN8n = async () => {
  const token = localStorage.getItem("authToken");
  if (!token) {
    console.error("Missing token");
    return;
  }

  setN8nSending(true);
  setN8nStatus(null);
  setN8nResults(null);

  try {
    const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/audit/n8n/send`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!resp.ok) {
      const errorData = await resp.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to send to n8n');
    }

    const data = await resp.json();
    if (data.success) {
      setN8nRequestId(data.requestId);
      setN8nStatus('processing');
      toast({
        title: 'Processing',
        description: 'N8n is processing your request',
      });
      
      // Connect to SSE for real-time updates
      connectSSE(token, data.requestId);
    }
  } catch (err) {
    console.error(err);
    toast({
      title: 'Failed to Send',
      description: err instanceof Error ? err.message : 'Failed to send to n8n',
      variant: 'destructive',
    });
    setN8nSending(false);
  }
};

// Connect to SSE for n8n updates
const connectSSE = (token: string, requestId: string) => {
  if (sseRef.current) {
    sseRef.current.close();
  }

  const url = `${import.meta.env.VITE_API_URL}/api/sse?token=${encodeURIComponent(token)}`;
  const eventSource = new EventSource(url);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'n8n_update' && data.data?.requestId === requestId) {
        setN8nStatus(data.data.status);
        
        if (data.data.status === 'completed') {
          setN8nResults({
            sheetsUrl: data.data.googleSheetsUrl,
            slidesUrl: data.data.googleSlidesUrl
          });
          toast({
            title: 'Success',
            description: 'N8n processing completed successfully',
          });
          eventSource.close();
          sseRef.current = null;
          setN8nSending(false);
        } else if (data.data.status === 'failed') {
          toast({
            title: 'Failed',
            description: data.data.error || 'N8n processing failed',
            variant: 'destructive',
          });
          eventSource.close();
          sseRef.current = null;
          setN8nSending(false);
        }
      }
    } catch (err) {
      console.error('Error parsing SSE:', err);
    }
  };

  eventSource.onerror = () => {
    eventSource.close();
    sseRef.current = null;
  };

  sseRef.current = eventSource;
};

// Cleanup SSE on unmount
useEffect(() => {
  return () => {
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
  };
}, []);



  const handleDomainChange = (value: string) => {
    console.log('handleDomainChange', value);
    setCompanyDomain(value);
    if (value) {
      validateDomain(value);
      return;
    }

    setDomainError("");
  };

  const handleViewReport = () => {
    setShowAuditModal(false);
    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 220);
  };


  // Handle URL query parameters for tab navigation (e.g., from OAuth callback)
  useEffect(() => {
    if (searchState.redirectToAiVisibility) {
      navigate('/ai-visibility');
    } else if (searchState.activeTab) {
      setActiveTab(searchState.activeTab);
    }

    if (searchState.activeCompanySubTab) {
      setActiveCompanySubTab(searchState.activeCompanySubTab);
    }

    if (searchState.openWordpressConnection) {
      setActiveTab('integration');
      setActiveCompanySubTab('integration');
      setOpenWordpressConnectionView(true);
    }
  }, [navigate, searchState]);


  // Auto-advance carousel to show running task
  useEffect(() => {
    const interval = setInterval(() => {
      const runningTaskIndex = loadingSteps.findIndex(
        (task) => task.status === "running"
      );
      if (runningTaskIndex !== -1) {
        setCurrentTaskIndex(runningTaskIndex);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [loadingSteps]);

  /* 
    Updated fetchCompanyDomain to be more robust:
    1. It doesn't clear keywords on error, preserving previous state if a transient error occurs.
    2. It only runs when necessary.
  */
  const fetchCompanyDomain = useCallback(async (force = false) => {
    // If we already have keywords and we're not forcing a refresh, we might want to skip
    // But for now, let's just make sure we don't clear them on error.
    if (awaitingNewDomain && !force) {
      return;
    }
    
    try {
      setCompanyDomainLoading(true);
      setCompanyDomainFetchError(null);
      // Add timestamp to prevent caching
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/user/company-domain?t=${Date.now()}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("authToken")}`,
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache"
          },
        }
      );

      if (!response.ok) {
        // If it's a 404, it might genuinely mean "no domain", so we clear.
        // But if it's 500 or network error, we should probably keep existing data.
        if (response.status === 404) {
           setCompanyDomain("");
           setDomainContext("");
           setKeywords([]);
           setCreatedDomainId(null);
           setShowResults(false);
        }
        throw new Error("Failed to fetch company domain");
      }

      const data = await response.json();

      if (data.success && data.domain) {
        // Company domain exists - show results
        setCompanyDomain(data.domain.url);
        setDomainContext(data.domain.context || "");
        
        // IMPORTANT: Only update keywords if we received them, or if the list is explicitly empty but valid.
        // This prevents overwriting with empty array if backend has an issue returning keywords but returns domain.
        if (data.keywords) {
             setKeywords(data.keywords);
        }
        
        setCreatedDomainId(data.domain.id);
        setGoogleAnalyticsId(data.domain.googleAnalyticsId || "");
        setShowResults(true);
      } else {
        // No company domain - show form
        setShowResults(false);
        setCompanyDomain("");
        setDomainContext("");
        setKeywords([]);
        setCreatedDomainId(null);
      }
    } catch (error) {
      console.error("Error fetching company domain:", error);
      setCompanyDomainFetchError(
        error instanceof Error ? error.message : 'Failed to fetch company domain'
      );
      // On error, DO NOT clear state immediately to avoid flickering or data loss on transient network issues
      // unless we are sure it's a "not found" case (handled above).
    } finally {
      setCompanyDomainLoading(false);
    }
  }, [awaitingNewDomain]);

  // Fetch all campaign tab data in parallel when campaign tab is active
  const fetchCampaignTabData = useCallback(async () => {
    if (activeTab !== 'projects') return;
    
    setCampaignTabDataLoading(true);
    try {
      // Fetch all required data in parallel
      const [domainResponse, wpResponse] = await Promise.all([
        fetch(`${import.meta.env.VITE_API_URL}/api/user/company-domain?t=${Date.now()}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          },
        }),
        fetch(`${import.meta.env.VITE_API_URL}/api/publish/wordpress`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
            'Content-Type': 'application/json',
          },
        }),
      ]);

      // Process company domain data
      if (domainResponse.ok) {
        const domainData = await domainResponse.json();
        if (!awaitingNewDomain && domainData.success && domainData.domain) {
          setCompanyDomain(domainData.domain.url);
          setDomainContext(domainData.domain.context || '');
          if (domainData.keywords) {
             setKeywords(domainData.keywords);
          }
          setCreatedDomainId(domainData.domain.id);
          setGoogleAnalyticsId(domainData.domain.googleAnalyticsId || "");
        }
        // If domain missing, we might want to clear, but let's be careful not to break UI
      }

      // Process WordPress integration data
      if (wpResponse.ok) {
        const wpData = await wpResponse.json();
        if (wpData.success) {
          setWpIntegration(wpData.integration || null);
          setWpForm((prev) => ({
            ...prev,
            siteUrl: wpData.integration?.siteUrl || '',
            username: wpData.integration?.username || '',
            password: '',
          }));
        }
      }
    } catch (error) {
      console.error('Error fetching campaign tab data:', error);
    } finally {
      setCampaignTabDataLoading(false);
    }
  }, [activeTab, awaitingNewDomain]);

  useEffect(() => {
    if (activeTab === 'projects') {
      fetchCampaignTabData();
    }
  }, [activeTab, fetchCampaignTabData]);

  // Modified useEffect: Only fetch company domain on specific tabs or if currently empty
  useEffect(() => {
      // We always want to fetch on initial mount (handled by the other useEffect below) or if we are on tabs that assume data presence.
      // But we shouldn't re-fetch on *every* tab switch if we already have data, to prevent flickering.
      const shouldFetch =
        activeTab === 'overview' ||
        activeTab === 'analytics';

      if (shouldFetch) {
          fetchCompanyDomain();
      }
  }, [activeTab, fetchCompanyDomain]); 

  // Fetch audit when audit tab is active
  useEffect(() => {
    if (activeTab === 'audit') {
      fetchAudit();
    }
  }, [activeTab, fetchAudit]);

  // On mount: load company domain and any existing audit
  useEffect(() => {
    // Check if we already have data to avoid double fetch
    if (!companyDomain) {
        fetchCompanyDomain();
    }
    fetchAudit();
  }, [fetchCompanyDomain, fetchAudit]);

  // One-time auto-run audit after signup onboarding domain entry.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hasQueryAutoRun = params.get("autoRunAudit") === "1";
    const hasPendingFlag = localStorage.getItem("pendingAutoAuditRun") === "1";
    const shouldAutoRun = hasQueryAutoRun || hasPendingFlag;

    if (!shouldAutoRun) return;
    if (autoAuditTriggeredRef.current) return;
    if (!companyDomain || auditLoading) return;

    autoAuditTriggeredRef.current = true;
    setActiveTab("audit");
    void handleRunAudit(companyDomain);

    localStorage.removeItem("pendingAutoAuditRun");
    if (hasQueryAutoRun) {
      params.delete("autoRunAudit");
      const next = params.toString();
      window.history.replaceState({}, "", next ? `${window.location.pathname}?${next}` : window.location.pathname);
    }
  }, [companyDomain, auditLoading, handleRunAudit]);

  // Helper function to determine intent based on keyword content
  const determineIntent = (keyword: string): string => {
    const lowerKeyword = keyword.toLowerCase();

    // Transactional intent keywords
    if (
      lowerKeyword.includes("buy") ||
      lowerKeyword.includes("purchase") ||
      lowerKeyword.includes("order") ||
      lowerKeyword.includes("shop") ||
      lowerKeyword.includes("price") ||
      lowerKeyword.includes("cost") ||
      lowerKeyword.includes("deal") ||
      lowerKeyword.includes("discount") ||
      lowerKeyword.includes("sale") ||
      lowerKeyword.includes("offer")
    ) {
      return "Transactional";
    }

    // Informational intent keywords
    if (
      lowerKeyword.includes("what") ||
      lowerKeyword.includes("how") ||
      lowerKeyword.includes("why") ||
      lowerKeyword.includes("when") ||
      lowerKeyword.includes("where") ||
      lowerKeyword.includes("guide") ||
      lowerKeyword.includes("tutorial") ||
      lowerKeyword.includes("tips") ||
      lowerKeyword.includes("learn") ||
      lowerKeyword.includes("information") ||
      lowerKeyword.includes("explain") ||
      lowerKeyword.includes("definition")
    ) {
      return "Informational";
    }

    // Default to Commercial for business-related terms
    return "Commercial";
  };

  // Helper to normalize keyword terms for duplicate detection
  const normalizeTerm = (s: string) =>
    s.toLowerCase().trim().replace(/\s+/g, " ");

  // Convert keywords to table format
  useEffect(() => {
    if (keywords.length > 0 && createdDomainId) {
      const lsCustom = (localStorage.getItem("customKeywords") || "")
        .split(",")
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean);
      const lsAdvanced = (localStorage.getItem("advancedKeywords") || "")
        .split(",")
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean);
      const customSet = new Set([...lsCustom, ...lsAdvanced]);

      const tableKeywords = buildKeywordTableData(
        keywords,
        companyDomain,
        Array.from(customSet)
      );

      setKeywordsTableData(tableKeywords);
    } else {
      setKeywordsTableData([]);
    }
    console.log("keywords:", keywords.length);
  console.log("createdDomainId:", createdDomainId);
  }, [keywords, createdDomainId, companyDomain]);

  // Filter and sort keywords
  const filteredKeywords = React.useMemo(
    () =>
      filterKeywordTableData(keywordsTableData, searchTerm, {
        competition: filters.competition,
        intent: filters.intent,
      }),
    [keywordsTableData, searchTerm, filters.competition, filters.intent]
  );

  const sortedKeywords = React.useMemo(
    () => sortKeywordTableData(filteredKeywords, sortConfig),
    [filteredKeywords, sortConfig]
  );

  // Pagination
  const { totalPages, currentItems: currentKeywords } = React.useMemo(
    () => paginateItems(sortedKeywords, currentPage, itemsPerPage),
    [sortedKeywords, currentPage, itemsPerPage]
  );

  // Reset to first page when keywords change
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    } else if (currentPage < 1) {
      setCurrentPage(1);
    }
  }, [sortedKeywords.length, totalPages, currentPage]);

  // Reset page when filters/search change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filters.competition, filters.intent]);

  const handleSort = useCallback(
    (key: keyof KeywordTableItem) => {
      let direction: "asc" | "desc" = "asc";
      if (
        sortConfig &&
        sortConfig.key === key &&
        sortConfig.direction === "asc"
      ) {
        direction = "desc";
      }
      setSortConfig({ key, direction });
    },
    [sortConfig]
  );

  const getSortIcon = useCallback(
    (key: keyof KeywordTableItem) => {
      if (!sortConfig || sortConfig.key !== key) {
        return <ArrowUpDown className="w-4 h-4 text-gray-400" />;
      }
      return sortConfig.direction === "asc" ? (
        <ChevronUp className="w-4 h-4 text-gray-700" />
      ) : (
        <ChevronDown className="w-4 h-4 text-gray-700" />
      );
    },
    [sortConfig]
  );

  const getCompetitionBadge = useCallback((competition: string) => {
    const baseClasses = "px-2.5 py-1 rounded-full text-xs font-semibold";
    switch (competition) {
      case "High":
        return `${baseClasses} bg-red-100 text-red-800`;
      case "Medium":
        return `${baseClasses} bg-yellow-100 text-yellow-800`;
      case "Low":
        return `${baseClasses} bg-green-100 text-green-800`;
      default:
        return `${baseClasses} bg-gray-100 text-gray-800`;
    }
  }, []);

  const handlePageChange = useCallback(
    (page: number) => {
      const totalPagesCalc = paginateItems(
        sortedKeywords,
        currentPage,
        itemsPerPage
      ).totalPages;
      if (page >= 1 && page <= totalPagesCalc) {
        setCurrentPage(page);
      }
    },
    [sortedKeywords, currentPage, itemsPerPage]
  );

  const getPageNumbers = useCallback(
    () => buildPageNumbers(totalPages, currentPage),
    [totalPages, currentPage]
  );

  const handleAddCustomKeyword = useCallback(async () => {
    if (!newKeyword.trim() || isAddingKeyword || !createdDomainId) return;

    const trimmedKeyword = newKeyword.trim();
    const exists = keywordsTableData.some(
      (kw) => normalizeTerm(kw.keyword) === normalizeTerm(trimmedKeyword)
    );

    if (exists) {
      toast({
        title: "Already Added",
        description: `"${trimmedKeyword}" is already in your list`,
      });
      setNewKeyword("");
      setShowAddKeyword(false);
      return;
    }

    setIsAddingKeyword(true);

    try {
      const analyzeResponse = await fetch(`${import.meta.env.VITE_API_URL}/api/keywords/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("authToken")}`,
        },
        body: JSON.stringify({
          keyword: trimmedKeyword,
          domain: companyDomain,
          location: "Global",
          domainId: createdDomainId,
        }),
      });

      if (!analyzeResponse.ok) {
        throw new Error(`Analysis failed! status: ${analyzeResponse.status}`);
      }

      const analysisResult = await analyzeResponse.json();

      if (!analysisResult.success) {
        throw new Error(analysisResult.error || "Analysis failed");
      }

      const saveResponse = await fetch(`${import.meta.env.VITE_API_URL}/api/keywords/${createdDomainId}/custom`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("authToken")}`,
        },
        body: JSON.stringify({
          keyword: analysisResult.keyword,
          volume: analysisResult.volume,
          kd: analysisResult.kd,
          competition: analysisResult.competition,
          cpc: analysisResult.cpc,
          intent: analysisResult.intent,
          organic: analysisResult.organic,
          paid: analysisResult.paid,
          trend: analysisResult.trend,
          position: analysisResult.position,
          url: analysisResult.url,
          analysis: analysisResult.analysis,
        }),
      });

      if (!saveResponse.ok) {
        throw new Error(`Save failed! status: ${saveResponse.status}`);
      }

      const saveResult = await saveResponse.json();

      if (!saveResult.success) {
        throw new Error(saveResult.error || "Save failed");
      }

      const existsAfter = keywordsTableData.some(
        (kw) => normalizeTerm(kw.keyword) === normalizeTerm(saveResult.keyword.term)
      );

      if (existsAfter) {
        setNewKeyword("");
        setShowAddKeyword(false);
        setIsAddingKeyword(false);
        return;
      }

      const newKeywordItem: KeywordTableItem = {
        id: saveResult.keyword.id.toString(),
        keyword: saveResult.keyword.term,
        intent: saveResult.keyword.intent || "Commercial",
        volume: saveResult.keyword.volume,
        kd: parseInt(saveResult.keyword.difficulty) || 50,
        competition:
          saveResult.keyword.difficulty === "High"
            ? "High"
            : saveResult.keyword.difficulty === "Low"
            ? "Low"
            : "Medium",
        cpc: saveResult.keyword.cpc,
        organic: Math.floor(saveResult.keyword.volume * 0.1),
        paid: Math.floor(saveResult.keyword.volume * 0.05),
        trend: "Stable",
        position: 0,
        url: "",
        updated: new Date().toISOString().split("T")[0],
        selected: false,
        isCustom: true,
      };

      setKeywordsTableData((prev) => [newKeywordItem, ...prev]);
      setKeywords((prev) => [
        ...prev,
        {
          id: saveResult.keyword.id,
          term: saveResult.keyword.term,
          volume: saveResult.keyword.volume,
          difficulty: saveResult.keyword.difficulty,
          cpc: saveResult.keyword.cpc,
          intent: saveResult.keyword.intent,
        },
      ]);
      setNewKeyword("");
      setShowAddKeyword(false);
      setIsAddingKeyword(false);

      toast({
        title: "Keyword Added Successfully",
        description: `Successfully analyzed and added "${trimmedKeyword}" with comprehensive AI data`,
      });
    } catch (error) {
      console.error("Custom keyword analysis error:", error);
      toast({
        title: "Analysis Failed",
        description:
          error instanceof Error
            ? error.message
            : "Failed to analyze keyword with AI. Please try again.",
        variant: "destructive",
      });
      setNewKeyword("");
      setShowAddKeyword(false);
      setIsAddingKeyword(false);
    }
  }, [
    newKeyword,
    isAddingKeyword,
    createdDomainId,
    keywordsTableData,
    companyDomain,
    toast,
  ]);

  const handleSaveGoogleAnalyticsId = useCallback(async () => {
    if (!createdDomainId) return;

    try {
      setGaSaving(true);
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/domain/${createdDomainId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("authToken")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ googleAnalyticsId }),
      });

      if (!res.ok) {
        throw new Error("Failed to update");
      }

      toast({
        title: "Connection Successful",
        description: "Your Google Analytics Property ID has been saved for the connected Google account.",
      });
    } catch (err) {
      toast({
        title: "Connection Failed",
        description: "Unable to save Property ID. Please try again.",
        variant: "destructive",
      });
    } finally {
      setGaSaving(false);
    }
  }, [createdDomainId, googleAnalyticsId, toast]);

  // Domain context helpers
  const trimmedDomainContext = React.useMemo(
    () => domainContext?.trim() || "",
    [domainContext]
  );

  const domainContextPreview = React.useMemo(() => {
    if (!trimmedDomainContext) return "";

    const paragraphs = trimmedDomainContext
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);

    if (paragraphs.length > 0) {
      const firstBlocks = paragraphs.slice(0, 2).join("\n\n");
      if (firstBlocks.length >= 600) {
        return `${firstBlocks.slice(0, 600)}…`;
      }
      if (paragraphs.length > 2) {
        return `${firstBlocks}…`;
      }
      if (firstBlocks.length < trimmedDomainContext.length) {
        return `${firstBlocks}…`;
      }
      return firstBlocks;
    }

    if (trimmedDomainContext.length > 600) {
      return `${trimmedDomainContext.slice(0, 600)}…`;
    }
    return trimmedDomainContext;
  }, [trimmedDomainContext]);

  const hasAdditionalContext = React.useMemo(() => {
    if (!trimmedDomainContext) return false;
    return trimmedDomainContext.length > domainContextPreview.length + 20;
  }, [trimmedDomainContext, domainContextPreview]);

  const displayedDomainContext =
    isContextExpanded || !hasAdditionalContext
      ? trimmedDomainContext
      : domainContextPreview;

  useEffect(() => {
    setIsContextExpanded(false);
  }, [trimmedDomainContext]);

  const hasWordpressIntegration = Boolean(wpIntegration);

  const fetchGscProperties = useCallback(async () => {
    setGscLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/gsc/properties`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch GSC properties');
      }

      const data = await response.json();
      
      if (data.success) {
        setGscProperties(data.properties || []);
      }
    } catch (error) {
      console.error('Error fetching GSC properties:', error);
      toast({
        title: "Error",
        description: "Failed to fetch Google Search Console properties",
        variant: "destructive"
      });
    } finally {
      setGscLoading(false);
    }
  }, [toast]);

  const fetchGscStatus = useCallback(async () => {
    try {
      setGscStatusLoading(true);
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/gsc/status`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch GSC status');
      }

      const data = await response.json();

      if (data.success && data.connected) {
        setGscConnected(true);
        setGscEmail(data.email || '');
        setGscSelectedProperty(data.selectedProperty || '');
        setGscLastSynced(data.lastSyncedAt ? new Date(data.lastSyncedAt) : null);
        
        if (!data.selectedProperty) {
          fetchGscProperties();
        }
      } else {
        setGscConnected(false);
        setGscEmail("");
        setGscSelectedProperty("");
        setGscProperties([]);
        setGscLastSynced(null);
      }
    } catch (error) {
      console.error("Error fetching GSC status:", error);
      setGscConnected(false);
    } finally {
      setGscStatusLoading(false);
    }
  }, [fetchGscProperties]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const success = urlParams.get('success');
    const error = urlParams.get('error');
      
    if (activeTab === 'integration' || (activeTab === 'analytics' && activeCompanySubTab === 'integration')) {
      if (success === 'true') {
      toast({
          title: "Connected Successfully",
          description: "Google Search Console and Google Analytics access have been connected",
        });
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete('success');
        newUrl.searchParams.delete('error');
        window.history.replaceState({}, '', newUrl.toString());
        fetchGscStatus();
      } else if (error) {
        toast({
          title: "Connection Failed",
          description: `Failed to connect: ${error}`,
        variant: "destructive"
      });
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete('success');
        newUrl.searchParams.delete('error');
        window.history.replaceState({}, '', newUrl.toString());
    }
    }
  }, [activeTab, activeCompanySubTab, toast, fetchGscStatus]);

  const handleConnectGsc = async () => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/gsc/auth/initiate`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("authToken")}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to initiate OAuth");
      }

      const data = await response.json();

      if (data.success && data.authUrl) {
        // Redirect to Google OAuth
        window.location.href = data.authUrl;
      }
    } catch (error) {
      console.error("Error connecting GSC:", error);
      toast({
        title: "Connection Failed",
        description: "Failed to initiate Google Search Console and Google Analytics connection",
        variant: "destructive",
      });
    }
  };

  const handleSelectProperty = async (property: string) => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/gsc/select-property`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("authToken")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ property }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to select property");
      }

      const data = await response.json();

      if (data.success) {
        setGscSelectedProperty(property);
        toast({
          title: "Property Selected",
          description: "Google Search Console property has been selected",
        });
      }
    } catch (error) {
      console.error("Error selecting property:", error);
      toast({
        title: "Error",
        description: "Failed to select property",
        variant: "destructive",
      });
    }
  };

  const handleDisconnectGsc = async () => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/gsc/disconnect`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("authToken")}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to disconnect");
      }

      const data = await response.json();

      if (data.success) {
        setGscConnected(false);
        setGscEmail("");
        setGscSelectedProperty("");
        setGscProperties([]);
        setGscLastSynced(null);
        toast({
          title: "Disconnected",
          description: "Google Search Console and Google Analytics access have been disconnected",
        });
      }
    } catch (error) {
      console.error("Error disconnecting GSC:", error);
      toast({
        title: "Error",
        description: "Failed to disconnect Google Search Console and Google Analytics access",
        variant: "destructive"
      });
    }
  };

  const fetchWordpressIntegration = useCallback(async () => {
    try {
      setWpIntegrationLoading(true);
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/publish/wordpress`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch WordPress integration');
      }

      const data = await response.json();
      if (data.success) {
        setWpIntegration(data.integration || null);
        setWpForm((prev) => ({
          ...prev,
          siteUrl: data.integration?.siteUrl || '',
          username: data.integration?.username || '',
          password: '',
        }));
      }
    } catch (error) {
      console.error('Error fetching WordPress integration:', error);
    } finally {
      setWpIntegrationLoading(false);
    }
  }, [toast, activeTab]);

  const handleSaveWordpressIntegration = async () => {
    if (!wpForm.siteUrl.trim() || !wpForm.username.trim()) {
      toast({
        title: "Missing Information",
        description: "Site URL and username are required",
        variant: "destructive"
      });
      return;
    }

    if (!wpIntegration && !wpForm.password.trim()) {
      toast({
        title: "Password Required",
        description: "Enter your WordPress password or application password to connect",
        variant: "destructive"
      });
      return;
    }

    try {
      setWpIntegrationSaving(true);
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/publish/wordpress`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          siteUrl: wpForm.siteUrl.trim(),
          username: wpForm.username.trim(),
          password: wpForm.password,
        })
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to save integration');
      }

      toast({
        title: "WordPress Connected",
        description: "WordPress credentials saved securely",
      });
      setWpForm((prev) => ({ ...prev, password: '' }));
      fetchWordpressIntegration();
    } catch (error) {
      console.error('Error saving WordPress integration:', error);
      toast({
        title: "Connection Failed",
        description: error instanceof Error ? error.message : "Unable to save WordPress credentials",
        variant: "destructive"
      });
    } finally {
      setWpIntegrationSaving(false);
    }
  };

  const doDisconnectWordpress = async () => {
    try {
      setWpIntegrationDeleting(true);
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/publish/wordpress`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to disconnect WordPress');
      }

      setWpIntegration(null);
      setWpForm({ siteUrl: '', username: '', password: '' });
      toast({
        title: "WordPress Disconnected",
        description: "Credentials have been removed",
      });
    } catch (error) {
      console.error('Error disconnecting WordPress:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Unable to disconnect WordPress",
        variant: "destructive"
      });
    } finally {
      setWpIntegrationDeleting(false);
    }
  };

  const handleDisconnectWordpress = () => {
    if (!wpIntegration || wpIntegrationDeleting) return;
    confirmDelete("WordPress connection", doDisconnectWordpress);
  };

  const handleConfigureWordpress = useCallback(() => {
    setActiveTab('integration');
    setActiveCompanySubTab('integration');
    setOpenWordpressConnectionView(true);
  }, []);



  useEffect(() => {
      fetchGscStatus();
      fetchWordpressIntegration();
    
    // Also refresh campaign tab data if we're on campaign tab and WordPress integration might have changed
    if (activeTab === 'projects' && activeCompanySubTab === 'integration') {
      fetchCampaignTabData();
    }
  }, [activeTab, activeCompanySubTab, fetchGscStatus, fetchWordpressIntegration, fetchCampaignTabData]);

  const fetchCampaigns = useCallback(async () => {
    setCampaignsLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/campaigns`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch campaigns");
      }

      const data = await response.json();

      if (data.success) {
        setCampaigns(data.campaigns || []);
      }
    } catch (error) {
      console.error("Error fetching campaigns:", error);
      toast({
        title: "Error",
        description: "Failed to fetch campaigns",
        variant: "destructive",
      });
    } finally {
      setCampaignsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (activeTab === 'projects' || activeTab === 'overview') {
      // Fetch campaigns for both the Campaign tab and the Overview
      // so Overview can show recent campaigns/quick access.
      fetchCampaigns();
    }
  }, [activeTab, fetchCampaigns]);

  useEffect(() => {
    if (activeTab !== 'projects') return;
    if (!campaigns.length) return;
    if (selectedCampaignId !== null) return;

    const pendingTarget = sessionStorage.getItem(WORKSHEET_TARGET_KEY);
    if (!pendingTarget) return;

    const parsedTargetId = Number(pendingTarget);
    if (!Number.isFinite(parsedTargetId)) return;

    const matchedCampaign = campaigns.find((campaign) => campaign.id === parsedTargetId);
    if (!matchedCampaign) return;

    setSelectedCampaignId(matchedCampaign.id);
    sessionStorage.removeItem(WORKSHEET_TARGET_KEY);
  }, [activeTab, campaigns, selectedCampaignId]);

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newCampaignTitle.trim()) {
      toast({
        title: "Title Required",
        description: "Please enter a campaign title",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/campaigns`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("authToken")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: newCampaignTitle.trim(),
            description: newCampaignDescription.trim() || null,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create campaign");
      }

      const data = await response.json();

      if (data.success) {
        toast({
          title: "Campaign Created",
          description: "Your campaign has been created successfully",
        });
        setNewCampaignTitle("");
        setNewCampaignDescription("");
        setShowCreateCampaign(false);
        fetchCampaigns();
      }
    } catch (error) {
      console.error("Error creating project:", error);
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to create project",
        variant: "destructive",
      });
    }
  };

 const handleUpdateCampaign = async () => {
  if (!editTitle.trim()) {
    toast({
      title: "Title Required",
      description: "Please enter a Project title",
      variant: "destructive",
    });
    return;
  }

  if (editingCampaignId === null) return;

  try {
    const response = await fetch(
      `${import.meta.env.VITE_API_URL}/api/campaigns/${editingCampaignId}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("authToken")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: editTitle.trim(),
          description: editDescription.trim() || null,
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to update project");
    }

    const data = await response.json();

    if (data.success) {
      toast({
        title: "Project Updated",
        description: "Your project has been updated successfully",
      });
      setEditingCampaignId(null);
      setEditTitle("");
      setEditDescription("");
      fetchCampaigns();
    }
  } catch (error) {
    console.error("Error updating project:", error);
    toast({
      title: "Error",
      description:
        error instanceof Error
          ? error.message
          : "Failed to update project",
      variant: "destructive",
    });
  }
};


  const handleDeleteCampaign = async (campaignId: number) => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/campaigns/${campaignId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("authToken")}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to delete project");
      }

      const data = await response.json();

      if (data.success) {
        toast({
          title: "Project Deleted",
          description: "Project has been deleted successfully",
        });
        fetchCampaigns();
      }
    } catch (error) {
      console.error("Error deleting project:", error);
      toast({
        title: "Error",
        description: "Failed to delete project",
        variant: "destructive",
      });
    }
  };

  const checkDomain = async (
    parsedDomain?: ParsedDomainInput | null
  ): Promise<DomainCheckResult | null> => {
    if (!companyDomain.trim()) {
      toast({
        title: "Domain required",
        description: "Please enter a domain",
        variant: "destructive",
      });
      return null;
    }

    const normalizedDomain = parsedDomain || validateDomain(companyDomain.trim());
    if (!normalizedDomain) {
      return null;
    }

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/domain/check/${encodeURIComponent(
          normalizedDomain.hostname
        )}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("authToken")}`,
            "Content-Type": "application/json",
          },
        }
      );
      const result: DomainCheckResult = await response.json();
      return result;
    } catch (error) {
      console.error("Error checking domain:", error);
      toast({
        title: "Error",
        description: "Failed to check domain status",
        variant: "destructive",
      });
      return null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAwaitingNewDomain(false);

    const parsedDomain = validateDomain(companyDomain);
    if (!parsedDomain) {
      return;
    }

    const normalizedCompanyDomain = parsedDomain.normalizedUrl;
    setCompanyDomain(normalizedCompanyDomain);

    setIsSubmitting(true);
    setIsLoading(true);

    try {
      // Step 1: Create/update company domain
      const companyDomainResponse = await fetch(
        `${import.meta.env.VITE_API_URL}/api/user/company-domain`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("authToken")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: normalizedCompanyDomain,
            location: "Global",
          }),
        }
      );

      if (!companyDomainResponse.ok) {
        const errorData = await companyDomainResponse.json();
        throw new Error(errorData.error || "Failed to create company domain");
      }

      const companyDomainData = await companyDomainResponse.json();
      const domainId = companyDomainData.domainId;

      setIsSubmitting(false);
      setCreatedDomainId(domainId);

      // Step 2: Run validation steps (same as before)
      const steps = [...loadingSteps];

      // Step 1: Domain Validation
      steps[0] = { ...steps[0], status: "running" };
      setLoadingSteps([...steps]);

      for (let progress = 0; progress <= 100; progress += 20) {
        steps[0] = { ...steps[0], progress };
        setLoadingSteps([...steps]);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      const validationResponse = await fetch(
        `${import.meta.env.VITE_API_URL}/api/domain-validation/validate-domain`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("authToken")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ domain: normalizedCompanyDomain }),
        }
      );

      const validationResult = await validationResponse.json();

      if (!validationResult.success) {
        steps[0] = { ...steps[0], status: "failed", progress: 100 };
        setLoadingSteps([...steps]);
        toast({
          title: "Domain Validation Failed",
          description: validationResult.error,
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      steps[0] = { ...steps[0], status: "completed", progress: 100 };
      setLoadingSteps([...steps]);
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Step 2: SSL Certificate Check
      steps[1] = { ...steps[1], status: "running" };
      setLoadingSteps([...steps]);

      for (let progress = 0; progress <= 100; progress += 20) {
        steps[1] = { ...steps[1], progress };
        setLoadingSteps([...steps]);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      const sslResponse = await fetch(
        `${import.meta.env.VITE_API_URL}/api/domain-validation/check-ssl`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("authToken")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ domain: normalizedCompanyDomain }),
        }
      );

      const sslResult = await sslResponse.json();

      if (!sslResult.success) {
        steps[1] = { ...steps[1], status: "failed", progress: 100 };
        setLoadingSteps([...steps]);
        toast({
          title: "SSL Check Failed",
          description: sslResult.error,
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      steps[1] = { ...steps[1], status: "completed", progress: 100 };
      setLoadingSteps([...steps]);
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Step 3: Server Response Analysis
      steps[2] = { ...steps[2], status: "running" };
      setLoadingSteps([...steps]);

      for (let progress = 0; progress <= 100; progress += 20) {
        steps[2] = { ...steps[2], progress };
        setLoadingSteps([...steps]);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      const serverResponse = await fetch(
        `${import.meta.env.VITE_API_URL}/api/domain-validation/analyze-server`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("authToken")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ domain: normalizedCompanyDomain }),
        }
      );

      const serverResult = await serverResponse.json();

      if (!serverResult.success) {
        steps[2] = { ...steps[2], status: "failed", progress: 100 };
        setLoadingSteps([...steps]);
        toast({
          title: "Server Analysis Failed",
          description: serverResult.error,
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      steps[2] = { ...steps[2], status: "completed", progress: 100 };
      setLoadingSteps([...steps]);
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Step 4: Domain Extraction & Keyword Generation (skip geo-location for company domain)
      steps[3] = { ...steps[3], status: "running" };
      setLoadingSteps([...steps]);

      try {
        // Start domain extraction and keyword generation with SSE streaming
        const domainResponse = await fetch(
          `${import.meta.env.VITE_API_URL}/api/domain`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${localStorage.getItem("authToken")}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              url: normalizedCompanyDomain,
              location: "Global",
              customPaths: [],
              priorityUrls: [],
              priorityPaths: [],
            }),
          }
        );

        if (!domainResponse.ok) {
          throw new Error(`HTTP error! status: ${domainResponse.status}`);
        }

        const reader = domainResponse.body?.getReader();
        if (!reader) {
          throw new Error("No response body");
        }

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));

                if (data.type === "progress") {
                  const phase = data.phase;
                  const progress = data.progress;

                  // Map backend phases to frontend task
                  if (
                    phase === "domain_extraction" ||
                    phase === "keyword_generation"
                  ) {
                    setLoadingSteps((prev) => {
                      const newSteps = [...prev];
                      newSteps[3] = {
                        ...newSteps[3],
                        status: progress === 100 ? "completed" : "running",
                        progress: progress,
                      };
                      return newSteps;
                    });
                  }
                } else if (data.type === "complete") {
                  // Analysis completed - use the domainId from company domain creation
                  const finalDomainId = domainId;

                  // Wait a moment for all phases to be properly marked as completed
                  await new Promise((resolve) => setTimeout(resolve, 1000));

                  // Ensure the step is marked as completed
                  setLoadingSteps((prev) => {
                    const newSteps = [...prev];
                    newSteps[3] = {
                      ...newSteps[3],
                      status: "completed",
                      progress: 100,
                    };
                    return newSteps;
                  });

                  // Fetch domain data including context and keywords
                  try {
                    // Fetch domain with context
                    const domainResponse = await fetch(
                      `${
                        import.meta.env.VITE_API_URL
                      }/api/domain/${finalDomainId}`,
                      {
                        headers: {
                          "Content-Type": "application/json",
                          Authorization: `Bearer ${localStorage.getItem(
                            "authToken"
                          )}`,
                        },
                      }
                    );

                    if (domainResponse.ok) {
                      const domainData = await domainResponse.json();
                      setDomainContext(domainData.context || "");
                    }

                    // Fetch keywords
                    const keywordsResponse = await fetch(
                      `${
                        import.meta.env.VITE_API_URL
                      }/api/keywords/${finalDomainId}`,
                      {
                        headers: {
                          "Content-Type": "application/json",
                          Authorization: `Bearer ${localStorage.getItem(
                            "authToken"
                          )}`,
                        },
                      }
                    );

                    if (keywordsResponse.ok) {
                      const keywordsData = await keywordsResponse.json();
                      const keywordList = keywordsData.keywords || [];
                      setKeywords(keywordList);

                      // All steps completed successfully - show results
                      setIsLoading(false);
                      setShowResults(true);

                      toast({
                        title: "Domain Setup Complete",
                        description: `All validation steps completed successfully. ${keywordList.length} keywords generated.`,
                      });
                    } else {
                      setIsLoading(false);
                      setShowResults(true);
                      toast({
                        title: "Domain Setup Complete",
                        description:
                          "All validation steps completed successfully.",
                      });
                    }
                  } catch (error) {
                    console.error("Error fetching domain data:", error);
                    setIsLoading(false);
                    setShowResults(true);
                    toast({
                      title: "Domain Setup Complete",
                      description:
                        "All validation steps completed successfully.",
                    });
                  }
                  return; // Exit early on completion
                }
              } catch (parseError) {
                console.error("Error parsing SSE data:", parseError);
              }
            }
          }
        }
      } catch (error) {
        console.error("Error during domain extraction:", error);
        steps[3] = { ...steps[3], status: "failed", progress: 100 };
        setLoadingSteps([...steps]);
        toast({
          title: "Domain Extraction Failed",
          description:
            error instanceof Error
              ? error.message
              : "An error occurred during domain extraction",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }
    } catch (error) {
      console.error("Error during domain validation:", error);
      toast({
        title: "Validation Error",
        description: "An error occurred during domain validation",
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  const handleConfirmUpdateCompanyDomain = async () => {
    if (updateLoading) {
      return;
    }

    setUpdateLoading(true);

    try {
      const resp = await fetch(`${API_BASE_URL}/api/user/company-domain`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("authToken")}`,
          "Content-Type": "application/json",
        },
      });

      if (resp.ok) {
        const data = await resp.json();
        const id = data?.domain?.id;

        if (id) {
          await fetch(`${API_BASE_URL}/api/domain/${id}`, {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${localStorage.getItem("authToken")}`,
              "Content-Type": "application/json",
            },
          });
        }
      }
    } catch (_) {
      // ignore
    } finally {
      setUpdateLoading(false);
      setConfirmUpdateOpen(false);
    }

    setActiveTab("analytics");
    setActiveCompanySubTab("company-info");
    setAwaitingNewDomain(true);
    setShowResults(false);
    setCompanyDomain("");
    setDomainError("");
    setDomainContext("");
    setKeywords([]);
    setKeywordsTableData([]);
    setCreatedDomainId(null);
    setLoadingSteps([
      {
        name: "Domain Validation",
        status: "pending",
        progress: 0,
      },
      {
        name: "SSL Certificate Check",
        status: "pending",
        progress: 0,
      },
      {
        name: "Server Response Analysis",
        status: "pending",
        progress: 0,
      },
      {
        name: "Domain Extraction & Keyword Generation",
        status: "pending",
        progress: 0,
      },
    ]);
  };

  const dashboardContentRouterProps: Omit<DashboardContentRouterProps, "activeTab"> = {
    tabs,
    overview: {
      auditComplete,
      auditLoading,
      auditResult,
      campaignsCount: campaigns.length,
      companyDomain,
      hasWordpressIntegration,
      competitorOverview,
      keywordsTableData,
      normalizedDomain,
      onAuditModalOpenChange: setShowAuditModal,
      onOpenAnalytics: () => {
        setActiveTab("analytics");
        setActiveCompanySubTab("company-info");
      },
      onOpenAuditDetails: () => {
        setActiveTab("audit");
        setTimeout(() => setShowAuditModal(true), 120);
      },
      onOpenProjects: () => {
        setActiveTab("projects");
      },
      onOpenIntegration: () => {
        setActiveTab("integration");
        setActiveCompanySubTab("integration");
      },
      onRunAudit: () => handleRunAudit(companyDomain),
      onViewReport: handleViewReport,
      onVisitSite: () => {
        window.open(
          companyDomain.startsWith("http") ? companyDomain : `https://${companyDomain}`,
          "_blank"
        );
      },
      overallScore,
      showAuditModal,
    },
    company: {
      companyDomainLoading,
      isLoading,
      loadingContent: null,
      resultsContent: (
        <DomainInfoContent
          companyDomain={companyDomain}
          domainContext={domainContext}
          domainId={createdDomainId}
          keywords={keywords as any}
          loading={companyDomainLoading}
          error={companyDomainFetchError}
          onRetry={() => fetchCompanyDomain(true)}
        />
      ),
      setupContent: <DomainInfoEmpty onGoToAudit={() => setActiveTab("audit")} />,
      showResults,
    },
    audit: {
      activeChartTab,
      auditLoading,
      auditResult,
      companyDomain,
      companyDomainLoading,
      n8nResults,
      n8nStatus,
      overallScore,
      resultsRef,
      selectedMetric,
      onActiveChartTabChange: setActiveChartTab,
      onRunAudit: () => handleRunAudit(companyDomain),
      onSetupComplete: ({ domainId, normalizedUrl }) => {
        // The wizard flow already persisted the new domain server-side.
        // Surface it locally without waiting for the next /company-domain
        // round-trip so the audit chrome flips over immediately, then
        // kick off Lighthouse against the fresh URL.
        setCompanyDomain(normalizedUrl);
        setCreatedDomainId(domainId);
        setShowResults(true);
        void fetchCompanyDomain(true);
        void handleRunAudit(normalizedUrl);
      },
      onSelectedMetricChange: setSelectedMetric,
    },
    analyticsReport: {
      domainContext,
      googleAnalyticsId,
    },
    gscAnalytics: {
      activeGscSubTab,
      onConnectGsc: () => setActiveTab("integration"),
    },
    settings: {
      confirmUpdateOpen,
      updateLoading,
      activeSubTab: searchState.activeSettingsSubTab,
      onCloseConfirm: () => {
        if (!updateLoading) {
          setConfirmUpdateOpen(false);
        }
      },
      onConfirmUpdate: handleConfirmUpdateCompanyDomain,
      onOpenConfirm: () => setConfirmUpdateOpen(true),
    },
    competitorIntelligence: {
      domainId: createdDomainId?.toString() || "",
      loading: createdDomainId != null && competitorAnalysisQuery.isLoading,
      progress: 0,
      competitors: competitorIntelligenceRows.map((row) => row.domain),
      data: competitorIntelligenceRows,
      onRunAnalysis: (competitorDomain: string) => {
        console.log("Run analysis for", competitorDomain);
      },
      onRefresh: () => {
        void competitorAnalysisQuery.refetch();
      },
    },
    onMenuItemClick: (tabId: TabId, domainId?: string | number) => {
      setActiveTab(tabId);
      if (domainId) {
        setCreatedDomainId(Number(domainId));
      }
    },
  };

  return (
    <div
      className="min-h-screen overflow-x-hidden"
      style={{
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif',
        background: "#f5f5f7",
      }}
    >


      {/* Sidebar */}
      <DashboardSidebar
        activeCompanySubTab={activeCompanySubTab}
        activeTab={activeTab}
        isSidebarExpanded={isSidebarExpanded}
        onHoverChange={setIsSidebarHovered}
        onToggleSidebar={setSidebarOpen}
        onLogout={logout}
        onSelectCompanySubTab={setActiveCompanySubTab}
        onSelectCreateProject={() => {
          setOpenWordpressConnectionView(false);
          setSelectedCampaignId(null);
          setNewCampaignTitle("");
          setNewCampaignDescription("");
          setActiveTab("projects");
          setShowCreateCampaign(true);
        }}
        onSelectTab={(tabId) => {
          if (tabId === "ai-visibility") {
            navigate("/ai-visibility");
            return;
          }
          setOpenWordpressConnectionView(false);
          setActiveTab(tabId);
          if (tabId === "integration") {
            setActiveCompanySubTab("integration");
          }
          if (tabId === "analytics") {
            setActiveCompanySubTab("company-info");
          }
        }}
        showResults={showResults}
        sidebarOpen={sidebarOpen}
        tabs={tabs}
      />

      {/* Main Content */}
      <main
        className={`main-content ${!isSidebarExpanded ? "sidebar-closed" : ""}`}
      >
        {/* Content Header */}
        <DashboardHeader
          activeTab={activeTab}
          tabs={tabs}
          companyDomain={companyDomain}
          userEmail={user?.email}
          userName={user?.name}
          lastSyncedAt={gscLastSynced}
          onAddDomain={openSettingsIntegrations}
          onTabChange={setActiveTab}
        />

        {/* Content Body */}
        <div className={activeTab === 'projects' && selectedCampaignId ? "flex-1 min-h-[calc(100vh-80px)] bg-white" : "content-body"}>
          {activeTab === "analytics" || activeTab === "integration" ? (
            <AnalyticsCompanySection
              companyDomainLoading={companyDomainLoading}
              isLoading={isLoading}
              showResults={showResults}
              activeCompanySubTab={
                activeTab === "integration" ? "integration" : activeCompanySubTab
              }
              domainContext={domainContext}
              normalizedDomain={normalizedDomain}
              companyDomain={companyDomain}
              openIndex={openIndex}
              toggleSection={toggleSection}
              displayedDomainContext={displayedDomainContext}
              keywordsTableData={keywordsTableData}
              showAddKeyword={showAddKeyword}
              setShowAddKeyword={setShowAddKeyword}
              newKeyword={newKeyword}
              setNewKeyword={setNewKeyword}
              isAddingKeyword={isAddingKeyword}
              handleAddCustomKeyword={handleAddCustomKeyword}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              filters={filters}
              setFilters={setFilters}
              viewMode={viewMode}
              setViewMode={setViewMode}
              itemsPerPage={itemsPerPage}
              setItemsPerPage={setItemsPerPage}
              setCurrentPage={setCurrentPage}
              showCountByCompetition={showCountByCompetition}
              setShowCountByCompetition={setShowCountByCompetition}
              sortedKeywords={sortedKeywords}
              currentKeywords={currentKeywords}
              currentPage={currentPage}
              totalPages={totalPages}
              handlePageChange={handlePageChange}
              getPageNumbers={getPageNumbers}
              handleSort={handleSort}
              getSortIcon={getSortIcon}
              gscStatusLoading={gscStatusLoading}
              gscConnected={gscConnected}
              handleConnectGsc={handleConnectGsc}
              gscEmail={gscEmail}
              handleDisconnectGsc={handleDisconnectGsc}
              gscLastSynced={gscLastSynced}
              gscSelectedProperty={gscSelectedProperty}
              setGscSelectedProperty={setGscSelectedProperty}
              fetchGscProperties={fetchGscProperties}
              gscLoading={gscLoading}
              gscProperties={gscProperties}
              handleSelectProperty={handleSelectProperty}
              googleAnalyticsId={googleAnalyticsId}
              setGoogleAnalyticsId={setGoogleAnalyticsId}
              gaSaving={gaSaving}
              handleSaveGoogleAnalyticsId={handleSaveGoogleAnalyticsId}
              hasWordpressIntegration={hasWordpressIntegration}
              wpIntegrationLoading={wpIntegrationLoading}
              wpForm={wpForm}
              setWpForm={setWpForm}
              wpIntegration={wpIntegration}
              handleSaveWordpressIntegration={handleSaveWordpressIntegration}
              wpIntegrationSaving={wpIntegrationSaving}
              handleDisconnectWordpress={handleDisconnectWordpress}
              wpIntegrationDeleting={wpIntegrationDeleting}
              createdDomainId={createdDomainId}
              keywords={keywords as any}
              companyDomainFetchError={companyDomainFetchError}
              onRetryCompanyDomain={() => fetchCompanyDomain(true)}
              onAddDomain={openSettingsIntegrations}
              onGoToAudit={() => setActiveTab("audit")}
            />
          ) : activeTab === "projects" ? (
            <ProjectsSection
              selectedCampaignId={selectedCampaignId}
              campaigns={campaigns}
              setSelectedCampaignId={setSelectedCampaignId}
              onOpenDraftInPublish={handleOpenDraftInPublish}
              sharedPublishStatuses={sharedPublishStatuses}
              keywordsTableData={keywordsTableData}
              showCreateCampaign={showCreateCampaign}
              setShowCreateCampaign={setShowCreateCampaign}
              handleCreateCampaign={handleCreateCampaign}
              newCampaignTitle={newCampaignTitle}
              setNewCampaignTitle={setNewCampaignTitle}
              newCampaignDescription={newCampaignDescription}
              setNewCampaignDescription={setNewCampaignDescription}
              campaignLayout={campaignLayout}
              setCampaignLayout={setCampaignLayout}
              openSortMenu={openSortMenu}
              setOpenSortMenu={setOpenSortMenu}
              sortBy={sortBy}
              setSortBy={setSortBy}
              activeSection={activeSection}
              setActiveSection={setActiveSection}
              campaignsLoading={campaignsLoading}
              campaignTabDataLoading={campaignTabDataLoading}
              favouriteIds={favouriteIds}
              editingCampaignId={editingCampaignId}
              toggleFavourite={toggleFavourite}
              openMenuId={openMenuId}
              setOpenMenuId={setOpenMenuId}
              setEditingCampaignId={setEditingCampaignId}
              setEditTitle={setEditTitle}
              setEditDescription={setEditDescription}
              setShowEditModal={setShowEditModal}
              confirmDelete={confirmDelete}
              handleDeleteCampaign={handleDeleteCampaign}
              showEditModal={showEditModal}
              handleUpdateCampaign={handleUpdateCampaign}
              editTitle={editTitle}
            />
          ) : (
            <DashboardContentRouter
              activeTab={activeTab}
              {...dashboardContentRouterProps}
            />
          )}
        {showDeleteModal && (
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-xl shadow-xl w-[90%] max-w-sm">
              <h2 className="text-lg font-medium text-gray-800">Delete {deleteLabel}?</h2>
              <p className="text-sm text-gray-500 mt-2">
                Are you sure you want to delete this {deleteLabel}?
              </p>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="px-4 py-2 rounded-lg text-sm bg-gray-100 hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (deleteAction) deleteAction();
                    setShowDeleteModal(false);
                  }}
                  className="px-4 py-2 rounded-lg text-sm bg-black text-white hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
        </div>
      </main>

      {/* Worksheet draft preview — viewport-pinned overlay hosting the legacy
          PublishExperience in embedded mode. Uses `position: fixed` with a
          sidebar-width left offset so it covers the working area at exactly
          viewport height, regardless of how tall the underlying worksheet
          page content is. */}
      <WorksheetDraftOverlay
        draftId={draftOverlayId}
        open={draftOverlayId !== null}
        onClose={handleCloseDraftOverlay}
        sidebarExpanded={isSidebarExpanded}
        companyDomain={companyDomain}
        domainContext={domainContext}
        keywordsTableData={keywordsTableData}
        hasWordpressIntegration={hasWordpressIntegration}
        wpIntegration={wpIntegration}
        onRefreshWordpressIntegration={async () => {
          await fetchWordpressIntegration();
        }}
        publishingPageIds={publishingPageIds}
        setPublishingPageIds={setPublishingPageIds}
        draftToPageMap={draftToPageMap}
        setDraftToPageMap={setDraftToPageMap}
        draftStatuses={draftStatuses}
        setDraftStatuses={setDraftStatuses}
        sharedPublishStatuses={sharedPublishStatuses}
      />
    </div>
  );
};

export default SidebarDashboard;

