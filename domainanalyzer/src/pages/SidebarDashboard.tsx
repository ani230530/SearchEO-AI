import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, BarChart3, Settings, User, LogOut, Menu, X, Building, Globe, CheckCircle, Info, Plug, FileText, ChevronDown, ChevronRight, ChevronLeft, Megaphone, Plus, ChevronUp, Trash2, Sparkles, ArrowLeft, Search, TrendingUp, Grid3X3, List, ArrowUpDown, Loader2, AlertCircle, Check, Send, RefreshCw, ClipboardList } from 'lucide-react';
import GSCAnalyticsView from '@/components/gsc/GSCAnalyticsView';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { maskDomainId } from '@/lib/domainUtils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import CampaignGraph from '@/components/CampaignGraph';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import PublishExperience from '@/features/publish/PublishExperience';
import { CompanyInfoSkeleton } from '@/components/dashboard/CompanyInfoSkeleton';
import { KeywordTableItem } from '@/types/keywords';
import { WordpressIntegration } from '@/types/publish';
import Profile from './Profile';
import {
  AuditRadarChart,
  AuditBarChart,
  AuditGaugeChart,
  AuditScoreDistribution,
  AuditLineChart,
  OverallScoreGauge,
} from '@/components/audit/AuditCharts';

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3002";

type TabId = 'overview' | 'analytics' | 'campaign' | 'publish' | 'settings' | 'profile' | 'ai-checker' | 'gsc-analytics' | 'audit';
type CompanySubTabId = 'company-info' | 'integration';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
}

interface DomainCheckResult {
  exists: boolean;
  domainId?: number;
  url?: string;
  hasCurrentAnalysis?: boolean;
  lastAnalyzed?: string;
}

// Campaign Structure Types
interface Keyword {
  id: number;
  term: string;
  volume: number;
  difficulty: string;
  intent?: string | null;
  cpc?: number;
  aiMetadata?: any; // For storing isPrimary/isLongtail flags
}

interface SubPage {
  id: number;
  title: string;
  description?: string | null;
  summary?: string | null;
  keywords: Keyword[];
}

interface PillarPage {
  id: number;
  title: string;
  description?: string | null;
  summary?: string | null;
  keywords: Keyword[];
}

interface Topic {
  id: number;
  title: string;
  description?: string | null;
  status?: string;
  source?: string;
  keywords?: Keyword[];
  pillarPage: PillarPage | null;
  subPages: SubPage[];
}

interface CampaignStructure {
  topics: Topic[];
}

type GenerationPageStatus = {
  jobId: string;
  pageId: number;
  pageType: 'pillar' | 'subpage';
  status: 'pending' | 'generating' | 'completed' | 'failed' | 'published';
  draftId?: number;
  progress?: number;
  primaryKeyword?: string;
  hasHtml?: boolean;
  updatedAt?: string;
  error?: string | null;
  wordpressUrl?: string | null;
};

type DraftPreview = {
  htmlContent: string;
  title?: string;
  metaDescription?: string;
  slug?: string;
  featuredImage?: string;
  primaryKeyword?: string;
};

type DraftStatusRecord = {
  pageId: number;
  pageType: string;
  status: string;
  draftId?: number;
  progress?: number;
  primaryKeyword?: string;
  jobId?: string;
  hasHtml?: boolean;
  updatedAt?: string;
  error?: string | null;
  wordpressUrl?: string | null;
};

const summarizeDomainContext = (input: string, maxLines = 6, maxChars = 800) => {
  if (!input) return '';
  const normalized = input.replace(/\r\n/g, '\n');
  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const limited = lines.slice(0, maxLines).join('\n');
  if (limited.length <= maxChars) {
    return limited;
  }
  return `${limited.slice(0, maxChars)}…`;
};

const ButtonSpinner = () => (
  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
      fill="none"
    />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8v4l3-3-3-3v4A8 8 0 104 12z"
    />
  </svg>
);

const IntegrationSkeleton = () => (
  <div className="max-w-4xl mx-auto space-y-6 animate-pulse">
    <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gray-200 rounded-xl" />
          <div className="space-y-2">
            <div className="h-5 w-32 bg-gray-200 rounded-full" />
            <div className="h-4 w-48 bg-gray-100 rounded-full" />
          </div>
        </div>
        <div className="h-4 w-20 bg-gray-100 rounded-full" />
      </div>
      <div className="h-4 w-40 bg-gray-100 rounded-full mt-6" />
    </div>
    <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
      <div className="h-5 w-36 bg-gray-200 rounded-full mb-4" />
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, idx) => (
          <div key={idx} className="p-4 rounded-2xl border border-gray-100">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <div className="h-4 w-48 bg-gray-200 rounded-full" />
                <div className="h-3 w-32 bg-gray-100 rounded-full" />
              </div>
              <div className="w-8 h-8 bg-gray-100 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const tooltipInfo = {
  Performance: "Measures how fast your domain loads and responds.",
  SEO: "Shows how well your domain is optimized for search engines.",
  Accessibility: "Indicates how usable the site is for all users, including disabilities.",
  "Best Practices": "Checks if your site follows recommended web development standards.",
  PWA: "Shows how well your domain qualifies as a Progressive Web App.",
};

const SidebarDashboard = () => {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [activeCompanySubTab, setActiveCompanySubTab] =
    useState<CompanySubTabId>("company-info");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const [companyDomain, setCompanyDomain] = useState("");
  const [companyDomainLoading, setCompanyDomainLoading] = useState(false);
  const [domainError, setDomainError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [auditData, setAuditData] = useState<any>(null);
const [auditLoading, setAuditLoading] = useState(false);
const [auditError, setAuditError] = useState<string | null>(null);
const [auditResult, setAuditResult] = useState<any>(null);
const [auditComplete, setAuditComplete] = useState(false);
const [activeChartTab, setActiveChartTab] = useState<'overview' | 'comparison' | 'distribution'>('overview');
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
  const [showCountByCompetition, setShowCountByCompetition] = useState<
    Record<string, number>
  >({
    Low: 8,
    Medium: 8,
    High: 8,
  });
  const [gscConnected, setGscConnected] = useState(false);
  const [gscAnalysis, setGscAnalysis] = useState(null);
const [improvedContent, setImprovedContent] = useState("");
  const [gscEmail, setGscEmail] = useState<string>("");
  const [gscSelectedProperty, setGscSelectedProperty] = useState<string>("");
  const [gscProperties, setGscProperties] = useState<
    Array<{ siteUrl: string; permissionLevel: string }>
  >([]);
  const [gscLoading, setGscLoading] = useState(false);
  const [gscStatusLoading, setGscStatusLoading] = useState(false);
  const [gscLastSynced, setGscLastSynced] = useState<Date | null>(null);
  const [wpIntegration, setWpIntegration] = useState<WordpressIntegration | null>(null);
  const [wpIntegrationLoading, setWpIntegrationLoading] = useState(false);
  const [wpIntegrationSaving, setWpIntegrationSaving] = useState(false);
  const [wpIntegrationDeleting, setWpIntegrationDeleting] = useState(false);
  const [wpForm, setWpForm] = useState({ siteUrl: '', username: '', password: '' });
  const [campaigns, setCampaigns] = useState<Array<{ id: number; title: string; description: string | null; createdAt: string; updatedAt: string }>>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [campaignTabDataLoading, setCampaignTabDataLoading] = useState(false);
  const [showCreateCampaign, setShowCreateCampaign] = useState(false);
  const [newCampaignTitle, setNewCampaignTitle] = useState("");
  const [newCampaignDescription, setNewCampaignDescription] = useState("");
  const [expandedCampaignId, setExpandedCampaignId] = useState<number | null>(
    null
  );
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(
    null
  );
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isSidebarExpanded = sidebarOpen || isSidebarHovered;
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


  useEffect(() => {
    if (sidebarOpen) {
      setIsSidebarHovered(false);
    }
  }, [sidebarOpen]);

  const tabs: Tab[] = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="h-5 w-5" /> },
    { id: 'analytics', label: 'Company', icon: <Building className="h-5 w-5" /> },
    { id: 'campaign', label: 'Campaign', icon: <Megaphone className="h-5 w-5" /> },
    { id: 'publish', label: 'Publish', icon: <Send className="h-5 w-5" /> },
    { id: 'gsc-analytics', label: 'GSC Analytics', icon: <BarChart3 className="h-5 w-5" /> },
    { id: 'audit', label: 'Audit', icon: <ClipboardList className="h-5 w-5" /> },
    { id: 'settings', label: 'Settings', icon: <Settings className="h-5 w-5" /> },
    { id: 'profile', label: 'Profile', icon: <User className="h-5 w-5" /> },
    { id: 'ai-checker', label: 'AI Checker', icon: <Sparkles className="h-5 w-5" /> },
  ];

  const validateDomain = (value: string) => {
    const domainRegex =
      /^(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;
    if (!value) {
      setDomainError("Domain is required");
      return false;
    }
    if (!domainRegex.test(value)) {
      setDomainError("Please enter a valid domain (e.g., example.com)");
      return false;
    }
    setDomainError("");
    return true;
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



// Fetch existing audit for company domain
const fetchAudit = async () => {
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
          pwa: data.audit.pwa,
          audits: data.audit.audits,
          screenshot: data.audit.screenshotUrl || null,
        });
        setAuditData(data.audit);
      }
    }
  } catch (err) {
    console.error('Error fetching audit:', err);
  }
};

//Handle Run Audit
const handleRunAudit = async (url?: string) => {
  const token = localStorage.getItem("authToken");   

  if (!url || !token) {
    console.error("Missing URL or token");
    return;
  }

  setAuditLoading(true);
  setAuditResult(null);

  try {
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
      throw new Error(errorData.error || 'Failed to run audit');
    }

    const data = await resp.json();
    if (data.success) {
      setAuditResult(data.normalized);
      setAuditData(data.audit);
      setAuditComplete(true);
      setTimeout(() => setAuditComplete(false), 3500);
    }
  } catch (err) {
    console.error(err);
    toast({
      title: 'Audit Failed',
      description: err instanceof Error ? err.message : 'Failed to run audit',
      variant: 'destructive',
    });
  } finally {
    setAuditLoading(false);
  }
};



  const handleDomainChange = (value: string) => {
    setCompanyDomain(value);
    if (value) validateDomain(value);
  };

  // Handle URL query parameters for tab navigation (e.g., from OAuth callback)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get("tab");
    const subtabParam = urlParams.get("subtab");

    if (tabParam === 'ai-checker') {
      navigate('/ai-checker');
    } else if (tabParam && ['overview', 'analytics', 'campaign', 'publish', 'settings', 'profile', 'gsc-analytics'].includes(tabParam)) {
      setActiveTab(tabParam as TabId);
    }

    if (subtabParam && ["company-info", "integration"].includes(subtabParam)) {
      setActiveCompanySubTab(subtabParam as CompanySubTabId);
    }
  }, [navigate]);


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

  const fetchCompanyDomain = useCallback(async () => {
    try {
      setCompanyDomainLoading(true);
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/user/company-domain`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("authToken")}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch company domain");
      }

      const data = await response.json();

      if (data.success && data.domain) {
        // Company domain exists - show results
        setCompanyDomain(data.domain.url);
        setDomainContext(data.domain.context || "");
        setKeywords(data.keywords || []);
        setCreatedDomainId(data.domain.id);
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
      // On error, show form
      setShowResults(false);
    } finally {
      setCompanyDomainLoading(false);
    }
  }, []);

  // Fetch all campaign tab data in parallel when campaign tab is active
  const fetchCampaignTabData = useCallback(async () => {
    if (activeTab !== 'campaign') return;
    
    setCampaignTabDataLoading(true);
    try {
      // Fetch all required data in parallel
      const [domainResponse, wpResponse] = await Promise.all([
        fetch(`${import.meta.env.VITE_API_URL}/api/user/company-domain`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
            'Content-Type': 'application/json',
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
        if (domainData.success && domainData.domain) {
          setCompanyDomain(domainData.domain.url);
          setDomainContext(domainData.domain.context || '');
          setKeywords(domainData.keywords || []);
          setCreatedDomainId(domainData.domain.id);
        } else {
          setCompanyDomain('');
          setDomainContext('');
          setKeywords([]);
          setCreatedDomainId(null);
        }
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
      // Don't show toast for campaign tab - it's background loading
    } finally {
      setCampaignTabDataLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'campaign') {
      fetchCampaignTabData();
    }
  }, [activeTab, fetchCampaignTabData]);

  useEffect(() => {
    if (activeTab === 'analytics' || activeTab === 'publish') {
      fetchCompanyDomain();
    } else {
      setCompanyDomainLoading(false);
    }
  }, [activeTab, fetchCompanyDomain]);

  // Fetch audit when audit tab is active
  useEffect(() => {
    if (activeTab === 'audit') {
      fetchAudit();
    }
  }, [activeTab]);

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

      const tableKeywords: KeywordTableItem[] = keywords.map((kw) => ({
        id: kw.id.toString(),
        keyword: kw.term,
        intent: kw.intent || determineIntent(kw.term),
        volume: kw.volume,
        kd: kw.difficulty === "High" ? 75 : kw.difficulty === "Low" ? 25 : 50,
        competition:
          kw.difficulty === "High"
            ? "High"
            : kw.difficulty === "Low"
            ? "Low"
            : "Medium",
        cpc: kw.cpc || 0,
        organic: Math.floor(kw.volume * 0.1),
        paid: Math.floor(kw.volume * 0.05),
        trend: "Stable",
        position: 0,
        url: `https://${companyDomain}/${kw.term
          .toLowerCase()
          .replace(/\s+/g, "-")}`,
        updated: new Date().toISOString().split("T")[0],
        selected: false,
        isCustom: customSet.has(kw.term.toLowerCase()),
      }));

      setKeywordsTableData(tableKeywords);
    } else {
      setKeywordsTableData([]);
    }
  }, [keywords, createdDomainId, companyDomain]);

  // Filter and sort keywords
  const filteredKeywords = React.useMemo(() => {
    return keywordsTableData.filter((keyword) => {
      const matchesSearch = keyword.keyword
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
      const matchesCompetition =
        !filters.competition || keyword.competition === filters.competition;
      const matchesIntent =
        !filters.intent || keyword.intent === filters.intent;
      return matchesSearch && matchesCompetition && matchesIntent;
    });
  }, [keywordsTableData, searchTerm, filters.competition, filters.intent]);

  const sortedKeywords = React.useMemo(() => {
    const sortableKeywords = [...filteredKeywords];
    if (sortConfig !== null) {
      sortableKeywords.sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];

        if (typeof aValue === "number" && typeof bValue === "number") {
          return sortConfig.direction === "asc"
            ? aValue - bValue
            : bValue - aValue;
        }

        const aStr = String(aValue).toLowerCase();
        const bStr = String(bValue).toLowerCase();

        if (aStr < bStr) {
          return sortConfig.direction === "asc" ? -1 : 1;
        }
        if (aStr > bStr) {
          return sortConfig.direction === "asc" ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableKeywords;
  }, [filteredKeywords, sortConfig]);

  // Pagination
  const totalPages = Math.max(
    1,
    Math.ceil(sortedKeywords.length / itemsPerPage)
  );
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentKeywords = sortedKeywords.slice(startIndex, endIndex);

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
      const totalPagesCalc = Math.max(
        1,
        Math.ceil(sortedKeywords.length / itemsPerPage)
      );
      if (page >= 1 && page <= totalPagesCalc) {
        setCurrentPage(page);
      }
    },
    [sortedKeywords.length, itemsPerPage]
  );

  const getPageNumbers = useCallback(() => {
    const pages = [];
    const maxVisiblePages = 5;

    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 4; i++) {
          pages.push(i);
        }
        pages.push("...");
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1);
        pages.push("...");
        for (let i = totalPages - 3; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        pages.push(1);
        pages.push("...");
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(i);
        }
        pages.push("...");
        pages.push(totalPages);
      }
    }

    return pages;
  }, [totalPages, currentPage]);

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
        description: "Failed to fetch Search Console properties",
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
      
    if (activeTab === 'analytics' && activeCompanySubTab === 'integration') {
      if (success === 'true') {
      toast({
          title: "Connected Successfully",
          description: "Google Search Console has been connected",
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
        description: "Failed to initiate Google Search Console connection",
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
          description: "Search Console property has been selected",
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
          description: "Google Search Console has been disconnected",
        });
      }
    } catch (error) {
      console.error("Error disconnecting GSC:", error);
      toast({
        title: "Error",
        description: "Failed to disconnect Google Search Console",
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
      // Only show toast if we're on publish tab, not for background loading in campaign tab
      if (activeTab === 'publish') {
      toast({
        title: "WordPress",
        description: "Unable to load WordPress integration details",
        variant: "destructive"
      });
      }
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

  const handleDisconnectWordpress = async () => {
    if (!wpIntegration || wpIntegrationDeleting) return;
    if (!confirm('Disconnect WordPress publishing? Stored credentials will be removed.')) {
      return;
    }

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

  const handleConfigureWordpress = useCallback(() => {
    setActiveTab('analytics');
    setActiveCompanySubTab('integration');
  }, []);



  useEffect(() => {
    if (activeTab === 'analytics' && activeCompanySubTab === 'integration') {
      fetchGscStatus();
      fetchWordpressIntegration();
    }
    // Also refresh campaign tab data if we're on campaign tab and WordPress integration might have changed
    if (activeTab === 'campaign' && activeCompanySubTab === 'integration') {
      fetchCampaignTabData();
    }
  }, [activeTab, activeCompanySubTab, fetchGscStatus, fetchWordpressIntegration, fetchCampaignTabData]);

  useEffect(() => {
    if (activeTab === 'publish') {
      fetchWordpressIntegration();
    }
  }, [activeTab, fetchWordpressIntegration]);

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
    if (activeTab === 'campaign') {
      fetchCampaigns();
    }
  }, [activeTab, fetchCampaigns]);

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
      console.error("Error creating campaign:", error);
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to create campaign",
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
        throw new Error("Failed to delete campaign");
      }

      const data = await response.json();

      if (data.success) {
        toast({
          title: "Campaign Deleted",
          description: "Campaign has been deleted successfully",
        });
        fetchCampaigns();
        if (expandedCampaignId === campaignId) {
          setExpandedCampaignId(null);
        }
      }
    } catch (error) {
      console.error("Error deleting campaign:", error);
      toast({
        title: "Error",
        description: "Failed to delete campaign",
        variant: "destructive",
      });
    }
  };

  const checkDomain = async (): Promise<DomainCheckResult | null> => {
    if (!companyDomain.trim()) {
      toast({
        title: "Domain required",
        description: "Please enter a domain",
        variant: "destructive",
      });
      return null;
    }

    if (!validateDomain(companyDomain.trim())) {
      return null;
    }

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/domain/check/${encodeURIComponent(
          companyDomain.trim()
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

    if (!validateDomain(companyDomain)) {
      return;
    }

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
            url: companyDomain,
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
          body: JSON.stringify({ domain: companyDomain }),
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
          body: JSON.stringify({ domain: companyDomain }),
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
          body: JSON.stringify({ domain: companyDomain }),
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
              url: companyDomain,
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

  return (
    <div
      className="min-h-screen overflow-x-hidden"
      style={{
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif',
        background: "#f5f5f7",
      }}
    >
      <style>{`
        .sidebar {
          position: fixed;
          left: 0;
          top: 0;
          height: 100vh;
          width: 280px;
          background: rgba(255, 255, 255, 0.72);
          backdrop-filter: saturate(180%) blur(20px);
          -webkit-backdrop-filter: saturate(180%) blur(20px);
          border-right: 0.5px solid rgba(0, 0, 0, 0.1);
          z-index: 50;
          transition: width 0.3s ease, transform 0.3s ease;
          overflow-y: auto;
          transform: translateX(0);
        }

        .sidebar.open {
          width: 280px;
        }

        .sidebar.closed {
          width: 78px;
        }

        .sidebar-header {
          padding: calc(env(safe-area-inset-top) + 20px) 20px 20px 20px;
          border-bottom: 0.5px solid rgba(0, 0, 0, 0.1);
        }

        .sidebar-content {
          padding: 20px 12px;
        }

        .sidebar.closed .sidebar-content {
          padding: 20px 8px;
        }

        .sidebar-tab {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          margin-bottom: 4px;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
          color: #1d1d1f;
          font-size: 15px;
          font-weight: 400;
          letter-spacing: -0.022em;
          background: transparent;
          border: none;
          width: 100%;
          text-align: left;
        }

        .sidebar-tab:hover {
          background: rgba(0, 0, 0, 0.05);
        }

        .sidebar-tab.active {
          background: rgba(0, 122, 255, 0.1);
          color: #007AFF;
        }

        .sidebar-tab.active .sidebar-tab-icon {
          color: #007AFF;
        }

        .sidebar-tab.ai-checker-tab {
          margin-top: 12px;
          background: linear-gradient(120deg, rgba(255, 182, 193, 0.25), rgba(173, 216, 230, 0.25));
          border: 1px solid rgba(255, 255, 255, 0.6);
          color: #b83280;
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.4);
        }

        .sidebar-tab.ai-checker-tab .sidebar-tab-icon {
          color: #b83280;
        }

        .sidebar-tab.ai-checker-tab:hover {
          background: linear-gradient(120deg, rgba(255, 182, 193, 0.4), rgba(173, 216, 230, 0.4));
        }

        .ai-checker-badge {
          margin-left: auto;
          font-size: 11px;
          font-weight: 600;
          padding: 4px 8px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.6);
          color: #b83280;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .sidebar-tab-icon {
          color: #86868b;
          transition: color 0.2s ease;
          display: inline-flex;
        }

        .sidebar-tab-label {
          white-space: nowrap;
          transition: opacity 0.2s ease;
        }

        .sidebar.closed .sidebar-tab {
          justify-content: center;
          gap: 0;
        }

        .sidebar.closed .sidebar-tab-label,
        .sidebar.closed .sidebar-tab-chevron,
        .sidebar.closed .sidebar-subtabs,
        .sidebar.closed .sidebar-title,
        .sidebar.closed .sidebar-logout-label,
        .sidebar.closed .ai-checker-badge {
          display: none;
        }

        .sidebar.closed .sidebar-tab-icon {
          margin-right: 0;
        }

        .main-content {
          margin-left: 280px;
          transition: margin-left 0.3s ease;
          min-height: 100vh;
        }

        .main-content.sidebar-closed {
          margin-left: 96px;
        }

        .content-header {
          position: sticky;
          top: 0;
          padding: calc(env(safe-area-inset-top) + 12px) 24px 12px 24px;
          background: rgba(255, 255, 255, 0.72);
          backdrop-filter: saturate(180%) blur(20px);
          -webkit-backdrop-filter: saturate(180%) blur(20px);
          border-bottom: 0.5px solid rgba(0, 0, 0, 0.1);
          z-index: 40;
        }

        .content-body {
          padding: 24px;
          background: #f5f5f7;
          min-height: calc(100vh - 80px);
        }

        .mobile-sidebar-toggle {
          display: none;
          position: fixed;
          top: calc(env(safe-area-inset-top) + 12px);
          left: 16px;
          z-index: 60;
          background: rgba(255, 255, 255, 0.8);
          backdrop-filter: saturate(180%) blur(20px);
          -webkit-backdrop-filter: saturate(180%) blur(20px);
          border: 0.5px solid rgba(0, 0, 0, 0.1);
          border-radius: 10px;
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .mobile-sidebar-toggle:hover {
          background: rgba(255, 255, 255, 0.9);
        }

        .desktop-sidebar-toggle {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: 10px;
          border: 0.5px solid rgba(0, 0, 0, 0.1);
          background: rgba(255, 255, 255, 0.7);
          backdrop-filter: saturate(180%) blur(20px);
          -webkit-backdrop-filter: saturate(180%) blur(20px);
          cursor: pointer;
          transition: background 0.2s ease;
        }

        .desktop-sidebar-toggle:hover {
          background: rgba(255, 255, 255, 0.9);
        }

        .mobile-overlay {
          display: none;
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.3);
          z-index: 45;
          opacity: 0;
          transition: opacity 0.3s ease;
        }

        .mobile-overlay.active {
          opacity: 1;
        }

        @media (max-width: 768px) {
          .sidebar {
            width: 260px;
            transform: translateX(-100%);
          }

          .sidebar.open {
            transform: translateX(0);
          }

          .sidebar.closed {
            width: 260px;
            transform: translateX(-100%);
          }

          .main-content {
            margin-left: 0;
          }

          .main-content.sidebar-closed {
            margin-left: 0;
          }

          .mobile-sidebar-toggle {
            display: flex;
          }

          .mobile-overlay {
            display: block;
          }

          .mobile-overlay.active {
            opacity: 1;
          }
          .desktop-sidebar-toggle {
            display: none;
          }
        }

        @media (max-width: 640px) {
          .content-header {
            padding: calc(env(safe-area-inset-top) + 10px) 16px 10px 16px;
          }

          .content-body {
            padding: 16px;
          }

          .sidebar {
            width: 260px;
          }
        }
      `}</style>

      {/* Sidebar */}
      <aside
        className={`sidebar ${isSidebarExpanded ? "open" : "closed"}`}
        onMouseEnter={() => {
          if (!sidebarOpen) {
            setIsSidebarHovered(true);
          }
        }}
        onMouseLeave={() => {
          if (!sidebarOpen) {
            setIsSidebarHovered(false);
          }
        }}
      >
        <div className="sidebar-header">
          <div className="flex items-center justify-between mb-4">
            <h1
              className="sidebar-title"
              style={{
                fontSize: "24px",
                fontWeight: "400",
                letterSpacing: "-0.022em",
                color: "#1d1d1f",
                margin: "0",
              }}
            >
              Dashboard
            </h1>
            <button
              onClick={() => setSidebarOpen((prev) => !prev)}
              aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
              style={{
                background: "transparent",
                border: "none",
                padding: "4px",
                borderRadius: "6px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "background 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(0, 0, 0, 0.05)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              {sidebarOpen ? (
                <ChevronLeft className="h-5 w-5 text-gray-600" />
              ) : (
                <Menu className="h-5 w-5 text-gray-600" />
              )}
            </button>
          </div>
        </div>

        <div className="sidebar-content">
          <nav className="space-y-2">
            {tabs.map((tab) => (
              <div key={tab.id}>
                <button
                  className={`sidebar-tab ${
                    activeTab === tab.id ? "active" : ""
                  } ${tab.id === "ai-checker" ? "ai-checker-tab" : ""}`}
                  onClick={() => {
                    if (tab.id === "ai-checker") {
                      navigate("/ai-checker");
                      return;
                    }
                    setActiveTab(tab.id);
                    if (tab.id === "analytics" && !showResults) {
                      setActiveCompanySubTab("company-info");
                    }
                  }}
                >
                  <span className="sidebar-tab-icon">{tab.icon}</span>
                  <span className="sidebar-tab-label">{tab.label}</span>
                  {tab.id === "analytics" &&
                    activeTab === "analytics" &&
                    showResults && (
                      <ChevronDown className="h-4 w-4 ml-auto sidebar-tab-chevron" />
                    )}
                </button>
                {/* Show sub-tabs when Company is active and results are shown */}
                {tab.id === "analytics" &&
                  activeTab === "analytics" &&
                  showResults && (
                    <div className="ml-8 mt-1 space-y-1 sidebar-subtabs">
                      <button
                        onClick={() => setActiveCompanySubTab("company-info")}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-light transition-all duration-200 ${
                          activeCompanySubTab === "company-info"
                            ? "bg-blue-50 text-blue-700"
                            : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                        }`}
                      >
                        <FileText className="h-4 w-4" />
                        <span>Company info</span>
                        {activeCompanySubTab === "company-info" && (
                          <ChevronDown className="h-3 w-3 ml-auto" />
                        )}
                      </button>
                      <button
                        onClick={() => setActiveCompanySubTab("integration")}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-light transition-all duration-200 ${
                          activeCompanySubTab === "integration"
                            ? "bg-gray-100 text-gray-900 rounded-lg"
                            : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                        }`}
                      >
                        <Plug className="h-4 w-4" />
                        <span>Integration</span>
                      </button>
                    </div>
                  )}
              </div>
            ))}
          </nav>

          <div
            style={{
              marginTop: "32px",
              paddingTop: "32px",
              borderTop: "0.5px solid rgba(0, 0, 0, 0.1)",
            }}
          >
            <button
              onClick={logout}
              className="sidebar-tab"
              style={{ color: "#FF3B30" }}
            >
              <LogOut
                className="h-5 w-5 sidebar-tab-icon"
                style={{ color: "#FF3B30" }}
              />
              <span className="sidebar-tab-label sidebar-logout-label">
                Logout
              </span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main
        className={`main-content ${!isSidebarExpanded ? "sidebar-closed" : ""}`}
      >
        {/* Content Header */}
        <header className="content-header">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                className="desktop-sidebar-toggle"
                onClick={() => setSidebarOpen((prev) => !prev)}
                aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
              >
                {sidebarOpen ? (
                  <ChevronLeft className="h-4 w-4 text-gray-700" />
                ) : (
                  <Menu className="h-4 w-4 text-gray-700" />
                )}
              </button>
              <h2
                style={{
                  fontSize: "28px",
                  fontWeight: "400",
                  letterSpacing: "-0.022em",
                  color: "#1d1d1f",
                  margin: "0",
                }}
              >
                {tabs.find((t) => t.id === activeTab)?.label || "Dashboard"}
              </h2>
            </div>
            {user && (
              <div className="flex items-center gap-3">
                <div
                  style={{
                    background: "rgba(0, 122, 255, 0.1)",
                    color: "#007AFF",
                    padding: "6px 12px",
                    borderRadius: "12px",
                    fontSize: "14px",
                    fontWeight: "500",
                  }}
                >
                  {user.email}
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Content Body */}
        <div className="content-body">
          {activeTab === "analytics" ? (
            companyDomainLoading ? (
              <CompanyInfoSkeleton />
            ) : showResults ? (
              <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
                {/* Company Domain Heading */}
                <div className="text-center mb-12 flex flex-col items-center gap-4">
                  <div className="inline-flex items-center gap-3 bg-blue-50 border border-blue-200 text-blue-700 px-5 py-3 rounded-2xl shadow-sm">
                    <img
                      src={`https://www.google.com/s2/favicons?domain=${companyDomain}&sz=64`}
                      srcSet={`https://www.google.com/s2/favicons?domain=${companyDomain}&sz=64 1x, https://www.google.com/s2/favicons?domain=${companyDomain}&sz=128 2x, https://www.google.com/s2/favicons?domain=${companyDomain}&sz=256 4x`}
                      sizes="32px"
                      alt="favicon"
                      width={32}
                      height={32}
                      className="w-8 h-8 rounded-md"
                      onError={(e) => {
                        e.currentTarget.src = `https://logo.clearbit.com/${companyDomain}`;
                        e.currentTarget.srcset = '';
                      }}
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

                {/* Company Info Tab Content */}
                {activeCompanySubTab === "company-info" && (
                  <div>
                    {/* Domain Context - Centered and Wide */}
                    {domainContext && (
                      <div className="mb-16">
                        {(() => {
                          const full = domainContext;
                          const headers = [
                            "BUSINESS MODEL ANALYSIS",
                            "TARGET AUDIENCE PROFILING",
                            "VALUE PROPOSITION & POSITIONING",
                            "SEO & CONTENT STRATEGY INSIGHTS",
                            "COMPETITIVE INTELLIGENCE",
                            "MARKET DYNAMICS",
                            "LOCATION-BASED SEO ANALYSIS",
                            "SEO OPPORTUNITY ANALYSIS",
                          ];
                          const normalize = (s: string) =>
                            s
                              .replace(/\*\*/g, "")
                              .replace(/^\s*\d+\.\s*/, "")
                              .replace(/[:]+$/, "")
                              .trim()
                              .toUpperCase();
                          const target = headers.map((h) => normalize(h));
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
                          const sections = headers.map((h) => {
                            const key = normalize(h);
                            return {
                              title: h,
                              content: (contentMap[key] || []).join("\n").trim(),
                            };
                          });
                          if (sections.some((s) => s.content.length > 0)) {
                            let carouselEl: HTMLDivElement | null = null;
                            return (
                              <div className="relative">
                                <div className="absolute left-0 top-1/2 -translate-y-1/2 z-10">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (carouselEl) {
                                        const w = carouselEl.clientWidth;
                                        carouselEl.scrollBy({ left: -w, behavior: "smooth" });
                                      }
                                    }}
                                    className="px-3 py-2 rounded-full bg-white/70 hover:bg-white border border-gray-200 shadow-sm text-gray-700"
                                    aria-label="Previous"
                                  >
                                    ←
                                  </button>
                                </div>
                                <div className="absolute right-0 top-1/2 -translate-y-1/2 z-10">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (carouselEl) {
                                        const w = carouselEl.clientWidth;
                                        carouselEl.scrollBy({ left: w, behavior: "smooth" });
                                      }
                                    }}
                                    className="px-3 py-2 rounded-full bg-white/70 hover:bg-white border border-gray-200 shadow-sm text-gray-700"
                                    aria-label="Next"
                                  >
                                    →
                                  </button>
                                </div>
                                <div
                                  className="mx-auto w-full max-w-[900px] px-6"
                                >
                                  <div
                                    ref={(el) => {
                                      carouselEl = el;
                                    }}
                                    className="flex gap-0 overflow-x-hidden snap-x snap-mandatory scroll-smooth pb-2"
                                  >
                                    {sections.map((sec, idx) => (
                                      <div
                                        key={sec.title}
                                        className="min-w-full snap-start rounded-3xl border border-gray-100 bg-white p-8 shadow-sm"
                                      >
                                        <h3 className="text-xl sm:text-2xl font-light tracking-tight text-gray-900 mb-4 text-center">
                                          {sec.title}
                                        </h3>
                                        <div className="prose prose-sm prose-gray max-w-none">
                                          {sec.content ? (
                                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                              {sec.content}
                                            </ReactMarkdown>
                                          ) : (
                                            <p className="text-gray-500 text-sm text-center">No content</p>
                                          )}
                                        </div>
                                      </div>
                                    ))}
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
                        <div className="bg-white rounded-3xl border border-gray-100 shadow-lg overflow-hidden backdrop-blur-sm">
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
                                      onClick={async () => {
                                        if (
                                          !newKeyword.trim() ||
                                          isAddingKeyword ||
                                          !createdDomainId
                                        )
                                          return;

                                        const exists = keywordsTableData.some(
                                          (kw) =>
                                            normalizeTerm(kw.keyword) ===
                                            normalizeTerm(newKeyword)
                                        );
                                        if (exists) {
                                          toast({
                                            title: "Already Added",
                                            description: `"${newKeyword.trim()}" is already in your list`,
                                          });
                                          setNewKeyword("");
                                          setShowAddKeyword(false);
                                          return;
                                        }

                                        setIsAddingKeyword(true);

                                        try {
                                          const analyzeResponse = await fetch(
                                            `${
                                              import.meta.env.VITE_API_URL
                                            }/api/keywords/analyze`,
                                            {
                                              method: "POST",
                                              headers: {
                                                "Content-Type":
                                                  "application/json",
                                                Authorization: `Bearer ${localStorage.getItem(
                                                  "authToken"
                                                )}`,
                                              },
                                              body: JSON.stringify({
                                                keyword: newKeyword.trim(),
                                                domain: companyDomain,
                                                location: "Global",
                                                domainId: createdDomainId,
                                              }),
                                            }
                                          );

                                          if (!analyzeResponse.ok) {
                                            throw new Error(
                                              `Analysis failed! status: ${analyzeResponse.status}`
                                            );
                                          }

                                          const analysisResult =
                                            await analyzeResponse.json();

                                          if (!analysisResult.success) {
                                            throw new Error(
                                              analysisResult.error ||
                                                "Analysis failed"
                                            );
                                          }

                                          const saveResponse = await fetch(
                                            `${
                                              import.meta.env.VITE_API_URL
                                            }/api/keywords/${createdDomainId}/custom`,
                                            {
                                              method: "POST",
                                              headers: {
                                                "Content-Type":
                                                  "application/json",
                                                Authorization: `Bearer ${localStorage.getItem(
                                                  "authToken"
                                                )}`,
                                              },
                                              body: JSON.stringify({
                                                keyword: analysisResult.keyword,
                                                volume: analysisResult.volume,
                                                kd: analysisResult.kd,
                                                competition:
                                                  analysisResult.competition,
                                                cpc: analysisResult.cpc,
                                                intent: analysisResult.intent,
                                                organic: analysisResult.organic,
                                                paid: analysisResult.paid,
                                                trend: analysisResult.trend,
                                                position:
                                                  analysisResult.position,
                                                url: analysisResult.url,
                                                analysis:
                                                  analysisResult.analysis,
                                              }),
                                            }
                                          );

                                          if (!saveResponse.ok) {
                                            throw new Error(
                                              `Save failed! status: ${saveResponse.status}`
                                            );
                                          }

                                          const saveResult =
                                            await saveResponse.json();

                                          if (!saveResult.success) {
                                            throw new Error(
                                              saveResult.error || "Save failed"
                                            );
                                          }

                                          const existsAfter =
                                            keywordsTableData.some(
                                              (kw) =>
                                                normalizeTerm(kw.keyword) ===
                                                normalizeTerm(
                                                  saveResult.keyword.term
                                                )
                                            );
                                          if (existsAfter) {
                                            setNewKeyword("");
                                            setShowAddKeyword(false);
                                            setIsAddingKeyword(false);
                                            return;
                                          }

                                          const newKeywordItem: KeywordTableItem =
                                            {
                                              id: saveResult.keyword.id.toString(),
                                              keyword: saveResult.keyword.term,
                                              intent:
                                                saveResult.keyword.intent ||
                                                "Commercial",
                                              volume: saveResult.keyword.volume,
                                              kd:
                                                parseInt(
                                                  saveResult.keyword.difficulty
                                                ) || 50,
                                              competition:
                                                saveResult.keyword
                                                  .difficulty === "High"
                                                  ? "High"
                                                  : saveResult.keyword
                                                      .difficulty === "Low"
                                                  ? "Low"
                                                  : "Medium",
                                              cpc: saveResult.keyword.cpc,
                                              organic: Math.floor(
                                                saveResult.keyword.volume * 0.1
                                              ),
                                              paid: Math.floor(
                                                saveResult.keyword.volume * 0.05
                                              ),
                                              trend: "Stable",
                                              position: 0,
                                              url: '',
                                              updated: new Date()
                                                .toISOString()
                                                .split("T")[0],
                                              selected: false,
                                              isCustom: true,
                                            };

                                          setKeywordsTableData((prev) => [
                                            newKeywordItem,
                                            ...prev,
                                          ]);
                                          setKeywords((prev) => [
                                            ...prev,
                                            {
                                              id: saveResult.keyword.id,
                                              term: saveResult.keyword.term,
                                              volume: saveResult.keyword.volume,
                                              difficulty:
                                                saveResult.keyword.difficulty,
                                              cpc: saveResult.keyword.cpc,
                                              intent: saveResult.keyword.intent,
                                            },
                                          ]);
                                          setNewKeyword("");
                                          setShowAddKeyword(false);
                                          setIsAddingKeyword(false);

                                          toast({
                                            title: "Keyword Added Successfully",
                                            description: `Successfully analyzed and added "${newKeyword.trim()}" with comprehensive AI data`,
                                          });
                                        } catch (error) {
                                          console.error(
                                            "Custom keyword analysis error:",
                                            error
                                          );
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
                                      }}
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
                                <div className="flex items-center bg-gray-100 rounded-2xl p-1">
                                  <button
                                    onClick={() => setViewMode("cards")}
                                    className={`flex items-center space-x-2 px-4 py-2 rounded-xl transition-all duration-200 text-sm font-medium ${
                                      viewMode === "cards"
                                        ? "bg-white text-gray-900 shadow-sm"
                                        : "text-gray-600 hover:text-gray-900"
                                    }`}
                                  >
                                    <Grid3X3 className="w-4 h-4" />
                                    <span>Cards</span>
                                  </button>
                                  <button
                                    onClick={() => setViewMode("table")}
                                    className={`flex items-center space-x-2 px-4 py-2 rounded-xl transition-all duration-200 text-sm font-medium ${
                                      viewMode === "table"
                                        ? "bg-white text-gray-900 shadow-sm"
                                        : "text-gray-600 hover:text-gray-900"
                                    }`}
                                  >
                                    <List className="w-4 h-4" />
                                    <span>Table</span>
                                  </button>
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
                                      −
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
                                  <div className="grid grid-cols-10 gap-4 px-6 py-4 text-sm font-semibold text-gray-700">
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
                                      onClick={() => handleSort("cpc")}
                                    >
                                      <span>CPC</span>
                                      {getSortIcon("cpc")}
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
                                      className="grid grid-cols-10 gap-4 px-6 py-4 hover:bg-gray-50/80 transition-all duration-200"
                                    >
                                      {/* Keyword Column */}
                                      <div className="col-span-3 flex items-center space-x-3">
                                        <div>
                                          <div className="font-semibold text-gray-900 text-sm flex items-center space-x-2">
                                            <span>{keyword.keyword}</span>
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
                                        <span className="font-semibold text-gray-900 text-sm">
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
                                          className={getCompetitionBadge(
                                            keyword.competition
                                          )}
                                        >
                                          {keyword.competition}
                                        </span>
                                      </div>

                                      {/* CPC Column */}
                                      <div className="col-span-1 flex items-center justify-center">
                                        <span className="font-semibold text-gray-900 text-sm">
                                          ${keyword.cpc.toFixed(2)}
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
                                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                                            keyword.intent === "Commercial"
                                              ? "bg-blue-100 text-blue-800"
                                              : keyword.intent ===
                                                "Transactional"
                                              ? "bg-green-100 text-green-800"
                                              : "bg-gray-100 text-gray-800"
                                          }`}
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
                    <div className="flex items-center justify-center gap-4 mt-12">
                      {createdDomainId && (
                        <button
                          onClick={() => {
                            const maskedId = maskDomainId(createdDomainId);
                            navigate(`/dashboard/${maskedId}`);
                          }}
                          className="px-6 py-3 bg-black text-white rounded-full hover:bg-black/90 focus:outline-none focus:ring-4 focus:ring-black/10 transition-all shadow text-base font-medium"
                        >
                          View Full Dashboard
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Integration Tab Content */}
                {activeCompanySubTab === 'integration' && (
                  <div className="max-w-4xl mx-auto space-y-6">
                    {gscStatusLoading ? (
                      <IntegrationSkeleton />
                    ) : !gscConnected ? (
                      <div className="bg-white rounded-3xl p-12 border border-gray-100 shadow-sm text-center">
                        <div className="w-16 h-16 mx-auto mb-6 bg-gray-100 rounded-full flex items-center justify-center">
                          <Plug className="h-8 w-8 text-gray-400" />
                        </div>
                        <h2 className="text-2xl font-light text-black tracking-tight mb-3">
                          Google Search Console
                        </h2>
                        <p className="text-base font-light text-gray-600 mb-8">
                          Connect your Google Search Console account to view
                          search performance data
                        </p>
                        <button
                          onClick={handleConnectGsc}
                          className="px-8 py-3 bg-black text-white rounded-full hover:bg-black/90 focus:outline-none focus:ring-4 focus:ring-black/10 transition-all shadow text-base font-medium"
                        >
                          Connect Google Search Console
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
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
                          {gscLastSynced && (
                            <p className="text-xs font-light text-gray-500">
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
                                    <div className="flex items-center justify-between">
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
                          <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                            <div className="flex items-center justify-between mb-6">
                              <div>
                                <h3 className="text-xl font-light text-black tracking-tight mb-1">
                                  Selected Property
                                </h3>
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
                            <p className="text-sm font-light text-gray-500">
                              Search Console data will be available for this
                              property. You can fetch analytics data using the
                              API.
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                        <div>
                          <h3 className="text-2xl font-light text-black tracking-tight">
                            WordPress Publishing
                          </h3>
                          <p className="text-sm font-light text-gray-600">
                            Securely store credentials to auto-publish generated content
                          </p>
                        </div>
                        <div
                          className={`px-4 py-1.5 rounded-full text-xs font-semibold ${
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
                        <div className="space-y-5">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">WordPress URL</label>
                            <input
                              type="text"
                              value={wpForm.siteUrl}
                              onChange={(e) => setWpForm((prev) => ({ ...prev, siteUrl: e.target.value }))}
                              placeholder="https://example.com"
                              className="w-full px-4 py-3 text-sm rounded-2xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-900"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Username or Email</label>
                            <input
                              type="text"
                              value={wpForm.username}
                              onChange={(e) => setWpForm((prev) => ({ ...prev, username: e.target.value }))}
                              placeholder="admin"
                              className="w-full px-4 py-3 text-sm rounded-2xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-900"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Application Password</label>
                            <input
                              type="password"
                              value={wpForm.password}
                              onChange={(e) => setWpForm((prev) => ({ ...prev, password: e.target.value }))}
                              placeholder={hasWordpressIntegration ? 'Enter new password to update (optional)' : '•••••••'}
                              className="w-full px-4 py-3 text-sm rounded-2xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-900"
                            />
                            <div className="mt-2 space-y-1.5 text-xs text-gray-500">
                              <p className="">
                                Use a <span className="font-medium text-gray-700">WordPress Application Password</span>, not your normal login password.
                              </p>
                              <ul className="list-disc list-inside space-y-0.5">
                                <li>
                                  In your WordPress admin go to{' '}
                                  <span className="font-medium text-gray-700">Users → Profile → Application Passwords</span>.
                                </li>
                                <li>Generate a new application password and copy it once.</li>
                                <li>Paste that value here to allow secure REST API publishing.</li>
                              </ul>
                              <p className="">
                                We encrypt this token before storing it. Leave blank to keep the existing one.
                              </p>
                            </div>
                          </div>
                          {wpIntegration?.lastPublishedAt && (
                            <p className="text-xs text-gray-500">
                              Last published {new Date(wpIntegration.lastPublishedAt).toLocaleString()}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-3 pt-2">
                            <button
                              onClick={handleSaveWordpressIntegration}
                              disabled={wpIntegrationSaving}
                              className="px-6 py-3 bg-black text-white rounded-full hover:bg-black/90 disabled:opacity-60"
                            >
                              {wpIntegrationSaving ? 'Saving…' : hasWordpressIntegration ? 'Update Connection' : 'Save Connection'}
                            </button>
                            {hasWordpressIntegration && (
                              <button
                                onClick={handleDisconnectWordpress}
                                disabled={wpIntegrationDeleting}
                                className="px-6 py-3 border border-gray-200 text-gray-700 rounded-full hover:bg-gray-50 disabled:opacity-60"
                              >
                                {wpIntegrationDeleting ? 'Removing…' : 'Disconnect'}
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : isLoading ? (
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
            ) : (
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
                          placeholder="example.com"
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
            )
          ) : activeTab === "campaign" ? (
            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
              {!selectedCampaignId && (
                <>
                  {/* Header */}
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <h2 className="text-3xl font-thin text-black tracking-tight mb-2">
                        Campaigns
                      </h2>
                      <p className="text-base font-light text-gray-600">
                        Manage your marketing campaigns
                      </p>
                    </div>
                    <button
                      onClick={() => setShowCreateCampaign(!showCreateCampaign)}
                      className="px-6 py-3 bg-black text-white rounded-full hover:bg-black/90 focus:outline-none focus:ring-4 focus:ring-black/10 transition-all shadow text-base font-medium flex items-center gap-2"
                    >
                      <Plus className="h-5 w-5" />
                      {showCreateCampaign ? "Cancel" : "New Campaign"}
                    </button>
                  </div>

                  {/* Create Campaign Form */}
                  {showCreateCampaign && (
                    <div className="mb-8 bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                      <h3 className="text-xl font-light text-black tracking-tight mb-6">
                        Create New Campaign
                      </h3>
                      <form
                        onSubmit={handleCreateCampaign}
                        className="space-y-6"
                      >
                        <div>
                          <label className="block text-base font-light text-black mb-2">
                            Title
                          </label>
                          <input
                            type="text"
                            value={newCampaignTitle}
                            onChange={(e) =>
                              setNewCampaignTitle(e.target.value)
                            }
                            placeholder="Enter campaign title"
                            className="w-full px-4 py-3 text-base font-light rounded-2xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-base font-light text-black mb-2">
                            Description
                          </label>
                          <textarea
                            value={newCampaignDescription}
                            onChange={(e) =>
                              setNewCampaignDescription(e.target.value)
                            }
                            placeholder="Enter campaign description (optional)"
                            rows={4}
                            className="w-full px-4 py-3 text-base font-light rounded-2xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all resize-none"
                          />
                        </div>
                        <div className="flex items-center justify-end gap-4">
                          <button
                            type="button"
                            onClick={() => {
                              setShowCreateCampaign(false);
                              setNewCampaignTitle("");
                              setNewCampaignDescription("");
                            }}
                            className="px-6 py-3 bg-gray-100 text-gray-900 rounded-full hover:bg-gray-200 transition-all duration-200 text-base font-light"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="px-6 py-3 bg-black text-white rounded-full hover:bg-black/90 focus:outline-none focus:ring-4 focus:ring-black/10 transition-all shadow text-base font-medium"
                          >
                            Create Campaign
                          </button>
                        </div>
                      </form>
                    </div>
                  )}
                </>
              )}

              {/* Campaigns List */}
              {(() => {
                if (campaignsLoading || campaignTabDataLoading) {
                  return (
                    <div className="text-center py-12">
                      <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                      <p className="text-sm font-light text-gray-600 mt-4">
                        {campaignsLoading ? 'Loading campaigns...' : 'Loading campaign data...'}
                      </p>
                    </div>
                  );
                }

                if (selectedCampaignId) {
                  const selectedCampaign = campaigns.find(
                    (c) => c.id === selectedCampaignId
                  );
                  if (!selectedCampaign) {
                    return (
                      <div className="bg-white rounded-3xl p-8 border border-red-100 text-center text-sm text-red-600">
                        Selected campaign could not be found. Please go back and
                        try again.
                        <div className="mt-4">
                          <button
                            onClick={() => setSelectedCampaignId(null)}
                            className="px-5 py-2 bg-black text-white rounded-full text-sm"
                          >
                            Back
                          </button>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <CampaignStructureView
                      campaign={selectedCampaign}
                      onBack={() => setSelectedCampaignId(null)}
                      companyDomain={companyDomain}
                      domainContext={domainContext}
                      keywordsTableData={keywordsTableData}
                      hasWordpressIntegration={hasWordpressIntegration}
                      wpIntegration={wpIntegration}
                      onConfigureWordpress={handleConfigureWordpress}
                      onRefreshWordpressIntegration={async () => {
                        await fetchWordpressIntegration();
                        if (activeTab === 'campaign') {
                          await fetchCampaignTabData();
                        }
                      }}
                    />
                  );
                }

                if (campaigns.length === 0) {
                  return (
                    <div className="bg-white rounded-3xl p-12 border border-gray-100 shadow-sm text-center">
                      <div className="w-16 h-16 mx-auto mb-6 bg-gray-100 rounded-full flex items-center justify-center">
                        <Megaphone className="h-8 w-8 text-gray-400" />
                      </div>
                      <h3 className="text-xl font-light text-black tracking-tight mb-3">
                        No Campaigns Yet
                      </h3>
                      <p className="text-base font-light text-gray-600 mb-6">
                        Create your first campaign to get started
                      </p>
                      <button
                        onClick={() => setShowCreateCampaign(true)}
                        className="px-6 py-3 bg-black text-white rounded-full hover:bg-black/90 focus:outline-none focus:ring-4 focus:ring-black/10 transition-all shadow text-base font-medium flex items-center gap-2 mx-auto"
                      >
                        <Plus className="h-5 w-5" />
                        Create Campaign
                      </button>
                    </div>
                  );
                }

                return (
                  <div className="space-y-3">
                    {campaigns.map((campaign) => (
                      <div
                        key={campaign.id}
                        className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md"
                      >
                        {/* Campaign Row */}
                        <div className="flex items-center justify-between p-6">
                          <div className="flex-1 min-w-0">
                            <h3 className="text-lg font-light text-black tracking-tight mb-1 truncate">
                              {campaign.title}
                            </h3>
                            {campaign.description && (
                              <p className="text-sm font-light text-gray-600 line-clamp-1">
                                {campaign.description}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-3 ml-4">
                            <button
                              onClick={() => setSelectedCampaignId(campaign.id)}
                              className="px-4 py-2 bg-transparent text-black rounded-full hover:border-2 transition-all text-sm font-medium flex items-center gap-2"
                              title="View campaign structure"
                            >
                              View
                              <ChevronRight className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setDeleteId(campaign.id)}
                              className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                              title="Delete campaign"
                            >
                              <Trash2 className="h-5 w-5" />
                            </button>
                          </div>
                        </div>

                        {/* Campaign details accordion */}
                        {expandedCampaignId === campaign.id && (
                          <div className="px-6 pb-6 pt-0 border-t border-gray-100">
                            <div className="pt-6 space-y-4">
                              <div>
                                <h4 className="text-sm font-medium text-gray-900 mb-2">
                                  Description
                                </h4>
                                <p className="text-sm font-light text-gray-700">
                                  {campaign.description ||
                                    "No description provided"}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    {deleteId && (
  <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
    <div className="bg-white p-6 rounded-xl shadow-xl w-[90%] max-w-sm">
      <h2 className="text-lg font-medium text-gray-800">Delete Campaign?</h2>

      <p className="text-sm text-gray-500 mt-2">
        Are you sure you want to delete this campaign?
      </p>

      <div className="flex justify-end gap-3 mt-6">
        <button
          onClick={() => setDeleteId(null)}
          className="px-4 py-2 rounded-lg text-sm bg-gray-100 hover:bg-gray-200"
        >
          Cancel
        </button>

        <button
          onClick={() => {
            handleDeleteCampaign(deleteId!);
            setDeleteId(null);
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
                );
              })()}
            </div>
          ) : activeTab === 'publish' ? (
            companyDomainLoading ? (
              <CompanyInfoSkeleton />
                ) : (
              <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16 space-y-8">
                <PublishExperience
                  companyDomain={companyDomain}
                  domainContext={domainContext}
                  keywordsTableData={keywordsTableData}
                  hasWordpressIntegration={hasWordpressIntegration}
                  wpIntegration={wpIntegration}
                  onConfigureWordpress={handleConfigureWordpress}
                  onRefreshWordpressIntegration={async () => {
                    await fetchWordpressIntegration();
                    if (activeTab === 'campaign') {
                      await fetchCampaignTabData();
                    }
                  }}
                  isActive={activeTab === 'publish'}
                />
                                    </div>
            )
          ) : activeTab === 'audit' ? (
            <div className="relative min-h-screen w-full">
              {/* Background Layer */}
              <div className="fixed inset-0 pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gray-100 rounded-full blur-3xl opacity-20" />
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-gray-100 rounded-full blur-3xl opacity-20" />
              </div>

              {/* Content Layer */}
              <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
                {/* Audit Completed Toast */}
                {auditComplete && (
                  <div className="fixed bottom-6 right-6 z-50">
                    <div className="bg-black text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-3 border border-white/20 backdrop-blur-sm" style={{ letterSpacing: '0.011em' }}>
                      <svg
                        className="h-4 w-4 flex-shrink-0"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      <span className="font-light text-sm">Audit Completed!</span>
                    </div>
                  </div>
                )}

                {/* Hero Section */}
                <div className="text-center mb-20">
                  <div className="text-xs font-light uppercase tracking-wider text-gray-500 mb-4" style={{ letterSpacing: '0.083em' }}>
                    Domain Performance Audit
                  </div>
                  <h1
                    className="text-5xl sm:text-6xl md:text-7xl font-extralight mb-6 text-gray-900"
                    style={{ letterSpacing: '-0.003em', lineHeight: 1.05 }}
                  >
                    Analyze Your Domain
                  </h1>
                  <p
                    className="text-lg sm:text-xl md:text-2xl font-light text-gray-500 max-w-2xl mx-auto mb-12"
                    style={{ letterSpacing: '0.011em', lineHeight: 1.4 }}
                  >
                    Get comprehensive Lighthouse metrics, SEO insights, accessibility scores, and performance data.
                  </p>

                  {/* Action Section */}
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
                    <div
                      className="flex-1 max-w-md bg-white/70 backdrop-blur-md border border-gray-200 rounded-full px-6 py-4 flex items-center justify-between shadow-sm"
                      style={{ borderWidth: '0.5px' }}
                    >
                      <span className="text-gray-700 font-light truncate" style={{ letterSpacing: '0.011em' }}>
                        {companyDomain || "No domain available"}
                      </span>
                    </div>

                    <button
                      onClick={() => handleRunAudit(companyDomain)}
                      disabled={auditLoading || !companyDomain}
                      className={cn(
                        "h-12 px-8 rounded-full text-white font-light transition-all duration-200 flex items-center justify-center gap-2",
                        "bg-black hover:bg-gray-800 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed",
                        auditLoading && "cursor-not-allowed"
                      )}
                      style={{ letterSpacing: '-0.022em' }}
                    >
                      {auditLoading ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin" />
                          <span>Running Audit…</span>
                        </>
                      ) : (
                        "Start Audit"
                      )}
                    </button>
                  </div>

                  {auditData && auditData.updatedAt && (
                    <p className="text-sm font-light text-gray-400" style={{ letterSpacing: '0.011em' }}>
                      Last audited: {new Date(auditData.updatedAt).toLocaleString()}
                    </p>
                  )}
                </div>

                {/* Audit Results */}
                {auditResult && (() => {
                  const categories = [
                    { label: "Performance", value: auditResult.performance },
                    { label: "SEO", value: auditResult.seo },
                    { label: "Accessibility", value: auditResult.accessibility },
                    { label: "Best Practices", value: auditResult.bestPractices },
                    { label: "PWA", value: auditResult.pwa },
                  ];

                  const scored = categories.map(c => ({ ...c, score: Math.round((c.value || 0) * 100) }));
                  const avg = scored.reduce((a, b) => a + b.score, 0) / scored.length;
                  const best = scored.reduce((a, b) => (b.score > a.score ? b : a));
                  const worst = scored.reduce((a, b) => (b.score < a.score ? b : a));

                  return (
                    <div className="space-y-16">
                      {/* Overall Score Section */}
                      <div className="flex flex-col items-center justify-center py-12">
                        <div className="mb-8">
                          <OverallScoreGauge score={avg / 100} />
                        </div>
                        <div className="flex gap-8 text-center">
                          <div>
                            <div className="text-xs font-light uppercase tracking-wider text-gray-400 mb-2" style={{ letterSpacing: '0.083em' }}>
                              Strongest
                            </div>
                            <div className="text-2xl font-light text-gray-900" style={{ letterSpacing: '-0.003em' }}>
                              {best.label}
                            </div>
                            <div className="text-sm font-light text-gray-500 mt-1" style={{ letterSpacing: '0.011em' }}>
                              {best.score}%
                            </div>
                          </div>
                          <div className="w-px bg-gray-200" />
                          <div>
                            <div className="text-xs font-light uppercase tracking-wider text-gray-400 mb-2" style={{ letterSpacing: '0.083em' }}>
                              Needs Work
                            </div>
                            <div className="text-2xl font-light text-gray-900" style={{ letterSpacing: '-0.003em' }}>
                              {worst.label}
                            </div>
                            <div className="text-sm font-light text-gray-500 mt-1" style={{ letterSpacing: '0.011em' }}>
                              {worst.score}%
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Charts Section */}
                      <div className="space-y-12">
                        {/* Chart Tabs */}
                        <div className="flex flex-wrap gap-4 justify-center border-b border-gray-200 pb-4" style={{ borderWidth: '0.5px' }}>
                          {[
                            { id: 'overview' as const, label: 'Overview' },
                            { id: 'comparison' as const, label: 'Comparison' },
                            { id: 'distribution' as const, label: 'Distribution' },
                          ].map((tab) => (
                            <button
                              key={tab.id}
                              onClick={() => setActiveChartTab(tab.id)}
                              className={cn(
                                "px-6 py-2 text-sm font-light transition-colors border-b-2",
                                activeChartTab === tab.id
                                  ? "text-gray-900 border-gray-900"
                                  : "text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300"
                              )}
                              style={{ letterSpacing: '0.011em' }}
                            >
                              {tab.label}
                            </button>
                          ))}
                        </div>

                        {/* Chart Content */}
                        {activeChartTab === 'overview' && (
                          <div
                            className="bg-white/70 backdrop-blur-md rounded-2xl border border-gray-200 p-8 shadow-sm animate-in fade-in duration-300"
                            style={{ borderWidth: '0.5px' }}
                          >
                            <h3
                              className="text-2xl font-light text-gray-900 mb-6 text-center"
                              style={{ letterSpacing: '-0.003em' }}
                            >
                              Performance Overview
                            </h3>
                            <AuditRadarChart data={auditResult} />
                          </div>
                        )}

                        {activeChartTab === 'comparison' && (
                          <div
                            className="bg-white/70 backdrop-blur-md rounded-2xl border border-gray-200 p-8 shadow-sm animate-in fade-in duration-300"
                            style={{ borderWidth: '0.5px' }}
                          >
                            <h3
                              className="text-2xl font-light text-gray-900 mb-6 text-center"
                              style={{ letterSpacing: '-0.003em' }}
                            >
                              Metrics Comparison
                            </h3>
                            <AuditBarChart data={auditResult} />
                          </div>
                        )}

                        {activeChartTab === 'distribution' && (
                          <div
                            className="bg-white/70 backdrop-blur-md rounded-2xl border border-gray-200 p-8 shadow-sm animate-in fade-in duration-300"
                            style={{ borderWidth: '0.5px' }}
                          >
                            <h3
                              className="text-2xl font-light text-gray-900 mb-6 text-center"
                              style={{ letterSpacing: '-0.003em' }}
                            >
                              Score Distribution
                            </h3>
                            <AuditScoreDistribution data={auditResult} />
                          </div>
                        )}
                      </div>

                      {/* Individual Metrics Grid */}
                      <div>
                        <h3
                          className="text-2xl font-light text-gray-900 mb-8 text-center"
                          style={{ letterSpacing: '-0.003em' }}
                        >
                          Individual Metrics
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
                          {categories.map(({ label, value }) => (
                            <div
                              key={label}
                              className="bg-white/70 backdrop-blur-md rounded-2xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-all"
                              style={{ borderWidth: '0.5px' }}
                            >
                              <AuditGaugeChart label={label} score={value} size={140} />
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Screenshot Section */}
                      {auditResult?.screenshot && (
                        <div
                          className="bg-white/70 backdrop-blur-md rounded-2xl border border-gray-200 p-8 shadow-sm overflow-hidden"
                          style={{ borderWidth: '0.5px' }}
                        >
                          <h3
                            className="text-2xl font-light text-gray-900 mb-6 text-center"
                            style={{ letterSpacing: '-0.003em' }}
                          >
                            Website Preview
                          </h3>
                          <div className="rounded-xl overflow-hidden border border-gray-200" style={{ borderWidth: '0.5px' }}>
                            <img
                              src={auditResult.screenshot}
                              alt="Website Screenshot"
                              className="w-full h-auto"
                            />
                          </div>
                        </div>
                      )}

                      {/* Advanced Metrics */}
                      {auditResult.audits && (
                        <details className="group">
                          <summary
                            className="cursor-pointer flex justify-between items-center px-6 py-4 bg-white/70 backdrop-blur-md rounded-2xl border border-gray-200 shadow-sm text-gray-900 font-light hover:bg-white/90 transition-all"
                            style={{ borderWidth: '0.5px', letterSpacing: '0.011em' }}
                          >
                            <span>Advanced Performance Metrics</span>
                            <span className="transition-transform group-open:rotate-90 text-gray-400">▶</span>
                          </summary>

                          <div className="mt-6 p-6 bg-white/70 backdrop-blur-md rounded-2xl border border-gray-200 space-y-3" style={{ borderWidth: '0.5px' }}>
                            {Object.entries(auditResult.audits).map(([key, value]) => {
                              const fullForms: { [key: string]: string } = {
                                fcp: "First Contentful Paint",
                                lcp: "Largest Contentful Paint",
                                cls: "Cumulative Layout Shift",
                                tbt: "Total Blocking Time",
                                speedIndex: "Speed Index",
                              };

                              return (
                                <div
                                  key={key}
                                  className="flex justify-between items-center px-4 py-3 rounded-xl bg-gray-50/50 border border-gray-200 hover:bg-gray-50 transition-all"
                                  style={{ borderWidth: '0.5px' }}
                                >
                                  <span className="font-light text-gray-900" style={{ letterSpacing: '0.011em' }}>
                                    {key.toUpperCase()} <span className="text-gray-500">({fullForms[key] || key})</span>
                                  </span>
                                  <span className="font-mono text-sm font-light text-gray-700 bg-white px-3 py-1 rounded-lg border border-gray-200" style={{ borderWidth: '0.5px' }}>
                                    {String(value)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </details>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          ) : activeTab === 'gsc-analytics' ? (
            <GSCAnalyticsView />
          ) : activeTab === 'profile' ? (
            <div className="max-w-8xl mx-auto px-4 sm:px-6 py-12 sm:py-16 space-y-12">
              <Profile />
            </div>
          ) : activeTab === 'settings' ? (
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
              <div className="bg-white rounded-3xl p-12 border border-gray-100 shadow-sm text-center">
                <h2 className="text-2xl font-light text-black tracking-tight mb-3">
                  Domain Settings
                </h2>
                <p className="text-base font-light text-gray-600 mb-8">
                  Update your company domain
                </p>
                <div className="flex items-center justify-center gap-4">
                  <button
                    onClick={() => setConfirmUpdateOpen(true)}
                    className="px-6 py-3 bg-gray-100 text-gray-900 rounded-full hover:bg-gray-200 transition-all duration-200 text-base font-light"
                  >
                    Update Company Domain
                  </button>
                </div>
                {confirmUpdateOpen && (
                  <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-xl shadow-xl w-[90%] max-w-sm">
                      <h2 className="text-lg font-medium text-gray-800">Remove Company Domain?</h2>
                      <p className="text-sm text-gray-500 mt-2">
                        This will remove your current company domain and take you to re-enter a new one.
                      </p>
                      <div className="flex justify-end gap-3 mt-6">
                        <button
                          onClick={() => { if (!updateLoading) setConfirmUpdateOpen(false); }}
                          disabled={updateLoading}
                          className="px-4 py-2 rounded-lg text-sm bg-gray-100 hover:bg-gray-200 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={async () => {
                            if (updateLoading) return;
                            setUpdateLoading(true);
                            try {
                              const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/user/company-domain`, {
                                headers: {
                                  Authorization: `Bearer ${localStorage.getItem("authToken")}`,
                                  "Content-Type": "application/json",
                                },
                              });
                              if (resp.ok) {
                                const data = await resp.json();
                                const id = data?.domain?.id;
                                if (id) {
                                  await fetch(`${import.meta.env.VITE_API_URL}/api/domain/${id}`, {
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
                            setActiveTab('analytics');
                            setActiveCompanySubTab('company-info');
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
                          }}
                          className="px-4 py-2 rounded-lg text-sm bg-black text-white hover:bg-black/90 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                          {updateLoading ? <ButtonSpinner /> : null}
                          {updateLoading ? 'Updating…' : 'Confirm'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{
              background: 'rgba(255, 255, 255, 0.8)',
              backdropFilter: 'saturate(180%) blur(20px)',
              WebkitBackdropFilter: 'saturate(180%) blur(20px)',
              border: '0.5px solid rgba(0, 0, 0, 0.1)',
              borderRadius: '16px',
              padding: '48px',
              textAlign: 'center'
            }}>
              <p style={{ 
                fontSize: '17px',
                fontWeight: '300',
                letterSpacing: '0.011em',
                color: '#86868b',
                margin: '0'
              }}>
                Content for {tabs.find(t => t.id === activeTab)?.label || 'Dashboard'} will appear here
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

// Campaign Structure View Component
interface CampaignStructureViewProps {
  campaign: {
    id: number;
    title: string;
    description: string | null;
    createdAt: string;
    updatedAt: string;
  };
  onBack: () => void;
  companyDomain: string;
  domainContext: string;
  keywordsTableData: KeywordTableItem[];
  hasWordpressIntegration: boolean;
  wpIntegration: WordpressIntegration | null;
  onConfigureWordpress: () => void;
  onRefreshWordpressIntegration: () => void;
}

const CampaignStructureView: React.FC<CampaignStructureViewProps> = ({ 
  campaign, 
  onBack, 
  companyDomain, 
  domainContext,
  keywordsTableData,
  hasWordpressIntegration,
  wpIntegration,
  onConfigureWordpress,
  onRefreshWordpressIntegration
}) => {
  const CAMPAIGN_API_BASE = `${API_BASE_URL}/api/campaigns`;
  const [campaignStructure, setCampaignStructure] = useState<CampaignStructure>(
    { topics: [] }
  );
  const [structureLoading, setStructureLoading] = useState(true);
  const [structureError, setStructureError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [aiLoading, setAiLoading] = useState<string | null>(null);

  const [expandedTopics, setExpandedTopics] = useState<Set<number>>(new Set());
  const [expandedPillarPages, setExpandedPillarPages] = useState<Set<number>>(
    new Set()
  );
  const [expandedSubPages, setExpandedSubPages] = useState<Set<number>>(
    new Set()
  );
  const [selectedTopics, setSelectedTopics] = useState<Set<number>>(new Set());

  // Modal states
  const [showAddTopicModal, setShowAddTopicModal] = useState(false);
  const [showAddPillarModal, setShowAddPillarModal] = useState(false);
  const [showAddSubPageModal, setShowAddSubPageModal] = useState(false);
  const [showAddKeywordModal, setShowAddKeywordModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteLabel, setDeleteLabel] = useState<string>('');
  const [deleteAction, setDeleteAction] = useState<(() => void) | null>(null);
  const [addKeywordContext, setAddKeywordContext] = useState<{
    type: "pillar" | "subpage";
    topicId: number;
    pageId: number;
  } | null>(null);

  // Form states
  const [newTopicTitle, setNewTopicTitle] = useState('');
  const [newPillarTitle, setNewPillarTitle] = useState('');
  const [newSubPageTitle, setNewSubPageTitle] = useState('');
  const [newKeywordTerm, setNewKeywordTerm] = useState('');
  const [newKeywordVolume, setNewKeywordVolume] = useState('');
  const [newKeywordDifficulty, setNewKeywordDifficulty] = useState('Medium');
  const [newKeywordType, setNewKeywordType] = useState<'primary' | 'longtail'>('primary');
  const [availableKeywords, setAvailableKeywords] = useState<Keyword[]>([]);
  const [keywordSearchOpen, setKeywordSearchOpen] = useState(false);
  const [keywordSearchValue, setKeywordSearchValue] = useState('');
  const [loadingKeywords, setLoadingKeywords] = useState(false);
  const [keywordPickerDrawerOpen, setKeywordPickerDrawerOpen] = useState(false);
  const [drawerSearchTerm, setDrawerSearchTerm] = useState('');
  const [drawerCompetition, setDrawerCompetition] = useState('');
  const [drawerIntent, setDrawerIntent] = useState('');
  const [drawerViewMode, setDrawerViewMode] = useState<"table" | "cards">("table");
  const [drawerSortConfig, setDrawerSortConfig] = useState<{ key: keyof KeywordTableItem; direction: "asc" | "desc" } | null>(null);
  const [drawerCurrentPage, setDrawerCurrentPage] = useState(1);
  const [drawerItemsPerPage, setDrawerItemsPerPage] = useState(10);
  const drawerFilteredKeywords = React.useMemo(() => {
    return keywordsTableData.filter((keyword) => {
      const matchesSearch = keyword.keyword.toLowerCase().includes(drawerSearchTerm.toLowerCase());
      const matchesCompetition = !drawerCompetition || keyword.competition === drawerCompetition;
      const matchesIntent = !drawerIntent || keyword.intent === drawerIntent;
      return matchesSearch && matchesCompetition && matchesIntent;
    });
  }, [keywordsTableData, drawerSearchTerm, drawerCompetition, drawerIntent]);
  const drawerSortedKeywords = React.useMemo(() => {
    const sortableKeywords = [...drawerFilteredKeywords];
    if (drawerSortConfig !== null) {
      sortableKeywords.sort((a, b) => {
        const aValue = a[drawerSortConfig.key];
        const bValue = b[drawerSortConfig.key];
        if (typeof aValue === "number" && typeof bValue === "number") {
          return drawerSortConfig.direction === "asc" ? aValue - bValue : bValue - aValue;
        }
        const aStr = String(aValue).toLowerCase();
        const bStr = String(bValue).toLowerCase();
        if (aStr < bStr) {
          return drawerSortConfig.direction === "asc" ? -1 : 1;
        }
        if (aStr > bStr) {
          return drawerSortConfig.direction === "asc" ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableKeywords;
  }, [drawerFilteredKeywords, drawerSortConfig]);
  const drawerTotalPages = Math.max(1, Math.ceil(drawerSortedKeywords.length / drawerItemsPerPage));
  const drawerStartIndex = (drawerCurrentPage - 1) * drawerItemsPerPage;
  const drawerEndIndex = drawerStartIndex + drawerItemsPerPage;
  const drawerCurrentKeywords = drawerSortedKeywords.slice(drawerStartIndex, drawerEndIndex);
  const drawerHandleSort = useCallback((key: keyof KeywordTableItem) => {
    let direction: "asc" | "desc" = "asc";
    if (drawerSortConfig && drawerSortConfig.key === key && drawerSortConfig.direction === "asc") {
      direction = "desc";
    }
    setDrawerSortConfig({ key, direction });
  }, [drawerSortConfig]);
  const drawerGetSortIcon = useCallback((key: keyof KeywordTableItem) => {
    if (!drawerSortConfig || drawerSortConfig.key !== key) {
      return <ArrowUpDown className="w-4 h-4 text-gray-400" />;
    }
    return drawerSortConfig.direction === "asc" ? (
      <ChevronUp className="w-4 h-4 text-gray-700" />
    ) : (
      <ChevronDown className="w-4 h-4 text-gray-700" />
    );
  }, [drawerSortConfig]);
  const drawerHandlePageChange = useCallback((page: number) => {
    const totalPagesCalc = Math.max(1, Math.ceil(drawerSortedKeywords.length / drawerItemsPerPage));
    if (page >= 1 && page <= totalPagesCalc) {
      setDrawerCurrentPage(page);
    }
  }, [drawerSortedKeywords.length, drawerItemsPerPage]);
  const drawerGetPageNumbers = useCallback(() => {
    const pages: Array<number | string> = [];
    const maxVisiblePages = 5;
    if (drawerTotalPages <= maxVisiblePages) {
      for (let i = 1; i <= drawerTotalPages; i++) {
        pages.push(i);
      }
    } else {
      if (drawerCurrentPage <= 3) {
        for (let i = 1; i <= 4; i++) {
          pages.push(i);
        }
        pages.push("...");
        pages.push(drawerTotalPages);
      } else if (drawerCurrentPage >= drawerTotalPages - 2) {
        pages.push(1);
        pages.push("...");
        for (let i = drawerTotalPages - 3; i <= drawerTotalPages; i++) {
          pages.push(i);
        }
      } else {
        pages.push(1);
        pages.push("...");
        for (let i = drawerCurrentPage - 1; i <= drawerCurrentPage + 1; i++) {
          pages.push(i);
        }
        pages.push("...");
        pages.push(drawerTotalPages);
      }
    }
    return pages;
  }, [drawerTotalPages, drawerCurrentPage]);
  const drawerCompetitionBadge = useCallback((competition: string) => {
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

  const [targetTopicId, setTargetTopicId] = useState<number | null>(null);
  const { toast } = useToast();

  // Pillar page generation states
  const [generationDrawerOpen, setGenerationDrawerOpen] = useState(false);
  const [generationForm, setGenerationForm] = useState({
    wordCount: 800,
    images: 2,
    featuredImage: true,
    brandName: '',
    brandDescription: '',
  });
  // Auto-fill brand fields using company domain/context (mirrors publish tab)
  const derivedBrandName = React.useMemo(() => {
    if (companyDomain) {
      return companyDomain.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0];
    }
    return '';
  }, [companyDomain]);
  const derivedBrandDescription = React.useMemo(
    () => summarizeDomainContext(domainContext || ''),
    [domainContext]
  );
  const [generationJobs, setGenerationJobs] = useState<Map<number, GenerationPageStatus>>(new Map());
  const [generateTopicLoading, setGenerateTopicLoading] = useState<number | null>(null);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);
  const [previewPageId, setPreviewPageId] = useState<number | null>(null);
  const [previewDraft, setPreviewDraft] = useState<DraftPreview | null>(null);
  const [currentGenerationTopicId, setCurrentGenerationTopicId] = useState<number | null>(null);
  const [viewLoadingPageId, setViewLoadingPageId] = useState<number | null>(null);
  const [closePreviewLoading, setClosePreviewLoading] = useState(false);
  const [publishLoadingPageId, setPublishLoadingPageId] = useState<number | null>(null);
  
  // Streaming progress state
  const [streamingMessages, setStreamingMessages] = useState<Map<string, Array<{
    message: string;
    timestamp: string;
  }>>>(new Map());
  const [jobIdToTopicId, setJobIdToTopicId] = useState<Map<string, number>>(new Map());
  
  // Active generation tracking - track last streaming timestamp per jobId
  const [lastStreamingTimestamp, setLastStreamingTimestamp] = useState<Map<string, number>>(new Map());
  
  // Backend job status tracking - stores backend's view of job status
  const [backendJobStatus, setBackendJobStatus] = useState<Map<string, {
    status: 'pending' | 'generating' | 'completed' | 'failed';
    pages: Array<{ pageId: number; status: string; progress: number }>;
  }>>(new Map());
  
  // Helper to check if generation is active (streaming received within last 10 minutes)
  const isGenerationActive = useCallback((jobId: string): boolean => {
    const lastTimestamp = lastStreamingTimestamp.get(jobId);
    if (!lastTimestamp) return false;
    const now = Date.now();
    return (now - lastTimestamp) < 10 * 60 * 1000; // 10 minutes
  }, [lastStreamingTimestamp]);

  const getAuthHeaders = useCallback((): HeadersInit => {
    const token = localStorage.getItem("authToken");
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, []);

  const handleUnauthorized = useCallback(() => {
    localStorage.removeItem("authToken");
    window.location.href = "/auth";
  }, []);

  // Helper function to extract topicId from jobId pattern
  const extractTopicIdFromJobId = useCallback((jobId: string): number | null => {
    // JobId format: job_{topicId}_{timestamp}
    const match = jobId.match(/^job_(\d+)_/);
    return match ? parseInt(match[1], 10) : null;
  }, []);

  // Handle streaming progress updates
  const handleStreamingUpdate = useCallback((jobId: string | undefined, message: string | undefined, timestamp: string | undefined) => {
    if (!jobId || !message) return;
    
    const topicId = extractTopicIdFromJobId(jobId);
    if (!topicId) return;
    
    // Store jobId -> topicId mapping
    setJobIdToTopicId(prev => {
      const updated = new Map(prev);
      updated.set(jobId, topicId);
      return updated;
    });
    
    // Update last streaming timestamp (marks generation as active)
    const now = Date.now();
    setLastStreamingTimestamp(prev => {
      const updated = new Map(prev);
      updated.set(jobId, now);
      return updated;
    });
    
    // Add message to streaming messages
    setStreamingMessages(prev => {
      const updated = new Map(prev);
      const messages = updated.get(jobId) || [];
      const newMessages = [
        ...messages,
        { message, timestamp: timestamp || new Date().toISOString() }
      ];
      // Keep last 10 messages per job
      updated.set(jobId, newMessages.slice(-10));
      return updated;
    });
  }, [extractTopicIdFromJobId]);

  // Subscribe to server-sent events for generation status (replaces polling)
  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (!token) return;

    const eventSource = new EventSource(
      `${API_BASE_URL}/api/campaigns/events?token=${encodeURIComponent(token)}`
    );

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as {
          type?: string;
          jobId?: string;
          message?: string;
          timestamp?: string;
          pages?: Partial<GenerationPageStatus & { pageType: string; hasHtml?: boolean; error?: string | null }>[];
        };
        
        // Handle streaming progress updates
        if (data.type === 'streaming') {
          handleStreamingUpdate(data.jobId, data.message, data.timestamp);
          return;
        }

        // Handle n8n critical errors
        if (data.type === 'n8n_error') {
          console.error('Received n8n error:', data);
          toast({
            title: 'Generation Failed',
            description: data.error || 'An external error occurred during processing',
            variant: 'destructive',
          });
          // We don't return here, allowing the 'drafts' update (if triggered) to also process
        }
        
        // Handle draft updates
        if (data.type === 'drafts' && data.pages) {
          setGenerationJobs((prev) => {
            const updated = new Map(prev);
            data.pages!.forEach((p) => {
              const pageId = p.pageId;
              if (!pageId) return;
              const existing = updated.get(pageId);
              const jobId = data.jobId || existing?.jobId || '';
              
              // Clear streaming messages and timestamps when generation completes
              if (p.status === 'completed' && jobId) {
                setStreamingMessages(prevMsgs => {
                  const updatedMsgs = new Map(prevMsgs);
                  updatedMsgs.delete(jobId);
                  return updatedMsgs;
                });
                setLastStreamingTimestamp(prev => {
                  const updated = new Map(prev);
                  updated.delete(jobId);
                  return updated;
                });
              }
              
              updated.set(pageId, {
                jobId,
                pageId,
                pageType: p.pageType === 'subpage' ? 'subpage' : 'pillar',
                status: (p.status || existing?.status || 'generating') as GenerationPageStatus['status'],
                draftId: p.draftId ?? existing?.draftId,
                progress: typeof p.progress === 'number' ? p.progress : p.hasHtml ? 100 : existing?.progress,
                primaryKeyword: p.primaryKeyword ?? existing?.primaryKeyword,
                hasHtml: p.hasHtml ?? existing?.hasHtml,
                updatedAt: new Date().toISOString(),
                error: p.error ?? existing?.error ?? null,
              });
            });
            return updated;
          });
        }
      } catch (err) {
        console.error('Failed to parse SSE payload', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('SSE connection error', err);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [handleStreamingUpdate]);

  // Periodic polling for active generation jobs
  useEffect(() => {
    const pollJobStatus = async (jobId: string) => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/campaigns/generation-status/${jobId}`,
          { headers: getAuthHeaders() }
        );

        if (response.status === 401 || response.status === 403) {
          handleUnauthorized();
          return;
        }

        if (!response.ok) return;

        const data = await response.json();
        if (!data.success || !data.status) return;

        // Update backend job status
        setBackendJobStatus(prev => {
          const updated = new Map(prev);
          updated.set(jobId, {
            status: data.status.status,
            pages: data.pages || []
          });
          return updated;
        });

        // Update generationJobs with backend status for each page
        if (data.pages && Array.isArray(data.pages)) {
          setGenerationJobs(prev => {
            const updated = new Map(prev);
            data.pages.forEach((page: { pageId: number; status: string; progress: number }) => {
              const existing = updated.get(page.pageId);
              if (existing) {
                // Only update status if backend says it's different and more authoritative
                // Don't override 'completed' with 'generating' if page has HTML
                if (!existing.hasHtml || page.status === 'completed') {
                  updated.set(page.pageId, {
                    ...existing,
                    status: page.status as GenerationPageStatus['status'],
                    progress: page.progress
                  });
                }
              }
            });
            return updated;
          });
        }
      } catch (err) {
        console.error(`Failed to poll job status for ${jobId}:`, err);
      }
    };

    // Get all active jobIds (those with recent streaming or in generating state)
    const activeJobIds = new Set<string>();
    
    // Add jobIds from streaming messages
    streamingMessages.forEach((_, jobId) => {
      if (isGenerationActive(jobId)) {
        activeJobIds.add(jobId);
      }
    });
    
    // Add jobIds from generationJobs that are still generating
    generationJobs.forEach((job) => {
      if (job.jobId && (job.status === 'generating' || job.status === 'pending')) {
        activeJobIds.add(job.jobId);
      }
    });

    if (activeJobIds.size === 0) return;

    // Poll each active job
    activeJobIds.forEach(jobId => {
      pollJobStatus(jobId);
    });

    // Set up interval to poll every 30 seconds
    const interval = setInterval(() => {
      activeJobIds.forEach(jobId => {
        pollJobStatus(jobId);
      });
    }, 30000);

    return () => {
      clearInterval(interval);
    };
  }, [streamingMessages, generationJobs, isGenerationActive, getAuthHeaders, handleUnauthorized]);

  // Rehydrate generation state on load so generate buttons stay disabled after reload
  useEffect(() => {
    const rehydrate = async () => {
      if (!campaignStructure.topics || campaignStructure.topics.length === 0) return;
      const newMap = new Map<number, GenerationPageStatus>();

      for (const topic of campaignStructure.topics) {
        try {
          const response = await fetch(
            `${API_BASE_URL}/api/campaigns/topics/${topic.id}/drafts-status`,
            { headers: getAuthHeaders() }
          );

          if (response.status === 401 || response.status === 403) {
            handleUnauthorized();
            return;
          }

          const data = await response.json();
          if (!response.ok || !data.success || !data.pages) continue;

          const now = Date.now();
          const isStale = (p: DraftStatusRecord) => {
            if (!p.updatedAt) return false;
            const updated = new Date(p.updatedAt).getTime();
            return !isNaN(updated) && now - updated > 10 * 60 * 1000; // 10 minutes (increased from 5)
          };

          data.pages.forEach((p: DraftStatusRecord) => {
            // Skip empty/no-job entries so new topics don't show as pending
            if (!p.draftId && !p.jobId && !p.hasHtml) {
              return;
            }
            
            // Determine status: use robust logic that checks if generation is active
            let finalStatus = (p.status || 'pending') as GenerationPageStatus['status'];
            
            // If page has HTML content, it's completed regardless of what the backend says (unless published)
            if (p.hasHtml && finalStatus !== 'published') {
              finalStatus = 'completed';
            } else {
              // Check if generation is still active for this job
              const jobId = p.jobId || '';
              const generationActive = jobId ? isGenerationActive(jobId) : false;
              
              // Get backend job status if available
              const backendStatus = jobId ? backendJobStatus.get(jobId) : null;
              
              // Only mark as failed if:
              // - Stale (no update for 10+ minutes)
              // - AND generation is not active (no streaming messages)
              // - AND backend confirms failed (or no backend status available and truly stale)
              if (isStale(p) && !p.hasHtml && finalStatus !== 'completed') {
                if (!generationActive) {
                  // Generation not active - check backend status
                  if (backendStatus?.status === 'failed') {
                    finalStatus = 'failed';
                  } else if (!backendStatus && now - new Date(p.updatedAt || 0).getTime() > 15 * 60 * 1000) {
                    // No backend status and very stale (15+ minutes) - mark as failed
                    finalStatus = 'failed';
                  } else {
                    // Keep as generating if backend says generating or no backend status yet
                    finalStatus = backendStatus?.status === 'generating' ? 'generating' : finalStatus;
                  }
                } else {
                  // Generation is active - keep as generating
                  finalStatus = 'generating';
                }
              } else if (!p.hasHtml && backendStatus) {
                // Use backend status if available and page doesn't have HTML
                if (backendStatus.status === 'completed' || backendStatus.status === 'failed') {
                  finalStatus = backendStatus.status as GenerationPageStatus['status'];
                } else if (backendStatus.status === 'generating' && finalStatus !== 'completed') {
                  finalStatus = 'generating';
                }
              }
            }
            
            newMap.set(p.pageId, {
              jobId: p.jobId || '',
              pageId: p.pageId,
              pageType: p.pageType === 'subpage' ? 'subpage' : 'pillar',
              status: finalStatus,
              draftId: p.draftId,
              progress: typeof p.progress === 'number' ? p.progress : p.hasHtml ? 100 : 0,
              primaryKeyword: p.primaryKeyword,
              hasHtml: p.hasHtml,
              updatedAt: p.updatedAt,
              error: p.error || null,
              wordpressUrl: p.wordpressUrl || null,
            });
          });
        } catch (err) {
          console.error('Failed to rehydrate drafts-status', err);
        }
      }

      if (newMap.size > 0) {
        setGenerationJobs(newMap);
      }
    };

    rehydrate();
  }, [campaignStructure.topics, getAuthHeaders, handleUnauthorized, isGenerationActive, backendJobStatus]);

  const mutateStructure = useCallback(async (endpoint: string, init: RequestInit = {}, opts: { successMessage?: string; silent?: boolean } = {}) => {
    if (!opts.silent) {
      setSyncing(true);
    }
    try {
      const response = await fetch(endpoint, {
        ...init,
        headers: getAuthHeaders()
      });

        if (response.status === 401 || response.status === 403) {
          handleUnauthorized();
          return;
        }

        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.error || "Unable to update campaign structure");
        }

        if (data.structure) {
          setCampaignStructure(data.structure);
        }

        if (opts.successMessage) {
          toast({ title: opts.successMessage });
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Something went wrong";
        toast({
          title: "Action failed",
          description: message,
          variant: "destructive",
        });
        throw error;
      } finally {
        if (!opts.silent) {
          setSyncing(false);
        }
      }
    },
    [getAuthHeaders, handleUnauthorized, toast]
  );

  const confirmDelete = (label: string, action: () => void) => {
    setDeleteLabel(label);
    setDeleteAction(() => action);
    setShowDeleteModal(true);
  };

  const fetchStructure = useCallback(
    async (targetCampaignId: number) => {
      setStructureLoading(true);
      setStructureError(null);
      try {
        const response = await fetch(
          `${CAMPAIGN_API_BASE}/${targetCampaignId}/structure`,
          {
            headers: getAuthHeaders(),
          }
        );

        if (response.status === 401 || response.status === 403) {
          handleUnauthorized();
          return;
        }

        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.error || "Unable to load campaign structure");
        }

        setCampaignStructure(data.structure);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to load campaign structure";
        setStructureError(message);
      } finally {
        setStructureLoading(false);
      }
    },
    [CAMPAIGN_API_BASE, getAuthHeaders, handleUnauthorized]
  );

  useEffect(() => {
    fetchStructure(campaign.id);
  }, [campaign.id, fetchStructure]);

  // Auto-fill brand fields similar to publish tab
  useEffect(() => {
    setGenerationForm((prev) => ({
      ...prev,
      brandName: derivedBrandName || prev.brandName || '',
      brandDescription: derivedBrandDescription || prev.brandDescription || '',
    }));
  }, [derivedBrandName, derivedBrandDescription]);

  const topicsSnapshot = campaignStructure.topics;
  useEffect(() => {
    setSelectedTopics((prev) => {
      const retained = new Set<number>();
      topicsSnapshot.forEach((topic) => {
        if (prev.has(topic.id)) {
          retained.add(topic.id);
        }
      });
      return retained;
    });
  }, [topicsSnapshot]);

  const triggerAiTopics = useCallback(
    async (targetCampaignId: number) => {
      setAiLoading("topic");
      try {
        await mutateStructure(
          `${CAMPAIGN_API_BASE}/${targetCampaignId}/topics/ai`,
          {
            method: "POST",
            body: JSON.stringify({ count: 1 }),
          },
          { successMessage: "AI topic added", silent: true }
        );
      } catch {
        // errors handled inside mutateStructure
      } finally {
        setAiLoading(null);
      }
    },
    [mutateStructure, CAMPAIGN_API_BASE]
  );

  const triggerAiPillar = useCallback(
    async (topicId: number) => {
      const key = `pillar-${topicId}`;
      setAiLoading(key);
      try {
        await mutateStructure(
          `${CAMPAIGN_API_BASE}/topics/${topicId}/pillar/ai`,
          {
            method: "POST",
          },
          { successMessage: "AI pillar page generated", silent: true }
        );
      } catch {
        // handled upstream
      } finally {
        setAiLoading(null);
      }
    },
    [mutateStructure, CAMPAIGN_API_BASE]
  );

  const triggerAiSubPage = useCallback(
    async (topicId: number) => {
      const key = `subpage-${topicId}`;
      setAiLoading(key);
      try {
        await mutateStructure(
          `${CAMPAIGN_API_BASE}/topics/${topicId}/subpages/ai`,
          {
            method: "POST",
            body: JSON.stringify({ count: 1 }),
          },
          { successMessage: "AI sub-page generated", silent: true }
        );
      } catch {
        // handled upstream
      } finally {
        setAiLoading(null);
      }
    },
    [mutateStructure, CAMPAIGN_API_BASE]
  );

  const triggerAiKeywords = useCallback(
    async (pageId: number) => {
      const key = `keyword-${pageId}`;
      setAiLoading(key);
      try {
        await mutateStructure(
          `${CAMPAIGN_API_BASE}/pages/${pageId}/keywords/ai`,
          {
            method: "POST",
            body: JSON.stringify({ count: 4 }),
          },
          { successMessage: "AI keywords added", silent: true }
        );
      } catch {
        // handled upstream
      } finally {
        setAiLoading(null);
      }
    },
    [mutateStructure, CAMPAIGN_API_BASE]
  );

  const toggleTopic = (id: number) => {
    const newSet = new Set(expandedTopics);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedTopics(newSet);
  };

  const togglePillarPage = (id: number) => {
    const newSet = new Set(expandedPillarPages);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedPillarPages(newSet);
  };

  const toggleSubPage = (id: number) => {
    const newSet = new Set(expandedSubPages);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedSubPages(newSet);
  };

  const toggleTopicSelection = (id: number) => {
    const newSet = new Set(selectedTopics);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedTopics(newSet);
  };

  const handleContinue = () => {
    if (selectedTopics.size === 0) {
      toast({
        title: "No Topics Selected",
        description: "Please select at least one topic to continue",
        variant: "destructive",
      });
      return;
    }
    // TODO: Handle continue action
    toast({
      title: "Continue",
      description: `Proceeding with ${selectedTopics.size} selected topic(s)`,
    });
  };

  const handleAddTopic = (isAI: boolean) => {
    if (isAI) {
      if (aiLoading === "topic") return;
      triggerAiTopics(campaign.id);
      return;
    }
    setTargetTopicId(null);
    setNewTopicTitle("");
    setShowAddTopicModal(true);
  };

  const handleSubmitTopic = async () => {
    if (!newTopicTitle.trim()) {
      toast({
        title: "Title Required",
        description: "Please enter a topic title",
        variant: "destructive",
      });
      return;
    }
    try {
      await mutateStructure(
        `${CAMPAIGN_API_BASE}/${campaign.id}/topics`,
        {
          method: "POST",
          body: JSON.stringify({ title: newTopicTitle.trim() }),
        },
        { successMessage: "Topic added" }
      );
      setShowAddTopicModal(false);
      setNewTopicTitle("");
    } catch {
      // errors handled upstream
    }
  };

  const handleAddPillarPage = (topicId: number, isAI: boolean) => {
    if (isAI) {
      if (aiLoading === `pillar-${topicId}`) return;
      triggerAiPillar(topicId);
      return;
    }
    const topic = campaignStructure.topics.find((t) => t.id === topicId);
    setTargetTopicId(topicId);
    setNewPillarTitle(topic?.pillarPage?.title || "");
    setShowAddPillarModal(true);
  };

  const handleSubmitPillarPage = async () => {
    if (!newPillarTitle.trim() || !targetTopicId) {
      toast({
        title: "Title Required",
        description: "Please enter a pillar page title",
        variant: "destructive",
      });
      return;
    }
    try {
      await mutateStructure(
        `${CAMPAIGN_API_BASE}/topics/${targetTopicId}/pillar`,
        {
          method: "POST",
          body: JSON.stringify({
            title: newPillarTitle.trim(),
          }),
        },
        { successMessage: "Pillar page saved" }
      );
      setShowAddPillarModal(false);
      setNewPillarTitle("");
      setTargetTopicId(null);
    } catch {
      // handled upstream
    }
  };

  const handleAddSubPage = (topicId: number, isAI: boolean) => {
    if (isAI) {
      if (aiLoading === `subpage-${topicId}`) return;
      triggerAiSubPage(topicId);
      return;
    }
    setTargetTopicId(topicId);
    setNewSubPageTitle("");
    setShowAddSubPageModal(true);
  };

  const canGenerateTopic = (topic: Topic) => {
    const pillar = topic.pillarPage;
    if (!pillar) return false;
    const allPages = [pillar, ...(topic.subPages || [])];
    return allPages.every((p) => (p.keywords?.length || 0) > 0);
  };

  // Stable check for topic generation status - prevents flickering
  const isTopicGenerating = useCallback((topic: Topic) => {
    const pageIds = [
      topic.pillarPage?.id,
      ...(topic.subPages || []).map((sp) => sp.id),
    ].filter(Boolean) as number[];
    
    return pageIds.some((id) => {
      const job = generationJobs.get(id);
      if (!job) return false;
      
      // If page has HTML, it's completed (not generating)
      if (job.hasHtml) return false;
      
      // Check if generation is active via streaming
      if (job.jobId && isGenerationActive(job.jobId)) {
        return true;
      }
      
      // Check backend status
      if (job.jobId) {
        const backendStatus = backendJobStatus.get(job.jobId);
        if (backendStatus?.status === 'generating' || backendStatus?.status === 'pending') {
          return true;
        }
      }
      
      // Check job status (but prefer streaming/backend status)
      return job.status === 'generating' || job.status === 'pending';
    });
  }, [generationJobs, isGenerationActive, backendJobStatus]);

  const viewDraft = async (draftId?: number, pageId?: number) => {
    if (!draftId) return;
    if (pageId) {
      setViewLoadingPageId(pageId);
    }
    try {
      // Always fetch from DB - single source of truth
      const response = await fetch(`${API_BASE_URL}/api/campaigns/drafts/${draftId}`, {
        headers: getAuthHeaders(),
      });
      if (response.status === 401 || response.status === 403) {
        handleUnauthorized();
        return;
      }
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to load draft');
      }
      // Set draft data and ID - PublishExperience will fetch from DB using initialDraftId
      setPreviewDraft(data.draft);
      setPreviewPageId(draftId); // This will trigger PublishExperience to fetch from DB
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to load draft',
        variant: 'destructive',
      });
    } finally {
      if (pageId) {
        setViewLoadingPageId(null);
      }
    }
  };

  const publishDraft = async (draftId?: number, pageId?: number) => {
    if (!draftId) return;
    
    if (!hasWordpressIntegration) {
      toast({
        title: 'Connect WordPress',
        description: 'Add your WordPress credentials in the Integration tab',
        variant: 'destructive',
      });
      return;
    }

    if (pageId) {
      setPublishLoadingPageId(pageId);
    }

    try {
      // First fetch the draft to get all the data
      const draftResponse = await fetch(`${API_BASE_URL}/api/campaigns/drafts/${draftId}`, {
        headers: getAuthHeaders(),
      });
      
      if (draftResponse.status === 401 || draftResponse.status === 403) {
        handleUnauthorized();
        return;
      }

      const draftData = await draftResponse.json();
      if (!draftResponse.ok || !draftData.success) {
        throw new Error(draftData.error || 'Failed to load draft');
      }

      const draft = draftData.draft;
      if (!draft.htmlContent || !draft.title) {
        toast({
          title: 'Invalid Draft',
          description: 'Draft is missing required content',
          variant: 'destructive',
        });
        return;
      }

      // Publish to WordPress (pass draftId to update existing draft)
      const publishResponse = await fetch(`${API_BASE_URL}/api/publish/publish`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          draftId: draftId, // Pass draftId to update existing draft instead of creating new one
          primaryKeyword: draft.primaryKeyword,
          htmlContent: draft.htmlContent,
          featuredImage: draft.featuredImage,
          title: draft.title,
          metaDescription: draft.metaDescription,
          slug: draft.slug,
        }),
      });

      const publishData = await publishResponse.json();
      if (!publishResponse.ok || !publishData.success) {
        throw new Error(publishData.error || 'Publish request failed');
      }

      // Show appropriate toast based on publish status
      if (publishData.status === 'published' && publishData.publishedUrl) {
        toast({
          title: 'Published',
          description: `Content published successfully. View it here: ${publishData.publishedUrl}`,
        });
      } else if (publishData.status === 'failed') {
        toast({
          title: 'Publish Failed',
          description: 'WordPress did not return a valid URL. The publish may have failed.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Published',
          description: 'Content sent to WordPress successfully',
        });
      }

      // Refresh draft status to show updated state
      if (campaignStructure.topics && campaignStructure.topics.length > 0) {
        try {
          const rehydrateMap = new Map<number, GenerationPageStatus>();
          for (const topic of campaignStructure.topics) {
            try {
              const statusResponse = await fetch(
                `${API_BASE_URL}/api/campaigns/topics/${topic.id}/drafts-status`,
                { headers: getAuthHeaders() }
              );
              if (statusResponse.ok) {
                const statusData = await statusResponse.json();
                if (statusData.success && statusData.pages) {
                  statusData.pages.forEach((p: DraftStatusRecord) => {
                    if (p.draftId || p.jobId || p.hasHtml) {
                      rehydrateMap.set(p.pageId, {
                        jobId: p.jobId || '',
                        pageId: p.pageId,
                        pageType: p.pageType === 'subpage' ? 'subpage' : 'pillar',
                        status: (p.status || 'pending') as GenerationPageStatus['status'],
                        draftId: p.draftId,
                        progress: typeof p.progress === 'number' ? p.progress : p.hasHtml ? 100 : 0,
                        primaryKeyword: p.primaryKeyword,
                        hasHtml: p.hasHtml,
                        updatedAt: p.updatedAt,
                        error: p.error || null,
                        wordpressUrl: p.wordpressUrl || null,
                      });
                    }
                  });
                }
              }
            } catch (err) {
              // Silently fail for individual topics
            }
          }
          if (rehydrateMap.size > 0) {
            setGenerationJobs(rehydrateMap);
          }
        } catch (err) {
          // Silently fail refresh
        }
      }
    } catch (error) {
      console.error('Error publishing draft:', error);
      toast({
        title: 'Publish Failed',
        description: error instanceof Error ? error.message : 'Unable to publish content',
        variant: 'destructive',
      });
    } finally {
      if (pageId) {
        setPublishLoadingPageId(null);
      }
    }
  };

  const renderStatusPill = (pageId?: number) => {
    if (!pageId) return null;
    const job = generationJobs.get(pageId);
    if (!job) return null;
    
    // Use robust status determination
    let status = job.status;
    const jobId = job.jobId;
    
    // If has HTML, always completed
    if (job.hasHtml && status !== 'published') {
      status = 'completed';
    } else if (status !== 'completed' && status !== 'published' && jobId) {
      // Check if generation is active
      const generationActive = isGenerationActive(jobId);
      const backendStatus = backendJobStatus.get(jobId);
      
      // Only mark as failed if generation is not active AND backend confirms failed
      if (status === 'failed' || (status !== 'completed' && !generationActive && backendStatus?.status === 'failed')) {
        status = 'failed';
      } else if (generationActive || backendStatus?.status === 'generating') {
        // Keep as generating if active or backend says generating
        status = 'generating';
      }
    }
    
    if (status === 'pending') return null;
    const label =
      status === 'published' ? 'Published' :
      status === 'completed' ? 'Completed' :
      status === 'failed' ? 'Failed' :
      'Generating';
    const color =
      status === 'published' ? 'bg-purple-100 text-purple-700' :
      status === 'completed' ? 'bg-green-100 text-green-700' :
      status === 'failed' ? 'bg-red-100 text-red-700' :
      'bg-blue-100 text-blue-700';
    const progress = job.progress ?? (status === 'completed' || status === 'published' ? 100 : undefined);

    return (
        <span className={`px-2 py-1 text-[11px] rounded-full ${color}`}>
          {label}{typeof progress === 'number' ? ` • ${progress}%` : ''}
        </span>
    );
  };

  const currentTopic = currentGenerationTopicId
    ? campaignStructure.topics.find((t) => t.id === currentGenerationTopicId)
    : null;

  // Generation drawer stepper (simplified to 3 steps similar to publish flow)
  const generationSteps = [
    { id: 1, title: 'Word Count', description: 'Dial in the depth' },
    { id: 2, title: 'Imagery', description: 'Inline images & featured banner' },
    { id: 3, title: 'Brand', description: 'Tone & voice alignment' },
  ];
  const [generationStep, setGenerationStep] = useState(1);

  const handleGenerateTopic = async (topic: Topic, options?: { wordCount: number; images: number; featuredImage: boolean; brandName?: string; brandDescription?: string; }) => {
    if (!canGenerateTopic(topic)) {
      toast({
        title: 'Add keywords first',
        description: 'Pillar and sub-pages need at least one keyword each before generating.',
        variant: 'destructive',
      });
      return;
    }
    setGenerateTopicLoading(topic.id);
    try {
      // Helper function to get primary and longtail keywords from a page's keywords
      const getKeywordSelections = (pageKeywords: Array<{ id: number; term: string; aiMetadata?: any }>) => {
        // Find primary keyword (marked with isPrimary: true in aiMetadata)
        const primaryKeyword = pageKeywords.find(kw => {
          const metadata = kw.aiMetadata as any;
          return metadata?.isPrimary === true;
        });
        
        // Find longtail keywords (marked with isLongtail: true in aiMetadata)
        const longtailKeywords = pageKeywords.filter(kw => {
          const metadata = kw.aiMetadata as any;
          return metadata?.isLongtail === true;
        });
        
        // Fallback: if no primary selected, use first keyword
        // If no longtail selected, use remaining keywords
        const fallbackPrimary = primaryKeyword || pageKeywords[0];
        const fallbackLongtail = longtailKeywords.length > 0 
          ? longtailKeywords 
          : pageKeywords.filter((_, idx) => idx > 0);
        
        return {
          primary: fallbackPrimary?.term || '',
          longtail: fallbackLongtail.map(k => k.term).filter(Boolean)
        };
      };

      // Build payload from current topic data
      const pillar = topic.pillarPage!;
      const pillarKeywords = getKeywordSelections(pillar.keywords);
      
      const payload = {
        user_id: 'user', // backend uses authenticated user
        campaign_name: campaign.title,
        pillar_page: {
          primary_keyword: pillarKeywords.primary || pillar.title,
          longtail_keywords: pillarKeywords.longtail,
          options: {
            image: options?.images ?? 2,
            word_count: options?.wordCount ?? 800,
            featured_image: options?.featuredImage ? 'yes' : 'no',
          },
        },
        sub_pillar_pages: topic.subPages.map((sp) => {
          const subPageKeywords = getKeywordSelections(sp.keywords);
          return {
            primary_keyword: subPageKeywords.primary || sp.title,
            longtail_keywords: subPageKeywords.longtail,
          options: {
            image: options?.images ?? 2,
            word_count: options?.wordCount ?? 800,
            featured_image: options?.featuredImage ? 'yes' : 'no',
          },
          };
        }),
        brand: {
          brand_name: options?.brandName || campaign.title || 'Brand',
          brand_description: options?.brandDescription || campaign.description || '',
        },
      };

      const response = await fetch(`${API_BASE_URL}/api/campaigns/topics/${topic.id}/generate-content`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });

      if (response.status === 401 || response.status === 403) {
        handleUnauthorized();
        return;
      }

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to start generation');
      }

      const { jobId, pages } = data as { jobId: string; pages: { pageId: number; pageType: string; draftId?: number; primaryKeyword?: string; }[] };

      // Store jobId -> topicId mapping for streaming updates
      setJobIdToTopicId(prev => {
        const updated = new Map(prev);
        updated.set(jobId, topic.id);
        return updated;
      });

      setGenerationJobs((prev) => {
        const updated = new Map(prev);
        pages.forEach((p) => {
          updated.set(p.pageId, {
            jobId,
            pageId: p.pageId,
            pageType: p.pageType === 'subpage' ? 'subpage' : 'pillar',
            status: 'generating',
            draftId: p.draftId,
            progress: 0,
            primaryKeyword: p.primaryKeyword,
            hasHtml: false,
            updatedAt: new Date().toISOString(),
            error: null,
          });
        });
        return updated;
      });

      toast({
        title: 'Generation started',
        description: `Job ${jobId} is generating ${pages.length} page(s).`,
      });
    } catch (error) {
      toast({
        title: 'Generation failed',
        description: error instanceof Error ? error.message : 'Unable to start generation',
        variant: 'destructive',
      });
    } finally {
      setGenerateTopicLoading(null);
      setGenerationDrawerOpen(false);
    }
  };

  const handleSubmitSubPage = async () => {
    if (!newSubPageTitle.trim() || !targetTopicId) {
      toast({
        title: "Title Required",
        description: "Please enter a sub-page title",
        variant: "destructive",
      });
      return;
    }
    try {
      await mutateStructure(
        `${CAMPAIGN_API_BASE}/topics/${targetTopicId}/subpages`,
        {
          method: "POST",
          body: JSON.stringify({
            title: newSubPageTitle.trim(),
          }),
        },
        { successMessage: "Sub-page added" }
      );
      setShowAddSubPageModal(false);
      setNewSubPageTitle("");
      setTargetTopicId(null);
    } catch {
      // handled upstream
    }
  };

  const fetchDomainKeywords = useCallback(async (campaignId: number) => {
    setLoadingKeywords(true);
    try {
      const response = await fetch(`${CAMPAIGN_API_BASE}/${campaignId}/keywords`, {
        method: 'GET',
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        if (response.status === 401) {
          handleUnauthorized();
          return;
        }
        const errorData = await response.json().catch(() => ({}));
        console.error('Failed to fetch keywords:', response.status, errorData);
        setAvailableKeywords([]);
        return;
      }

      const data = await response.json();
      console.log('Keywords API Response:', {
        success: data.success,
        keywordCount: data.keywords?.length || 0,
        sampleKeywords: data.keywords?.slice(0, 3)
      });
      if (data.success && data.keywords) {
        const keywords = data.keywords || [];
        console.log('Setting keywords:', keywords.length, 'keywords');
        setAvailableKeywords(keywords);
      } else {
        console.log('No keywords in response or success=false');
        setAvailableKeywords([]);
      }
    } catch (error) {
      console.error('Error fetching keywords:', error);
      setAvailableKeywords([]);
    } finally {
      setLoadingKeywords(false);
    }
  }, [CAMPAIGN_API_BASE, getAuthHeaders, handleUnauthorized]);

  // Debug: Log when availableKeywords changes
  useEffect(() => {
    console.log('Available keywords changed:', {
      count: availableKeywords.length,
      keywords: availableKeywords.slice(0, 5).map(k => k.term)
    });
  }, [availableKeywords]);

  const handleAddKeyword = (type: 'pillar' | 'subpage', topicId: number, pageId: number, isAI: boolean, keywordSection?: 'primary' | 'longtail') => {
    if (isAI) {
      if (aiLoading === `keyword-${pageId}`) return;
      triggerAiKeywords(pageId);
      return;
    }
    console.log('Opening keyword modal for campaign:', campaign.id);
    setAddKeywordContext({ type, topicId, pageId });
    setNewKeywordTerm('');
    setNewKeywordVolume('');
    setNewKeywordDifficulty('Medium');
    setNewKeywordType(keywordSection || 'primary');
    setKeywordSearchValue('');
    setKeywordSearchOpen(false);
    // Fetch keywords for the campaign's domain
    fetchDomainKeywords(campaign.id);
    setShowAddKeywordModal(true);
  };

  const handleSubmitKeyword = async () => {
    if (!newKeywordTerm.trim() || !addKeywordContext) {
      toast({
        title: "Keyword Required",
        description: "Please enter a keyword term",
        variant: "destructive",
      });
      return;
    }
    try {
      const response = await fetch(`${CAMPAIGN_API_BASE}/pages/${addKeywordContext.pageId}/keywords`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          term: newKeywordTerm.trim(),
          volume: newKeywordVolume ? parseInt(newKeywordVolume, 10) : undefined,
          difficulty: newKeywordDifficulty,
          keywordType: newKeywordType // Send keyword type to backend
        })
      });
      
      if (!response.ok) throw new Error('Failed to add keyword');
      const data = await response.json();
      
      if (data.success) {
        fetchStructure(campaign.id);
      }
      
      setShowAddKeywordModal(false);
      setNewKeywordTerm('');
      setNewKeywordVolume('');
      setNewKeywordDifficulty('Medium');
      setNewKeywordType('primary');
      setAddKeywordContext(null);
      
      toast({
        title: "Keyword Added",
        description: `Keyword added as ${newKeywordType === 'primary' ? 'primary' : 'longtail'}`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add keyword",
        variant: "destructive"
      });
    }
  };

  const handleDeleteTopic = (topicId: number, topicTitle: string) => {
  confirmDelete(`Topic`, () =>
    mutateStructure(
      `${CAMPAIGN_API_BASE}/topics/${topicId}`,
      { method: "DELETE" },
      { successMessage: "Topic deleted" }
    )
  );
};


  const handleDeletePillarPage = (topicId: number) => {
  confirmDelete("Pillar page", () =>
    mutateStructure(
      `${CAMPAIGN_API_BASE}/topics/${topicId}/pillar`,
      { method: "DELETE" },
      { successMessage: "Pillar page deleted" }
    )
  );
};

  const handleDeleteSubPage = (subPageId: number) => {
  confirmDelete("Sub-page", () =>
    mutateStructure(
      `${CAMPAIGN_API_BASE}/pages/${subPageId}`,
      { method: "DELETE" },
      { successMessage: "Sub-page deleted" }
    )
  );
};

  const handleDeleteKeyword = (_context: { type: 'pillar' | 'subpage'; topicId: number; pageId: number }, keywordId: number) => {
    if (!confirm('Are you sure you want to delete this keyword?')) return;
    mutateStructure(`${CAMPAIGN_API_BASE}/keywords/${keywordId}`, {
      method: 'DELETE'
    }, { successMessage: "Keyword deleted" }).catch(() => {
      /* handled upstream */
    });
  };

  const handleSelectPrimaryKeyword = async (keywordId: number) => {
    try {
      await mutateStructure(`${CAMPAIGN_API_BASE}/keywords/${keywordId}/select-primary`, {
        method: 'POST'
      }, { successMessage: "Primary keyword selected" });
    } catch {
      // handled upstream
    }
  };

  const handleSelectLongtailKeyword = async (keywordId: number) => {
    try {
      await mutateStructure(`${CAMPAIGN_API_BASE}/keywords/${keywordId}/select-longtail`, {
        method: 'POST'
      }, { successMessage: "Longtail keyword selected" });
    } catch {
      // handled upstream
    }
  };

  const handleDeselectKeyword = async (keywordId: number) => {
    try {
      await mutateStructure(`${CAMPAIGN_API_BASE}/keywords/${keywordId}/deselect`, {
        method: 'POST'
      }, { successMessage: "Keyword deselected" });
    } catch {
      // handled upstream
    }
  };

  if (structureLoading) {
    return (
      <div className="w-full flex items-center justify-center py-32">
        <div className="flex flex-col items-center text-center">
          <div className="h-10 w-10 border-2 border-gray-300 border-t-black rounded-full animate-spin mb-4"></div>
          <p className="text-sm font-light text-gray-500">
            Loading campaign structure...
          </p>
        </div>
        
      </div>
    );
  }

  if (structureError) {
    return (
      <div className="w-full max-w-xl mx-auto text-center py-24">
        <p className="text-base font-light text-gray-600 mb-4">
          {structureError}
        </p>
        <button
          onClick={() => fetchStructure(campaign.id)}
          className="px-6 py-3 bg-black text-white rounded-full hover:bg-black/90 transition-all text-sm font-medium"
        >
          Retry
        </button>
      </div>
    );
  }

  // Streaming Progress Indicator Component
  const StreamingProgressIndicator: React.FC<{
    topicId: number;
    jobId: string | null;
    messages: Array<{ message: string; timestamp: string }>;
  }> = ({ topicId, jobId, messages }) => {
    const [isVisible, setIsVisible] = React.useState(false);
    
    React.useEffect(() => {
      if (!jobId || messages.length === 0) {
        setIsVisible(false);
        return;
      }
      
      const latestMessage = messages[messages.length - 1];
      const messageAge = new Date().getTime() - new Date(latestMessage.timestamp).getTime();
      const isRecent = messageAge < 10000; // Show for 10 seconds after last message
      
      setIsVisible(isRecent);
      
      // Auto-hide after 10 seconds of inactivity
      if (isRecent) {
        const timer = setTimeout(() => {
          setIsVisible(false);
        }, 10000 - messageAge);
        return () => clearTimeout(timer);
      }
    }, [jobId, messages]);
    
    if (!jobId || messages.length === 0 || !isVisible) return null;
    
    const latestMessage = messages[messages.length - 1];
    
    return (
      <div className="absolute top-3 right-3 z-10">
        <div 
          className="bg-black/85 backdrop-blur-md text-white px-3 py-1.5 rounded-full text-xs font-light flex items-center gap-2 shadow-xl border border-white/10 transition-opacity duration-300"
          style={{ letterSpacing: '0.011em' }}
        >
          <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse flex-shrink-0" />
          <span className="max-w-[220px] truncate">
            {latestMessage.message}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            title="Back to campaigns"
          >
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </button>
          <div>
            <h2 className="text-3xl font-thin text-black tracking-tight mb-2">
              {campaign.title}
            </h2>
            {campaign.description && (
              <p className="text-base font-light text-gray-600">
                {campaign.description}
              </p>
            )}
          </div>
        </div>
        {syncing && (
          <div className="flex items-center gap-2 text-xs font-light text-gray-500">
            <span className="inline-flex h-2 w-2 rounded-full bg-gray-400 animate-pulse"></span>
            Syncing changes...
          </div>
        )}
      </div>

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

      {/* Graph Overview */}
      <div className="w-full h-[700px] mb-10">
        <CampaignGraph
          campaignStructure={campaignStructure}
          selectedTopics={selectedTopics}
        />
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-10">
        <button
          onClick={handleContinue}
          disabled={selectedTopics.size === 0 || syncing}
          className="px-6 py-2.5 bg-black text-white rounded-full hover:bg-black/90 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all text-sm font-medium flex items-center gap-2 shadow-sm"
        >
          Continue
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleAddTopic(false)}
            disabled={syncing}
            className="px-4 py-2 bg-gray-100 text-gray-900 rounded-full hover:bg-gray-200 transition-all text-sm font-light flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Plus className="h-4 w-4" />
            Add topic manually
          </button>
          <button
            onClick={() => handleAddTopic(true)}
            disabled={syncing || aiLoading === "topic"}
            className="px-4 py-2 bg-black text-white rounded-full hover:bg-black/90 transition-all text-sm font-medium flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {aiLoading === "topic" ? (
              <ButtonSpinner />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {aiLoading === "topic" ? "Generating..." : "AI Generate"}
          </button>
        </div>
      </div>

      {/* Active Generation Progress Section */}
      {(() => {
        // Collect all active generations
        const activeGenerations: Array<{
          topicId: number;
          topicTitle: string;
          jobId: string;
          messages: Array<{ message: string; timestamp: string }>;
          pages: Array<{ pageId: number; status: string; progress: number }>;
        }> = [];

        campaignStructure.topics.forEach(topic => {
          const topicJobId = Array.from(jobIdToTopicId.entries())
            .find(([_, tid]) => tid === topic.id)?.[0];
          
          if (topicJobId && isGenerationActive(topicJobId)) {
            const messages = streamingMessages.get(topicJobId) || [];
            const backendStatus = backendJobStatus.get(topicJobId);
            
            // Count completed pages
            const topicPages = Array.from(generationJobs.values())
              .filter(job => job.jobId === topicJobId);
            const completedCount = topicPages.filter(p => p.hasHtml || p.status === 'completed').length;
            const totalCount = topicPages.length || (topic.pillarPage ? 1 : 0) + topic.subPages.length;

            activeGenerations.push({
              topicId: topic.id,
              topicTitle: topic.title,
              jobId: topicJobId,
              messages,
              pages: backendStatus?.pages || []
            });
          }
        });

        if (activeGenerations.length === 0) return null;

        return (
          <div className="mb-8 space-y-4">
            {activeGenerations.map(({ topicId, topicTitle, jobId, messages, pages }) => {
              const latestMessage = messages[messages.length - 1];
              
              // Count pages from generationJobs if backend pages not available
              const topicPages = Array.from(generationJobs.values())
                .filter(job => job.jobId === jobId);
              
              const completedCount = pages.length > 0 
                ? pages.filter(p => p.status === 'completed').length
                : topicPages.filter(p => p.hasHtml || p.status === 'completed').length;
              
              const totalCount = pages.length > 0 
                ? pages.length 
                : topicPages.length || 3; // Default to 3 if no pages info
              
              const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
              
              return (
                <div
                  key={jobId}
                  className="bg-white/80 backdrop-blur-xl border border-gray-200/60 rounded-3xl p-5 shadow-sm transition-all duration-300 hover:shadow-md"
                  style={{
                    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)'
                  }}
                >
                  <div className="flex items-start justify-between gap-5">
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-3">
                        <div className="relative flex-shrink-0">
                          <div className="w-2 h-2 bg-gray-900 rounded-full" />
                          <div className="absolute inset-0 w-2 h-2 bg-gray-900 rounded-full animate-ping opacity-75" />
                        </div>
                        <h4 className="text-sm font-light text-gray-900 tracking-tight truncate" style={{ letterSpacing: '0.01em' }}>
                          {topicTitle}
                        </h4>
                      </div>
                      
                      {latestMessage && (
                        <p className="text-xs text-gray-500 font-extralight ml-5 leading-relaxed" style={{ letterSpacing: '0.005em' }}>
                          {latestMessage.message}
                        </p>
                      )}
                      
                      <div className="ml-5 flex items-center gap-3">
                        <div className="flex-1 h-0.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gray-900 transition-all duration-500 ease-out"
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-gray-400 font-extralight tabular-nums" style={{ letterSpacing: '0.02em' }}>
                          {completedCount}/{totalCount}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Topics List */}
      <div className="space-y-4">
        {campaignStructure.topics.map((topic) => {
          // Find jobId for this topic
          const topicJobId = Array.from(jobIdToTopicId.entries())
            .find(([_, tid]) => tid === topic.id)?.[0] || null;
          const topicMessages = topicJobId ? streamingMessages.get(topicJobId) || [] : [];
          
          return (
            <div
              key={topic.id}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden relative"
            >
              {/* Streaming Progress Indicator */}
              <StreamingProgressIndicator 
                topicId={topic.id}
                jobId={topicJobId}
                messages={topicMessages}
              />
              
              {/* Topic Header */}
              <div className="flex items-center justify-between p-6 hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-3 flex-1">
                <button
                  onClick={() => toggleTopic(topic.id)}
                  className="p-1 hover:bg-gray-200 rounded transition-colors"
                >
                  <ChevronRight
                    className={`h-5 w-5 text-gray-400 transition-transform duration-200 ${
                      expandedTopics.has(topic.id) ? "rotate-90" : ""
                    }`}
                  />
                </button>
                <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-purple-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-light text-black tracking-tight">
                    {topic.title}
                  </h3>
                  <p className="text-xs font-light text-gray-500 mt-0.5">
                    {topic.pillarPage ? "1 pillar page" : "No pillar page"} •{" "}
                    {topic.subPages.length} sub-page
                    {topic.subPages.length !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                  <button
                  onClick={() => {
                    setCurrentGenerationTopicId(topic.id);
                    setGenerationForm((prev) => ({
                      ...prev,
                      wordCount: prev.wordCount || 800,
                      images: prev.images || 2,
                      featuredImage: prev.featuredImage ?? true,
                      brandName: derivedBrandName || prev.brandName || '',
                      brandDescription: derivedBrandDescription || prev.brandDescription || '',
                    }));
                    setGenerationDrawerOpen(true);
                  }}
                  disabled={
                    !canGenerateTopic(topic) ||
                    generateTopicLoading === topic.id ||
                    isTopicGenerating(topic)
                  }
                  className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-full bg-gradient-to-r from-black to-gray-800 text-white shadow-sm hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  title={
                    canGenerateTopic(topic)
                      ? 'Generate content for this topic'
                      : 'Add a pillar page and at least one keyword per page to enable generation'
                  }
                >
                  {generateTopicLoading === topic.id || isTopicGenerating(topic) ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Generating…</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Generate</span>
                    </>
                  )}
                  </button>
                <button
                  onClick={() => handleDeleteTopic(topic.id)}
                  disabled={syncing}
                  className="p-2 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Delete topic"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Topic Content */}
            {expandedTopics.has(topic.id) && (
              <div className="px-6 pb-6 pt-0 border-t border-gray-100">
                <div className="pt-6 space-y-4">
                  {/* Pillar Page Section */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-medium text-gray-900">
                        Pillar Page
                      </h4>
                      {!topic.pillarPage && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleAddPillarPage(topic.id, false)}
                            disabled={syncing}
                            className="px-3 py-1.5 text-xs font-light text-gray-600 hover:text-black hover:bg-gray-100 rounded-full transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Add pillar page manually
                          </button>
                          <button
                            onClick={() => handleAddPillarPage(topic.id, true)}
                            disabled={
                              syncing || aiLoading === `pillar-${topic.id}`
                            }
                            className="px-3 py-1.5 text-xs font-light text-white bg-black hover:bg-black/90 rounded-full transition-all flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            {aiLoading === `pillar-${topic.id}` ? (
                              <ButtonSpinner />
                            ) : (
                              <Sparkles className="h-3.5 w-3.5" />
                            )}
                            {aiLoading === `pillar-${topic.id}`
                              ? "Generating"
                              : "Generate pillar page"}
                          </button>
                        </div>
                      )}
                    </div>

                    {topic.pillarPage ? (
                      <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3 flex-1">
                            <button
                              onClick={() =>
                                togglePillarPage(topic.pillarPage!.id)
                              }
                              className="p-1 hover:bg-gray-200 rounded transition-colors"
                            >
                              <ChevronRight
                                className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${
                                  expandedPillarPages.has(topic.pillarPage!.id)
                                    ? "rotate-90"
                                    : ""
                                }`}
                              />
                            </button>
                            <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center">
                              <FileText className="h-4 w-4 text-green-600" />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-3">
                              <h5 className="text-sm font-light text-black">{topic.pillarPage.title}</h5>
                                {(() => {
                                  const job = generationJobs.get(topic.pillarPage.id);
                                  const updatedAtMs = job?.updatedAt ? new Date(job.updatedAt).getTime() : undefined;
                                  const staleClient = updatedAtMs ? (Date.now() - updatedAtMs > 5 * 60 * 1000) : false;
                                  const status = staleClient && !job?.hasHtml ? 'failed' : job?.status;
                                  const isLoading = viewLoadingPageId === topic.pillarPage.id;
                                  const isPublishing = publishLoadingPageId === topic.pillarPage.id;
                                  const isPublished = status === 'published' && job?.wordpressUrl;
                                  const canView = (status === 'completed' || status === 'published') && job?.draftId;
                                  
                                  if (canView) {
                                    return (
                                      <div className="flex items-center gap-2">
                                        <button
                                          onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            viewDraft(job.draftId, topic.pillarPage.id);
                                          }}
                                          disabled={isLoading || isPublishing}
                                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black text-white text-xs font-medium hover:bg-gray-800 transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
                                        >
                                          {isLoading ? (
                                            <>
                                              <Loader2 className="h-3 w-3 animate-spin" />
                                              Opening...
                                            </>
                                          ) : (
                                            'View'
                                          )}
                                        </button>
                                        {isPublished && job.wordpressUrl && (
                                          <a
                                            href={job.wordpressUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={(e) => e.stopPropagation()}
                                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-600 text-white text-xs font-medium hover:bg-purple-700 transition-all shadow-sm"
                                          >
                                            View Live
                                          </a>
                                        )}
                                        {!isPublished && (
                                          <button
                                            onClick={(e) => {
                                              e.preventDefault();
                                              e.stopPropagation();
                                              publishDraft(job.draftId, topic.pillarPage.id);
                                            }}
                                            disabled={isLoading || isPublishing || !hasWordpressIntegration}
                                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
                                            title={!hasWordpressIntegration ? 'WordPress integration required' : ''}
                                          >
                                            {isPublishing ? (
                                              <>
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                                Publishing...
                                              </>
                                            ) : (
                                              'Publish'
                                            )}
                                          </button>
                                        )}
                                      </div>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>
                              <p className="text-xs font-light text-gray-500 mt-0.5">
                                {topic.pillarPage.keywords.length} keyword
                                {topic.pillarPage.keywords.length !== 1
                                  ? "s"
                                  : ""}
                              </p>
                                  <div className="mt-1">
                                    {renderStatusPill(topic.pillarPage.id)}
                                  </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleDeletePillarPage(topic.id)}
                              disabled={syncing}
                              className="p-1.5 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Delete pillar page"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Pillar Page Keywords */}
                        {expandedPillarPages.has(topic.pillarPage.id) && (
                          <div className="ml-11 mt-3 space-y-4">
                            {/* Primary Keywords Section */}
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <label className="text-xs font-medium text-gray-700">
                                  Primary Keywords <span className="text-red-500">*</span>
                                </label>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleAddKeyword('pillar', topic.id, topic.pillarPage!.id, false)}
                                  disabled={syncing}
                                  className="px-2 py-1 text-xs font-light text-gray-600 hover:text-black hover:bg-gray-100 rounded-full transition-all flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Add primary keyword manually"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                              <button
                                    onClick={async () => {
                                      if (aiLoading === `primary-keyword-${topic.pillarPage!.id}`) return;
                                      setAiLoading(`primary-keyword-${topic.pillarPage!.id}`);
                                      try {
                                        const response = await fetch(`${CAMPAIGN_API_BASE}/pages/${topic.pillarPage!.id}/keywords/ai`, {
                                          method: 'POST',
                                          headers: getAuthHeaders(),
                                          body: JSON.stringify({ count: 1, keywordType: 'primary' })
                                        });
                                        if (!response.ok) throw new Error('Failed to generate');
                                        const data = await response.json();
                                        if (data.success) {
                                          fetchStructure(campaign.id);
                                          toast({
                                            title: 'Keyword generated',
                                            description: 'Primary keyword generated successfully',
                                          });
                                        }
                                      } catch (error) {
                                        console.error('Error generating primary keyword:', error);
                                        toast({
                                          title: 'Generation failed',
                                          description: 'Unable to generate primary keyword',
                                          variant: 'destructive'
                                        });
                                      } finally {
                                        setAiLoading(null);
                                      }
                                    }}
                                    disabled={syncing || aiLoading === `primary-keyword-${topic.pillarPage!.id}`}
                                  className="px-2 py-1 text-xs font-light text-white bg-black hover:bg-black/90 rounded-full transition-all flex items-center gap-1 disabled:opacity-60 disabled:cursor-not-allowed"
                                    title="AI generate primary keyword"
                              >
                                    {aiLoading === `primary-keyword-${topic.pillarPage!.id}` ? <ButtonSpinner /> : <Sparkles className="h-3 w-3" />}
                                    Generate primary keywords
                              </button>
                                </div>
                              </div>
                              <div className="space-y-2">
                                {(() => {
                                  // Only show keywords that are actually marked as primary
                                  const primaryKeywords = topic.pillarPage.keywords.filter(kw => {
                                    const metadata = kw.aiMetadata as any;
                                    return metadata && metadata.isPrimary === true;
                                  });
                                  
                                  return primaryKeywords.length > 0 ? (
                                    primaryKeywords.map((keyword) => (
                                      <div
                                        key={keyword.id}
                                        className="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
                                      >
                                        <div className="flex items-center gap-3">
                                          <div className="w-6 h-6 rounded bg-purple-50 flex items-center justify-center">
                                            <span className="text-[10px] font-medium text-purple-600">P</span>
                                          </div>
                                          <div>
                                            <p className="text-sm font-light text-black">{keyword.term}</p>
                                            <p className="text-xs font-light text-gray-500">
                                              Vol: {keyword.volume.toLocaleString()} • KD: {keyword.difficulty}
                                            </p>
                                          </div>
                            </div>
                            <button
                                          onClick={() => handleDeleteKeyword({ type: 'pillar', topicId: topic.id, pageId: topic.pillarPage!.id }, keyword.id)}
                              disabled={syncing}
                                          className="p-1 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                          title="Delete keyword"
                            >
                                          <X className="h-3.5 w-3.5" />
                            </button>
                                      </div>
                                    ))
                                  ) : (
                                    <p className="text-xs font-light text-gray-500 italic py-2">No primary keywords yet</p>
                                  );
                                })()}
                          </div>
                        </div>

                            {/* Longtail Keywords Section */}
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <label className="text-xs font-medium text-gray-700">
                                  Longtail Keywords
                                </label>
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => handleAddKeyword('pillar', topic.id, topic.pillarPage!.id, false, 'longtail')}
                                    disabled={syncing}
                                    className="px-2 py-1 text-xs font-light text-gray-600 hover:text-black hover:bg-gray-100 rounded-full transition-all flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Add longtail keyword manually"
                                  >
                                    <Plus className="h-3 w-3" />
                                  </button>
                                  <button
                                    onClick={async () => {
                                      if (aiLoading === `longtail-keyword-${topic.pillarPage!.id}`) return;
                                      setAiLoading(`longtail-keyword-${topic.pillarPage!.id}`);
                                      try {
                                        const response = await fetch(`${CAMPAIGN_API_BASE}/pages/${topic.pillarPage!.id}/keywords/ai`, {
                                          method: 'POST',
                                          headers: getAuthHeaders(),
                                          body: JSON.stringify({ count: 3, keywordType: 'longtail' })
                                        });
                                        if (!response.ok) throw new Error('Failed to generate');
                                        const data = await response.json();
                                        if (data.success) {
                                          fetchStructure(campaign.id);
                                          toast({
                                            title: 'Keywords generated',
                                            description: 'Longtail keywords generated successfully',
                                          });
                                        }
                                      } catch (error) {
                                        console.error('Error generating longtail keywords:', error);
                                        toast({
                                          title: 'Generation failed',
                                          description: 'Unable to generate longtail keywords',
                                          variant: 'destructive'
                                        });
                                      } finally {
                                        setAiLoading(null);
                                      }
                                    }}
                                    disabled={syncing || aiLoading === `longtail-keyword-${topic.pillarPage!.id}`}
                                    className="px-2 py-1 text-xs font-light text-white bg-black hover:bg-black/90 rounded-full transition-all flex items-center gap-1 disabled:opacity-60 disabled:cursor-not-allowed"
                                    title="AI generate longtail keywords"
                                  >
                                    {aiLoading === `longtail-keyword-${topic.pillarPage!.id}` ? <ButtonSpinner /> : <Sparkles className="h-3 w-3" />}
                                    Generate longtail keywords
                                  </button>
                                </div>
                              </div>
                              <div className="space-y-2">
                                {(() => {
                                  // Filter keywords marked as longtail (and exclude primary)
                                  const longtailKeywords = topic.pillarPage.keywords.filter(kw => {
                                    const metadata = kw.aiMetadata as any;
                                    const isPrimary = metadata && metadata.isPrimary === true;
                                    const isLongtail = metadata && metadata.isLongtail === true;
                                    // Only show if marked as longtail and not primary
                                    return isLongtail && !isPrimary;
                                  });
                                  
                                  return longtailKeywords.length > 0 ? (
                                    longtailKeywords.map((keyword) => (
                                <div
                                  key={keyword.id}
                                  className="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
                                >
                                  <div className="flex items-center gap-3">
                                          <div className="w-6 h-6 rounded bg-green-50 flex items-center justify-center">
                                            <span className="text-[10px] font-medium text-green-600">L</span>
                                    </div>
                                    <div>
                                      <p className="text-sm font-light text-black">
                                        {keyword.term}
                                      </p>
                                      <p className="text-xs font-light text-gray-500">
                                        Vol: {keyword.volume.toLocaleString()} •
                                        KD: {keyword.difficulty}
                                      </p>
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => handleDeleteKeyword(keyword.id)}
                                    disabled={syncing}
                                    className="p-1 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Delete keyword"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ))
                            ) : (
                                    <p className="text-xs font-light text-gray-500 italic py-2">No longtail keywords yet</p>
                                  );
                                })()}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs font-light text-gray-500 italic py-2">
                        No pillar page created yet
                      </p>
                    )}
                  </div>

                  {/* Sub Pages Section */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-medium text-gray-900">
                        Sub Pages
                      </h4>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleAddSubPage(topic.id, false)}
                          disabled={syncing}
                          className="px-3 py-1.5 text-xs font-light text-gray-600 hover:text-black hover:bg-gray-100 rounded-full transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add sub page manually
                        </button>
                        <button
                          onClick={() => handleAddSubPage(topic.id, true)}
                          disabled={
                            syncing || aiLoading === `subpage-${topic.id}`
                          }
                          className="px-3 py-1.5 text-xs font-light text-white bg-black hover:bg-black/90 rounded-full transition-all flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {aiLoading === `subpage-${topic.id}` ? (
                            <ButtonSpinner />
                          ) : (
                            <Sparkles className="h-3.5 w-3.5" />
                          )}
                          {aiLoading === `subpage-${topic.id}`
                            ? "Generating"
                            : "Generate sub page"}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {topic.subPages.length > 0 ? (
                        topic.subPages.map((subPage) => (
                          <div
                            key={subPage.id}
                            className="bg-gray-50 rounded-xl border border-gray-200 p-4"
                          >
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-3 flex-1">
                                <button
                                  onClick={() => toggleSubPage(subPage.id)}
                                  className="p-1 hover:bg-gray-200 rounded transition-colors"
                                >
                                  <ChevronRight
                                    className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${
                                      expandedSubPages.has(subPage.id)
                                        ? "rotate-90"
                                        : ""
                                    }`}
                                  />
                                </button>
                                <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center">
                                  <FileText className="h-4 w-4 text-orange-600" />
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center gap-3">
                                  <h5 className="text-sm font-light text-black">{subPage.title}</h5>
                                    {(() => {
                                      const job = generationJobs.get(subPage.id);
                                      const updatedAtMs = job?.updatedAt ? new Date(job.updatedAt).getTime() : undefined;
                                      const staleClient = updatedAtMs ? (Date.now() - updatedAtMs > 5 * 60 * 1000) : false;
                                      const status = staleClient && !job?.hasHtml ? 'failed' : job?.status;
                                      const isLoading = viewLoadingPageId === subPage.id;
                                      const isPublishing = publishLoadingPageId === subPage.id;
                                      const isPublished = status === 'published' && job?.wordpressUrl;
                                      const canView = (status === 'completed' || status === 'published') && job?.draftId;
                                      
                                      if (canView) {
                                        return (
                                          <div className="flex items-center gap-2">
                                            <button
                                              onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                viewDraft(job.draftId, subPage.id);
                                              }}
                                              disabled={isLoading || isPublishing}
                                              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black text-white text-xs font-medium hover:bg-gray-800 transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
                                            >
                                              {isLoading ? (
                                                <>
                                                  <Loader2 className="h-3 w-3 animate-spin" />
                                                  Opening...
                                                </>
                                              ) : (
                                                'View'
                                              )}
                                            </button>
                                            {isPublished && job.wordpressUrl && (
                                              <a
                                                href={job.wordpressUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                onClick={(e) => e.stopPropagation()}
                                                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-600 text-white text-xs font-medium hover:bg-purple-700 transition-all shadow-sm"
                                              >
                                                View Live
                                              </a>
                                            )}
                                            {!isPublished && (
                                              <button
                                                onClick={(e) => {
                                                  e.preventDefault();
                                                  e.stopPropagation();
                                                  publishDraft(job.draftId, subPage.id);
                                                }}
                                                disabled={isLoading || isPublishing || !hasWordpressIntegration}
                                                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
                                                title={!hasWordpressIntegration ? 'WordPress integration required' : ''}
                                              >
                                                {isPublishing ? (
                                                  <>
                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                    Publishing...
                                                  </>
                                                ) : (
                                                  'Publish'
                                                )}
                                              </button>
                                            )}
                                          </div>
                                        );
                                      }
                                      return null;
                                    })()}
                                  </div>
                                  <p className="text-xs font-light text-gray-500 mt-0.5">
                                    {subPage.keywords.length} keyword
                                    {subPage.keywords.length !== 1 ? "s" : ""}
                                  </p>
                                  <div className="mt-1">
                                    {renderStatusPill(subPage.id)}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() =>
                                      handleAddKeyword(
                                        "subpage",
                                        topic.id,
                                        subPage.id,
                                        false
                                      )
                                    }
                                    disabled={syncing}
                                    className="px-2 py-1 text-xs font-light text-gray-600 hover:text-black hover:bg-gray-100 rounded-full transition-all flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Add keyword manually"
                                  >
                                    <Plus className="h-3 w-3" />
                                    Add keyword manually
                                  </button>
                                  <button
                                    onClick={() =>
                                      handleAddKeyword(
                                        "subpage",
                                        topic.id,
                                        subPage.id,
                                        true
                                      )
                                    }
                                    disabled={
                                      syncing ||
                                      aiLoading === `keyword-${subPage.id}`
                                    }
                                    className="px-2 py-1 text-xs font-light text-white bg-black hover:bg-black/90 rounded-full transition-all flex items-center gap-1 disabled:opacity-60 disabled:cursor-not-allowed"
                                    title="AI generate keywords"
                                  >
                                    {aiLoading === `keyword-${subPage.id}` ? (
                                      <ButtonSpinner />
                                    ) : (
                                      <Sparkles className="h-3 w-3" />
                                    )}
                                    Generate keywords
                                  </button>
                                </div>
                                <button
                                 onClick={() => handleDeleteSubPage(subPage.id)}

                                  disabled={syncing}
                                  className="p-1.5 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="Delete sub-page"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Sub Page Keywords */}
                        {expandedSubPages.has(subPage.id) && (
                          <div className="ml-11 mt-3 space-y-4">
                            {/* Primary Keywords Section */}
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <label className="text-xs font-medium text-gray-700">
                                  Primary Keywords <span className="text-red-500">*</span>
                                </label>
                                <div className="flex items-center gap-1">
                                  {/* <button
                                    onClick={() => handleAddKeyword('subpage', topic.id, subPage.id, false, 'primary')}
                                    disabled={syncing}
                                    className="px-2 py-1 text-xs font-light text-gray-600 hover:text-black hover:bg-gray-100 rounded-full transition-all flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Add primary keyword manually"
                                  >
                                    <Plus className="h-3 w-3" />
                                  </button> */}
                                  <button
                                    onClick={async () => {
                                      if (aiLoading === `primary-keyword-${subPage.id}`) return;
                                      setAiLoading(`primary-keyword-${subPage.id}`);
                                      try {
                                        const response = await fetch(`${CAMPAIGN_API_BASE}/pages/${subPage.id}/keywords/ai`, {
                                          method: 'POST',
                                          headers: getAuthHeaders(),
                                          body: JSON.stringify({ count: 1, keywordType: 'primary' })
                                        });
                                        if (!response.ok) throw new Error('Failed to generate');
                                        const data = await response.json();
                                        if (data.success) {
                                          fetchStructure(campaign.id);
                                          toast({
                                            title: 'Keyword generated',
                                            description: 'Primary keyword generated successfully',
                                          });
                                        }
                                      } catch (error) {
                                        console.error('Error generating primary keyword:', error);
                                        toast({
                                          title: 'Generation failed',
                                          description: 'Unable to generate primary keyword',
                                          variant: 'destructive'
                                        });
                                      } finally {
                                        setAiLoading(null);
                                      }
                                    }}
                                    disabled={syncing || aiLoading === `primary-keyword-${subPage.id}`}
                                    className="px-2 py-1 text-xs font-light text-white bg-black hover:bg-black/90 rounded-full transition-all flex items-center gap-1 disabled:opacity-60 disabled:cursor-not-allowed"
                                    title="AI generate primary keyword"
                                  >
                                    {aiLoading === `primary-keyword-${subPage.id}` ? <ButtonSpinner /> : <Sparkles className="h-3 w-3" />}
                                    Generate primary keywords
                                  </button>
                                </div>
                              </div>
                              <div className="space-y-2">
                                {(() => {
                                  // Only show keywords that are actually marked as primary
                                  const primaryKeywords = subPage.keywords.filter(kw => {
                                    const metadata = kw.aiMetadata as any;
                                    return metadata && metadata.isPrimary === true;
                                  });
                                  
                                  return primaryKeywords.length > 0 ? (
                                    primaryKeywords.map((keyword) => (
                                    <div
                                      key={keyword.id}
                                      className="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
                                    >
                                      <div className="flex items-center gap-3">
                                          <div className="w-6 h-6 rounded bg-purple-50 flex items-center justify-center">
                                            <span className="text-[10px] font-medium text-purple-600">P</span>
                                        </div>
                                        <div>
                                          <p className="text-sm font-light text-black">
                                            {keyword.term}
                                          </p>
                                          <p className="text-xs font-light text-gray-500">
                                            Vol:{" "}
                                            {keyword.volume.toLocaleString()} •
                                            KD: {keyword.difficulty}
                                          </p>
                                        </div>
                                      </div>
                                      <button
                                        onClick={() => handleDeleteKeyword(keyword.id)}

                                        disabled={syncing}
                                        className="p-1 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        title="Delete keyword"
                                      >
                                        <X className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  ))
                                ) : (
                                    <p className="text-xs font-light text-gray-500 italic py-2">No primary keywords yet</p>
                                  );
                                })()}
                              </div>
                            </div>

                            {/* Longtail Keywords Section */}
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <label className="text-xs font-medium text-gray-700">
                                  Longtail Keywords
                                </label>
                                <div className="flex items-center gap-1">
                                  {/* <button
                                    onClick={() => handleAddKeyword('subpage', topic.id, subPage.id, false, 'longtail')}
                                    disabled={syncing}
                                    className="px-2 py-1 text-xs font-light text-gray-600 hover:text-black hover:bg-gray-100 rounded-full transition-all flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Add longtail keyword manually"
                                  >
                                    <Plus className="h-3 w-3" />
                                  </button> */}
                                  <button
                                    onClick={async () => {
                                      if (aiLoading === `longtail-keyword-${subPage.id}`) return;
                                      setAiLoading(`longtail-keyword-${subPage.id}`);
                                      try {
                                        const response = await fetch(`${CAMPAIGN_API_BASE}/pages/${subPage.id}/keywords/ai`, {
                                          method: 'POST',
                                          headers: getAuthHeaders(),
                                          body: JSON.stringify({ count: 3, keywordType: 'longtail' })
                                        });
                                        if (!response.ok) throw new Error('Failed to generate');
                                        const data = await response.json();
                                        if (data.success) {
                                          fetchStructure(campaign.id);
                                          toast({
                                            title: 'Keywords generated',
                                            description: 'Longtail keywords generated successfully',
                                          });
                                        }
                                      } catch (error) {
                                        console.error('Error generating longtail keywords:', error);
                                        toast({
                                          title: 'Generation failed',
                                          description: 'Unable to generate longtail keywords',
                                          variant: 'destructive'
                                        });
                                      } finally {
                                        setAiLoading(null);
                                      }
                                    }}
                                    disabled={syncing || aiLoading === `longtail-keyword-${subPage.id}`}
                                    className="px-2 py-1 text-xs font-light text-white bg-black hover:bg-black/90 rounded-full transition-all flex items-center gap-1 disabled:opacity-60 disabled:cursor-not-allowed"
                                    title="AI generate longtail keywords"
                                  >
                                    {aiLoading === `longtail-keyword-${subPage.id}` ? <ButtonSpinner /> : <Sparkles className="h-3 w-3" />}
                                    Generate longtail keywords
                                  </button>
                                </div>
                              </div>
                              <div className="space-y-2">
                                {(() => {
                                  // Filter keywords marked as longtail (and exclude primary)
                                  const longtailKeywords = subPage.keywords.filter(kw => {
                                    const metadata = kw.aiMetadata as any;
                                    const isPrimary = metadata && metadata.isPrimary === true;
                                    const isLongtail = metadata && metadata.isLongtail === true;
                                    // Only show if marked as longtail and not primary
                                    return isLongtail && !isPrimary;
                                  });
                                  
                                  return longtailKeywords.length > 0 ? (
                                    longtailKeywords.map((keyword) => (
                                      <div
                                        key={keyword.id}
                                        className="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
                                      >
                                        <div className="flex items-center gap-3">
                                          <div className="w-6 h-6 rounded bg-green-50 flex items-center justify-center">
                                            <span className="text-[10px] font-medium text-green-600">L</span>
                                          </div>
                                          <div>
                                            <p className="text-sm font-light text-black">{keyword.term}</p>
                                            <p className="text-xs font-light text-gray-500">
                                              Vol: {keyword.volume.toLocaleString()} • KD: {keyword.difficulty}
                                            </p>
                                          </div>
                                        </div>
                                        <button
                                          onClick={() => handleDeleteKeyword({ type: 'subpage', topicId: topic.id, pageId: subPage.id }, keyword.id)}
                                          disabled={syncing}
                                          className="p-1 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                          title="Delete keyword"
                                        >
                                          <X className="h-3.5 w-3.5" />
                                        </button>
                                      </div>
                                    ))
                                  ) : (
                                    <p className="text-xs font-light text-gray-500 italic py-2">No longtail keywords yet</p>
                                  );
                                })()}
                              </div>
                            </div>
                              </div>
                            )}
                          </div>
                        ))
                      ) : (
                        <p className="text-xs font-light text-gray-500 italic py-2">
                          No sub-pages created yet
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          );
        })}

        {campaignStructure.topics.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
              <Sparkles className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-light text-black mb-2">
              No Topics Yet
            </h3>
            <p className="text-sm font-light text-gray-600 mb-4">
              Add your first topic to get started
            </p>
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => handleAddTopic(false)}
                className="px-4 py-2 bg-gray-100 text-gray-900 rounded-full hover:bg-gray-200 transition-all text-sm font-light flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Add topic manually
              </button>
              <button
                onClick={() => handleAddTopic(true)}
                className="px-4 py-2 bg-black text-white rounded-full hover:bg-black/90 transition-all text-sm font-medium flex items-center gap-2"
              >
                <Sparkles className="h-4 w-4" />
                AI Generate
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add Topic Modal */}
      {showAddTopicModal && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-gray-200 shadow-xl p-8 max-w-md w-full">
            <h3 className="text-xl font-light text-black tracking-tight mb-6">
              Add New Topic
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-light text-gray-900 mb-2">
                  Topic Title
                </label>
                <input
                  type="text"
                  value={newTopicTitle}
                  onChange={(e) => setNewTopicTitle(e.target.value)}
                  placeholder="Enter topic title"
                  className="w-full px-4 py-3 text-base font-light rounded-2xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all"
                  autoFocus
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowAddTopicModal(false);
                  setNewTopicTitle("");
                }}
                className="px-6 py-3 bg-gray-100 text-gray-900 rounded-full hover:bg-gray-200 transition-all text-base font-light"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitTopic}
                className="px-6 py-3 bg-black text-white rounded-full hover:bg-black/90 transition-all text-base font-medium"
              >
                Add Topic
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Pillar Page Modal */}
      {showAddPillarModal && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-gray-200 shadow-xl p-8 max-w-md w-full">
            <h3 className="text-xl font-light text-black tracking-tight mb-6">
              {targetTopicId &&
              campaignStructure.topics.find((t) => t.id === targetTopicId)
                ?.pillarPage
                ? "Edit Pillar Page"
                : "Add Pillar Page"}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-light text-gray-900 mb-2">
                  Pillar Page Title
                </label>
                <input
                  type="text"
                  value={newPillarTitle}
                  onChange={(e) => setNewPillarTitle(e.target.value)}
                  placeholder="Enter pillar page title"
                  className="w-full px-4 py-3 text-base font-light rounded-2xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all"
                  autoFocus
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowAddPillarModal(false);
                  setNewPillarTitle("");
                  setTargetTopicId(null);
                }}
                className="px-6 py-3 bg-gray-100 text-gray-900 rounded-full hover:bg-gray-200 transition-all text-base font-light"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitPillarPage}
                className="px-6 py-3 bg-black text-white rounded-full hover:bg-black/90 transition-all text-base font-medium"
              >
                {targetTopicId &&
                campaignStructure.topics.find((t) => t.id === targetTopicId)
                  ?.pillarPage
                  ? "Update Pillar Page"
                  : "Add Pillar Page"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Sub-Page Modal */}
      {showAddSubPageModal && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-gray-200 shadow-xl p-8 max-w-md w-full">
            <h3 className="text-xl font-light text-black tracking-tight mb-6">
              Add New Sub-Page
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-light text-gray-900 mb-2">
                  Sub-Page Title
                </label>
                <input
                  type="text"
                  value={newSubPageTitle}
                  onChange={(e) => setNewSubPageTitle(e.target.value)}
                  placeholder="Enter sub-page title"
                  className="w-full px-4 py-3 text-base font-light rounded-2xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all"
                  autoFocus
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowAddSubPageModal(false);
                  setNewSubPageTitle("");
                  setTargetTopicId(null);
                }}
                className="px-6 py-3 bg-gray-100 text-gray-900 rounded-full hover:bg-gray-200 transition-all text-base font-light"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitSubPage}
                className="px-6 py-3 bg-black text-white rounded-full hover:bg-black/90 transition-all text-base font-medium"
              >
                Add Sub-Page
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Keyword Modal */}
      {showAddKeywordModal && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-gray-200 shadow-xl p-8 max-w-md w-full">
            <h3 className="text-xl font-light text-black tracking-tight mb-6">
              Add New Keyword
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-light text-gray-900 mb-2">
                  Keyword Term
                  {availableKeywords.length > 0 && (
                    <span className="ml-2 text-xs text-gray-500">
                      ({availableKeywords.length} keywords available)
                    </span>
                  )}
                </label>
                <Popover open={keywordSearchOpen} onOpenChange={setKeywordSearchOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      role="combobox"
                      aria-expanded={keywordSearchOpen}
                      className="w-full px-4 py-3 text-base font-light rounded-2xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all flex items-center justify-between text-left"
                    >
                      <span className={cn("truncate", !newKeywordTerm && "text-gray-400")}>
                        {newKeywordTerm || "Search or type keyword..."}
                      </span>
                      <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[calc(100vw-4rem)] max-w-md p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Search keywords..."
                        value={keywordSearchValue}
                        onValueChange={(value) => {
                          console.log('Search value changed:', value);
                          setKeywordSearchValue(value);
                        }}
                        className="h-9"
                      />
                      <CommandList>
                        {loadingKeywords ? (
                          <div className="py-6 text-center text-sm text-gray-500">Loading keywords...</div>
                        ) : (
                          <>
                            <CommandEmpty>
                              {availableKeywords.length === 0 
                                ? "No keywords in domain yet. Type to create new."
                                : "No keywords match your search. Type to create new."}
                            </CommandEmpty>
                            {availableKeywords.length > 0 && (
                              <CommandGroup>
                                {availableKeywords
                                  .filter((kw) => {
                                    if (!keywordSearchValue) return true;
                                    return kw.term.toLowerCase().includes(keywordSearchValue.toLowerCase());
                                  })
                                  .map((keyword) => {
                                    console.log('Rendering keyword item:', keyword.term, 'matches search:', !keywordSearchValue || keyword.term.toLowerCase().includes(keywordSearchValue.toLowerCase()));
                                    return (
                                    <CommandItem
                                      key={keyword.id}
                                      value={keyword.term}
                                      onSelect={() => {
                                        console.log('Keyword selected:', keyword.term);
                                        setNewKeywordTerm(keyword.term);
                                        setNewKeywordVolume(keyword.volume?.toString() || '');
                                        setNewKeywordDifficulty(keyword.difficulty || 'Medium');
                                        setKeywordSearchValue('');
                                        setKeywordSearchOpen(false);
                                      }}
                                      className="cursor-pointer"
                                    >
                                      <Check
                                        className={cn(
                                          "mr-2 h-4 w-4",
                                          newKeywordTerm === keyword.term ? "opacity-100" : "opacity-0"
                                        )}
                                      />
                                      <div className="flex-1">
                                        <div className="font-medium">{keyword.term}</div>
                                        <div className="text-xs text-gray-500">
                                          Volume: {keyword.volume?.toLocaleString() || 'N/A'} • 
                                          Difficulty: {keyword.difficulty || 'N/A'}
                                          {keyword.intent && ` • Intent: ${keyword.intent}`}
                                        </div>
                                      </div>
                                    </CommandItem>
                                    );
                                  })}
                              </CommandGroup>
                            )}
                          </>
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <div className="mt-2 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setKeywordPickerDrawerOpen(true)}
                    className="px-3 py-2 border border-gray-200 text-gray-900 rounded-full hover:bg-gray-50 transition-all text-sm font-medium"
                  >
                    Browse keyword table
                  </button>
                </div>
                <input
                  type="text"
                  value={newKeywordTerm}
                  onChange={(e) => {
                    setNewKeywordTerm(e.target.value);
                    setKeywordSearchValue(e.target.value);
                    // Try to find matching keyword and auto-fill
                    const matching = availableKeywords.find(
                      kw => kw.term.toLowerCase() === e.target.value.toLowerCase()
                    );
                    if (matching) {
                      setNewKeywordVolume(matching.volume?.toString() || '');
                      setNewKeywordDifficulty(matching.difficulty || 'Medium');
                    }
                  }}
                  placeholder="Or type a new keyword"
                  className="w-full mt-2 px-4 py-3 text-base font-light rounded-2xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-light text-gray-900 mb-2">Keyword Type</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="keywordType"
                      value="primary"
                      checked={newKeywordType === 'primary'}
                      onChange={(e) => setNewKeywordType(e.target.value as 'primary' | 'longtail')}
                      className="w-4 h-4 text-purple-600 focus:ring-purple-500"
                    />
                    <span className="text-sm font-light text-gray-900">Primary Keyword</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="keywordType"
                      value="longtail"
                      checked={newKeywordType === 'longtail'}
                      onChange={(e) => setNewKeywordType(e.target.value as 'primary' | 'longtail')}
                      className="w-4 h-4 text-green-600 focus:ring-green-500"
                    />
                    <span className="text-sm font-light text-gray-900">Longtail Keyword</span>
                  </label>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-light text-gray-900 mb-2">
                    Volume
                  </label>
                  <input
                    type="number"
                    value={newKeywordVolume}
                    onChange={(e) => setNewKeywordVolume(e.target.value)}
                    placeholder="0"
                    className="w-full px-4 py-3 text-base font-light rounded-2xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-light text-gray-900 mb-2">
                    Difficulty
                  </label>
                  <select
                    value={newKeywordDifficulty}
                    onChange={(e) => setNewKeywordDifficulty(e.target.value)}
                    className="w-full px-4 py-3 text-base font-light rounded-2xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowAddKeywordModal(false);
                  setNewKeywordTerm('');
                  setNewKeywordVolume('');
                  setNewKeywordDifficulty('Medium');
                  setKeywordSearchValue('');
                  setKeywordSearchOpen(false);
                  setAddKeywordContext(null);
                }}
                className="px-6 py-3 bg-gray-100 text-gray-900 rounded-full hover:bg-gray-200 transition-all text-base font-light"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitKeyword}
                className="px-6 py-3 bg-black text-white rounded-full hover:bg-black/90 transition-all text-base font-medium"
              >
                Add Keyword
              </button>
            </div>
          </div>
        </div>
      )}
      <Sheet
        open={keywordPickerDrawerOpen}
        onOpenChange={(open) => {
          setKeywordPickerDrawerOpen(open);
        }}
      >
        <SheetContent
          side="right"
          className="w-full sm:max-w-6xl border-l border-[#e2e4ea] bg-[#f5f6fa] px-8 py-10 overflow-y-auto font-light"
        >
          <div className="space-y-8">
            <div className="rounded-[32px] border border-white/80 bg-white/90 px-6 py-6 shadow-[0_30px_80px_rgba(15,23,42,0.10)] backdrop-blur flex flex-col gap-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-black/10 px-4 py-1 text-[10px] tracking-[0.35em] uppercase text-gray-500">
                Keyword picker
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-[26px] font-light text-gray-900 tracking-tight">Choose from table</h3>
                  <p className="text-sm text-gray-500">Search, filter, and select a keyword to fill the form.</p>
                </div>
                <div>
                  <button
                    onClick={() => setKeywordPickerDrawerOpen(false)}
                    className="px-3 py-1.5 rounded-full bg-gray-100 text-gray-800 text-xs font-semibold border border-gray-200 hover:bg-gray-200"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
            <div className="rounded-[32px] border border-white/80 bg-white/90 px-6 py-6 shadow-[0_30px_80px_rgba(15,23,42,0.10)] backdrop-blur">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
                <div className="flex items-center space-x-4">
                  <div className="relative">
                    <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search keywords..."
                      value={drawerSearchTerm}
                      onChange={(e) => setDrawerSearchTerm(e.target.value)}
                      className="pl-10 pr-3 py-2.5 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm bg-gray-50/50 transition-all duration-200 w-72"
                    />
                  </div>
                  <select
                    value={drawerCompetition}
                    onChange={(e) => setDrawerCompetition(e.target.value)}
                    className="px-3 py-2.5 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm bg-gray-50/50 transition-all duration-200 appearance-none cursor-pointer"
                  >
                    <option value="">All Competition</option>
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                  <select
                    value={drawerIntent}
                    onChange={(e) => setDrawerIntent(e.target.value)}
                    className="px-3 py-2.5 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm bg-gray-50/50 transition-all duration-200 appearance-none cursor-pointer"
                  >
                    <option value="">All Intent</option>
                    <option value="Informational">Informational</option>
                    <option value="Commercial">Commercial</option>
                    <option value="Transactional">Transactional</option>
                  </select>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center bg-gray-100 rounded-2xl p-1">
                    <button
                      onClick={() => setDrawerViewMode("cards")}
                      className={`flex items-center space-x-2 px-4 py-2 rounded-xl transition-all duration-200 text-sm font-medium ${
                        drawerViewMode === "cards" ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"
                      }`}
                    >
                      <Grid3X3 className="w-4 h-4" />
                      <span>Cards</span>
                    </button>
                    <button
                      onClick={() => setDrawerViewMode("table")}
                      className={`flex items-center space-x-2 px-4 py-2 rounded-xl transition-all duration-200 text-sm font-medium ${
                        drawerViewMode === "table" ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"
                      }`}
                    >
                      <List className="w-4 h-4" />
                      <span>Table</span>
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-600">Rows</span>
                    <div className="flex items-center bg-white border border-gray-200 rounded-2xl px-1 shadow-sm">
                      <button
                        onClick={() => {
                          const next = Math.max(5, drawerItemsPerPage - 5);
                          setDrawerItemsPerPage(next);
                          setDrawerCurrentPage(1);
                        }}
                        className="px-2 py-1 text-gray-700 hover:text-gray-900 disabled:text-gray-300"
                        disabled={drawerItemsPerPage <= 5}
                        aria-label="Decrease rows"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min={5}
                        max={200}
                        step={5}
                        value={drawerItemsPerPage}
                        onChange={(e) => {
                          const raw = parseInt(e.target.value, 10);
                          if (Number.isNaN(raw)) return;
                          const clamped = Math.max(5, Math.min(200, raw));
                          setDrawerItemsPerPage(clamped);
                          setDrawerCurrentPage(1);
                        }}
                        className="w-16 text-center px-2 py-1.5 text-sm border-0 focus:outline-none focus:ring-0 bg-transparent"
                      />
                      <button
                        onClick={() => {
                          const next = Math.min(200, drawerItemsPerPage + 5);
                          setDrawerItemsPerPage(next);
                          setDrawerCurrentPage(1);
                        }}
                        className="px-2 py-1 text-gray-700 hover:text-gray-900 disabled:text-gray-300"
                        disabled={drawerItemsPerPage >= 200}
                        aria-label="Increase rows"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-3xl border border-gray-200 overflow-hidden shadow-sm">
                <div className="bg-gray-50/80 border-b border-gray-200">
                  <div className="grid grid-cols-10 gap-4 px-6 py-4 text-sm font-semibold text-gray-700">
                    <div
                      className="col-span-3 flex items-center space-x-2 cursor-pointer hover:text-gray-900 transition-colors"
                      onClick={() => drawerHandleSort("keyword")}
                    >
                      <span>Keyword</span>
                      {drawerGetSortIcon("keyword")}
                    </div>
                    <div
                      className="col-span-1 flex items-center space-x-2 cursor-pointer hover:text-gray-900 transition-colors justify-center"
                      onClick={() => drawerHandleSort("volume")}
                    >
                      <span>Volume</span>
                      {drawerGetSortIcon("volume")}
                    </div>
                    <div
                      className="col-span-1 flex items-center space-x-2 cursor-pointer hover:text-gray-900 transition-colors justify-center"
                      onClick={() => drawerHandleSort("competition")}
                    >
                      <span>Competition</span>
                      {drawerGetSortIcon("competition")}
                    </div>
                    <div
                      className="col-span-1 flex items-center space-x-2 cursor-pointer hover:text-gray-900 transition-colors justify-center"
                      onClick={() => drawerHandleSort("cpc")}
                    >
                      <span>CPC</span>
                      {drawerGetSortIcon("cpc")}
                    </div>
                    <div
                      className="col-span-1 flex items-center space-x-2 cursor-pointer hover:text-gray-900 transition-colors justify-center"
                      onClick={() => drawerHandleSort("organic")}
                    >
                      <span>Organic</span>
                      {drawerGetSortIcon("organic")}
                    </div>
                    <div
                      className="col-span-1 flex items-center space-x-2 cursor-pointer hover:text-gray-900 transition-colors justify-center"
                      onClick={() => drawerHandleSort("intent")}
                    >
                      <span>Intent</span>
                      {drawerGetSortIcon("intent")}
                    </div>
                    <div
                      className="col-span-2 flex items-center space-x-2 cursor-pointer hover:text-gray-900 transition-colors justify-center"
                      onClick={() => drawerHandleSort("trend")}
                    >
                      <span>Trend</span>
                      {drawerGetSortIcon("trend")}
                    </div>
                  </div>
                </div>
                <div className="divide-y divide-gray-100">
                  {drawerCurrentKeywords.map((keyword) => (
                    <div
                      key={keyword.id}
                      className="grid grid-cols-10 gap-4 px-6 py-4 hover:bg-gray-50/80 transition-all duration-200 cursor-pointer"
                      onClick={() => {
                        setNewKeywordTerm(keyword.keyword);
                        setNewKeywordVolume(String(keyword.volume));
                        setNewKeywordDifficulty(keyword.competition || "Medium");
                        setKeywordPickerDrawerOpen(false);
                        setKeywordSearchOpen(false);
                      }}
                    >
                      <div className="col-span-3 flex items-center space-x-3">
                        <div>
                          <div className="font-semibold text-gray-900 text-sm flex items-center space-x-2">
                            <span>{keyword.keyword}</span>
                            {keyword.isCustom && (
                              <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full text-xs font-semibold">
                                Custom
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5 truncate max-w-xs">
                            {keyword.url}
                          </div>
                        </div>
                      </div>
                      <div className="col-span-1 flex items-center justify-center">
                        <span className="font-semibold text-gray-900 text-sm">
                          {keyword.volume >= 1000 ? `${(keyword.volume / 1000).toFixed(1)}K` : keyword.volume.toLocaleString()}
                        </span>
                      </div>
                      <div className="col-span-1 flex items-center justify-center">
                        <span className={drawerCompetitionBadge(keyword.competition)}>
                          {keyword.competition}
                        </span>
                      </div>
                      <div className="col-span-1 flex items-center justify-center">
                        <span className="font-semibold text-gray-900 text-sm">
                          ${keyword.cpc.toFixed(2)}
                        </span>
                      </div>
                      <div className="col-span-1 flex items-center justify-center">
                        <span className="text-gray-700 text-sm">
                          {keyword.organic.toLocaleString()}
                        </span>
                      </div>
                      <div className="col-span-1 flex items-center justify-center">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            keyword.intent === "Commercial"
                              ? "bg-blue-100 text-blue-800"
                              : keyword.intent === "Transactional"
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {keyword.intent}
                        </span>
                      </div>
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
                {drawerTotalPages > 1 && (
                  <div className="bg-gray-50/50 border-t border-gray-200 px-6 py-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-gray-600">
                        Showing {drawerStartIndex + 1} to {Math.min(drawerEndIndex, drawerSortedKeywords.length)} of {drawerSortedKeywords.length} keywords
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => drawerHandlePageChange(drawerCurrentPage - 1)}
                          disabled={drawerCurrentPage === 1}
                          className={`flex items-center space-x-1 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                            drawerCurrentPage === 1 ? "text-gray-400 cursor-not-allowed" : "text-gray-700 hover:text-gray-900 hover:bg-gray-100"
                          }`}
                        >
                          <ChevronUp className="w-4 h-4 rotate-90" />
                          <span>Previous</span>
                        </button>
                        <div className="flex items-center space-x-1">
                          {drawerGetPageNumbers().map((page, index) => (
                            <React.Fragment key={index}>
                              {page === "..." ? (
                                <span className="px-2 py-2 text-gray-400">...</span>
                              ) : (
                                <button
                                  onClick={() => drawerHandlePageChange(page as number)}
                                  className={`w-8 h-8 rounded-xl text-sm font-medium transition-all duration-200 flex items-center justify-center ${
                                    drawerCurrentPage === page ? "bg-gray-900 text-white shadow-sm" : "text-gray-700 hover:text-gray-900 hover:bg-gray-100"
                                  }`}
                                >
                                  {page}
                                </button>
                              )}
                            </React.Fragment>
                          ))}
                        </div>
                        <button
                          onClick={() => drawerHandlePageChange(drawerCurrentPage + 1)}
                          disabled={drawerCurrentPage >= drawerTotalPages}
                          className={`flex items-center space-x-1 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                            drawerCurrentPage >= drawerTotalPages ? "text-gray-400 cursor-not-allowed" : "text-gray-700 hover:text-gray-900 hover:bg-gray-100"
                          }`}
                        >
                          <span>Next</span>
                          <ChevronUp className="w-4 h-4 -rotate-90" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {drawerSortedKeywords.length === 0 && (
                  <div className="py-12 text-center">
                    <p className="text-gray-500">No keywords match your current filters.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
      {/* Generation Drawer */}
      <Sheet
        open={generationDrawerOpen}
        onOpenChange={(open) => {
          setGenerationDrawerOpen(open);
          if (!open) {
            setCurrentGenerationTopicId(null);
            setGenerationStep(1);
          }
        }}
      >
        <SheetContent
          side="right"
          className="w-full sm:max-w-3xl border-l border-[#e2e4ea] bg-[#f5f6fa] px-8 py-10 overflow-y-auto font-light"
        >
          <div className="space-y-8">
            <div className="rounded-[32px] border border-white/80 bg-white/90 px-6 py-6 shadow-[0_30px_80px_rgba(15,23,42,0.10)] backdrop-blur flex flex-col gap-3">
                  <div className="inline-flex items-center gap-2 rounded-full border border-black/10 px-4 py-1 text-[10px] tracking-[0.35em] uppercase text-gray-500">
                Generation setup
                  </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                  <h3 className="text-[26px] font-light text-gray-900 tracking-tight">Configure content</h3>
                  <p className="text-sm text-gray-500">Length, imagery, and brand—keywords are already chosen.</p>
                  </div>
                <div className="px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-100">
                  WordPress Connected
                </div>
              </div>
              <div className="flex items-center gap-2">
                {generationSteps.map((step) => (
                  <div key={step.id} className="flex items-center gap-2">
                    <div
                      className={`h-2 w-2 rounded-full ${
                        generationStep >= step.id ? 'bg-black' : 'bg-gray-300'
                        }`}
                      />
                    <span className={`text-xs font-medium ${generationStep >= step.id ? 'text-gray-900' : 'text-gray-400'}`}>
                      {step.title}
                    </span>
                    {step.id !== generationSteps.length && (
                      <div className="h-px w-6 bg-gray-200" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {generationStep === 1 && (
              <section className="rounded-[32px] border border-white/80 bg-white/90 px-6 py-6 shadow-[0_30px_80px_rgba(15,23,42,0.10)] backdrop-blur flex flex-col gap-5">
                  <div className="flex items-center justify-between">
                    <div>
                    <div className="text-xs uppercase tracking-[0.35em] text-gray-500">Word cadence</div>
                    <h3 className="text-[24px] font-light text-gray-900">Dial in the depth</h3>
                    <p className="text-sm text-gray-500">Tune the total word count for the generated pages.</p>
                    </div>
                  <div className="inline-flex items-baseline gap-1 rounded-full bg-gray-50 px-4 py-1 shadow-inner border border-gray-100">
                    <span className="text-xl font-light">{generationForm.wordCount}</span>
                    <span className="text-[11px] uppercase tracking-[0.25em] text-gray-500">words</span>
                    </div>
                  </div>
                <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4 space-y-3">
                    <input
                      type="range"
                      min={500}
                      max={2000}
                      step={50}
                      value={generationForm.wordCount}
                      onChange={(e) =>
                      setGenerationForm((prev) => ({ ...prev, wordCount: Number(e.target.value) || 800 }))
                      }
                      className="w-full h-2 rounded-full bg-gradient-to-r from-gray-200 via-gray-300 to-gray-400 accent-black"
                    />
                  <div className="flex justify-between text-[11px] uppercase tracking-[0.3em] text-gray-400">
                    <span>Brief</span>
                    <span>Feature</span>
                    <span>Chronicle</span>
                    </div>
                  </div>
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => {
                      setGenerationDrawerOpen(false);
                      setCurrentGenerationTopicId(null);
                    }}
                    className="px-4 py-2 rounded-full border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => setGenerationStep(2)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gray-900 text-white text-sm font-semibold hover:bg-black/90"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </section>
            )}

            {generationStep === 2 && (
              <section className="rounded-[32px] border border-white/80 bg-white/90 px-6 py-6 shadow-[0_30px_80px_rgba(15,23,42,0.10)] backdrop-blur space-y-5">
                <div className="flex items-center justify-between">
                      <div>
                    <div className="text-xs uppercase tracking-[0.35em] text-gray-500">Imagery</div>
                    <h3 className="text-[24px] font-light text-gray-900">Compose the visuals</h3>
                    <p className="text-sm text-gray-500">Control inline images and the featured banner.</p>
                      </div>
                  <div className="px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-100">
                    WordPress Connected
                  </div>
                </div>
                <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-gray-800">Inline images</div>
                    <span className="text-sm text-gray-700">{generationForm.images}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() =>
                          setGenerationForm((prev) => ({ ...prev, images: Math.max(0, prev.images - 1) }))
                        }
                      className="w-10 h-10 rounded-full border border-gray-200 text-lg leading-none flex items-center justify-center hover:border-gray-300 bg-white"
                      >
                        −
                      </button>
                      <div className="flex-1 h-2 rounded-full bg-gray-100">
                        <div
                          className="h-full rounded-full bg-gray-900 transition-all"
                        style={{ width: `${Math.min(4, Math.max(0, generationForm.images)) / 4 * 100}%` }}
                        />
                      </div>
                      <button
                        onClick={() =>
                          setGenerationForm((prev) => ({ ...prev, images: Math.min(4, prev.images + 1) }))
                        }
                      className="w-10 h-10 rounded-full border border-gray-200 text-lg leading-none flex items-center justify-center hover:border-gray-300 bg-white"
                      >
                        +
                      </button>
                    </div>
                  <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <p className="text-sm font-semibold text-gray-900">Hero banner</p>
                        <p className="text-xs text-gray-500">Ideal for previews and social sharing.</p>
                  </div>
                      <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">Optional</span>
                    </div>
                    <button
                      onClick={() =>
                        setGenerationForm((prev) => ({ ...prev, featuredImage: !prev.featuredImage }))
                      }
                      className={`w-full px-4 py-3 rounded-[30px] border text-sm font-medium transition-all ${
                        generationForm.featuredImage
                          ? 'bg-black text-white border-black shadow-lg'
                          : 'border-gray-200 text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      {generationForm.featuredImage ? 'Use featured banner' : 'Skip featured banner'}
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setGenerationStep(1)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Back
                  </button>
                  <button
                    onClick={() => setGenerationStep(3)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gray-900 text-white text-sm font-semibold hover:bg-black/90"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </section>
            )}

            {generationStep === 3 && (
              <section className="rounded-[32px] border border-white/80 bg-white/90 px-6 py-6 shadow-[0_30px_80px_rgba(15,23,42,0.10)] backdrop-blur space-y-5">
                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-[0.35em] text-gray-500">Brand</div>
                  <h3 className="text-[24px] font-light text-gray-900">Align tone & voice</h3>
                  <p className="text-sm text-gray-500">We’ll weave this into the generated pages.</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="block text-xs uppercase tracking-[0.35em] text-gray-500">Brand name</label>
                    <input
                      type="text"
                      value={generationForm.brandName}
                      onChange={(e) => setGenerationForm((f) => ({ ...f, brandName: e.target.value }))}
                      className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-inner focus:ring-2 focus:ring-black/10"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs uppercase tracking-[0.35em] text-gray-500">Brand description</label>
                    <textarea
                      value={generationForm.brandDescription}
                      onChange={(e) => setGenerationForm((f) => ({ ...f, brandDescription: e.target.value }))}
                      className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-inner focus:ring-2 focus:ring-black/10"
                      rows={3}
                    />
                  </div>
                </div>
                    <div className="flex items-center justify-between">
              <button
                    onClick={() => setGenerationStep(2)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </button>
                  <button
                    disabled={!currentTopic || generateTopicLoading === currentTopic?.id}
                    onClick={() => currentTopic && handleGenerateTopic(currentTopic, generationForm)}
                    className="px-6 py-2.5 rounded-full bg-black text-white text-sm font-semibold shadow-[0_20px_40px_rgba(0,0,0,0.12)] hover:bg-black/90 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {generateTopicLoading === currentTopic?.id ? 'Starting…' : 'Start generation'}
                  </button>
                </div>
              </section>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Draft Preview Overlay (publish-style) */}
      {previewDraft && (
        <div 
          className="fixed inset-0 z-50 bg-white"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
          onClick={(e) => {
            // Prevent clicks from propagating to parent elements that might cause tab navigation
            e.stopPropagation();
          }}
          onMouseDown={(e) => {
            // Prevent mousedown from propagating
            e.stopPropagation();
          }}
        >
          <PublishExperience
            companyDomain={companyDomain}
            domainContext={domainContext}
            keywordsTableData={keywordsTableData}
            hasWordpressIntegration={hasWordpressIntegration}
            wpIntegration={wpIntegration}
            onConfigureWordpress={onConfigureWordpress}
            onRefreshWordpressIntegration={onRefreshWordpressIntegration}
            isActive={true}
            disablePreviewOverlay={true}
            initialDraft={{
              primaryKeyword: previewDraft?.primaryKeyword || '',
              htmlContent: previewDraft?.htmlContent || '',
              featuredImage: previewDraft?.featuredImage,
              title: previewDraft?.title,
              metaDescription: previewDraft?.metaDescription,
              slug: previewDraft?.slug,
              longtailKeywords: '', // not provided by API yet
              wordpressUrl: undefined,
            }}
            initialDraftId={previewPageId}
          />
          <button
            onClick={async () => {
              setClosePreviewLoading(true);
              try {
                // Refresh draft status when closing to show any updates
                if (campaignStructure.topics && campaignStructure.topics.length > 0) {
                  try {
                    // Rehydrate draft status to pick up any changes
                    const rehydrateMap = new Map<number, GenerationPageStatus>();
                    for (const topic of campaignStructure.topics) {
                      try {
                        const response = await fetch(
                          `${API_BASE_URL}/api/campaigns/topics/${topic.id}/drafts-status`,
                          { headers: getAuthHeaders() }
                        );
                        if (response.ok) {
                          const data = await response.json();
                          if (data.success && data.pages) {
                            data.pages.forEach((p: DraftStatusRecord) => {
                              if (p.draftId || p.jobId || p.hasHtml) {
                                rehydrateMap.set(p.pageId, {
                                  jobId: p.jobId || '',
                                  pageId: p.pageId,
                                  pageType: p.pageType === 'subpage' ? 'subpage' : 'pillar',
                                  status: (p.status || 'pending') as GenerationPageStatus['status'],
                                  draftId: p.draftId,
                                  progress: typeof p.progress === 'number' ? p.progress : p.hasHtml ? 100 : 0,
                                  primaryKeyword: p.primaryKeyword,
                                  hasHtml: p.hasHtml,
                                  updatedAt: p.updatedAt,
                                  error: p.error || null,
                                  wordpressUrl: p.wordpressUrl || null,
                                });
                              }
                            });
                          }
                        }
                      } catch (err) {
                        // Silently fail for individual topics
                      }
                    }
                    if (rehydrateMap.size > 0) {
                      setGenerationJobs(rehydrateMap);
                    }
                  } catch (err) {
                    // Silently fail refresh
                  }
                }
              } finally {
              setPreviewDraft(null);
              setPreviewPageId(null);
                setClosePreviewLoading(false);
              }
            }}
            disabled={closePreviewLoading}
            className="fixed top-4 right-4 z-[60] inline-flex items-center gap-2 px-4 py-2.5 rounded-full border border-gray-200 bg-white text-sm font-medium text-gray-900 hover:bg-gray-50 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed transition-all"
          >
            {closePreviewLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Closing...
              </>
            ) : (
              'Close'
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default SidebarDashboard;
