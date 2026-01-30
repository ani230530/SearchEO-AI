import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronRight,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle,
  Loader2,
  Sparkles,
  Layout,
  Info,
  List,
  Network,
  LayoutDashboard,
  Building,
  Megaphone,
  Send,
  BarChart3,
  ClipboardList,
  FileChartColumnIncreasing,
  Settings,
  User,
  Search,
  Grid3X3,
  ChevronLeft,
  ChevronDown,
  ChartNoAxesCombined,
  Check,
  FileText,
  X,
  LogOut,
  ChevronUp,
  ArrowUpDown,
  Plug,
  TrendingUp,
  Menu,
  Globe,
  Eye,
  ExternalLink,
  Pencil
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { maskDomainId } from '@/lib/domainUtils';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { ButtonSpinner } from '@/components/ui/button-spinner';
import { CampaignTopicSidebar } from '@/features/campaign/CampaignTopicSidebar';
import { CampaignTopicDetail } from '@/features/campaign/CampaignTopicDetail';
import { Topic, CampaignStructure, GenerationPageStatus, DraftStatusRecord, KeywordTableItem, DraftPreview, Keyword } from '@/types';
import CampaignGraph from '@/components/CampaignGraph';
import { AuditBarChart, AuditGaugeChart, AuditRadarChart, AuditScoreDistribution, OverallScoreGauge } from '@/components/audit/AuditCharts';
import { WordpressIntegration } from '@/types/publish';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle,AlertDialogOverlay } from '@radix-ui/react-alert-dialog';
import { AuditPDF } from '@/components/audit/AuditPDF';
import PublishExperience from '@/features/publish/PublishExperience';
import { CompanyInfoSkeleton } from '@/components/dashboard/CompanyInfoSkeleton';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@radix-ui/react-accordion';
import AnalyticsReportingView from './AnalyticsReportingView';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AlertDialogHeader } from '@/components/ui/alert-dialog';
import Profile from './Profile';
import {AnimatePresence, motion} from 'framer-motion'
import GSCAnalyticsView from '@/components/gsc/GSCAnalyticsView';
import GSCBlogAnalytics from '@/features/analytics/GSCBlogAnalytics';
import { usePublishStatus } from '@/hooks/usePublishStatus';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import TrendsChart, { TrendDataPoint } from "@/components/gsc/TrendsChart";



const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3002";

type TabId = 'overview' | 'analytics' | 'campaign' | 'publish' | 'settings' | 'profile' | 'ai-checker' | 'gsc-analytics' | 'audit' | 'analytics-report';
type CompanySubTabId = 'company-info' | 'integration';
type GscSubTabId = 'whole-analytics' | 'blog-performance';

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

// Types moved to @/types

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
};

const SidebarDashboard = () => {
const [activeTab, setActiveTab] = useState<TabId>(() => {
  return (localStorage.getItem("activeTab") as TabId) || "overview";
});
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
const [showAuditModal, setShowAuditModal] = useState(false);
const resultsRef = useRef<HTMLDivElement | null>(null);
const [activeChartTab, setActiveChartTab] = useState<'overview' | 'comparison' | 'distribution'>('overview');
const [n8nSending, setN8nSending] = useState(false);
const [n8nRequestId, setN8nRequestId] = useState<string | null>(null);
const [n8nStatus, setN8nStatus] = useState<'processing' | 'completed' | 'failed' | null>(null);
const [n8nResults, setN8nResults] = useState<{sheetsUrl?: string; slidesUrl?: string} | null>(null);
const sseRef = useRef<EventSource | null>(null);
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
  // Track pages currently being published (waiting for SSE confirmation)
  const [publishingPageIds, setPublishingPageIds] = useState<Set<number>>(new Set());
  // Map draftId to pageId so SSE handler knows which page to update
  const [draftToPageMap, setDraftToPageMap] = useState<Map<number, number>>(new Map());
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
const [openSections, setOpenSections] = useState<number[]>([]);
const toggleSection = (idx: number) => {
  setOpenSections((prev) =>
    prev.includes(idx)
      ? prev.filter((i) => i !== idx)
      : [...prev, idx]
  );
};
  // Company info carousel: track index and count to show arrows conditionally
  const companyCarouselRef = useRef<HTMLDivElement | null>(null);
  const [companyCurrentIndex, setCompanyCurrentIndex] = useState(0);
  const [companySectionsCount, setCompanySectionsCount] = useState(0);
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
  const navigate = useNavigate();
  const { toast } = useToast();
  const isSidebarExpanded = sidebarOpen || isSidebarHovered;
// Campaign States
const [campaignViewMode, setCampaignViewMode] = useState<'split' | 'graph'>('split');
const [selectedTopicId, setSelectedTopicId] = useState<number | null>(null);
const [campaignStructure, setCampaignStructure] = useState<CampaignStructure>({
  topics: []
});

  // Initialize selectedTopicId
  useEffect(() => {
    if (campaignStructure.topics.length > 0 && selectedTopicId === null) {
      setSelectedTopicId(campaignStructure.topics[0].id);
    }
  }, [campaignStructure.topics, selectedTopicId]);

  useEffect(() => {
    if (sidebarOpen) {
      setIsSidebarHovered(false);
    }
  }, [sidebarOpen]);

  // Listen for real-time publish updates via SSE
  usePublishStatus({
    onUpdate: (data) => {
      // Find which page this draftId corresponds to
      const pageId = draftToPageMap.get(data.draftId);
      
      // Always clear publishing state for this draft
      if (data.status === 'published' || data.status === 'failed') {
        if (pageId) {
          setPublishingPageIds(prev => {
            const next = new Set(prev);
            next.delete(pageId);
            return next;
          });
        }
        // Clean up the mapping
        setDraftToPageMap(prev => {
          const next = new Map(prev);
          next.delete(data.draftId);
          return next;
        });
      }

      if (data.status === 'published' && data.publishedUrl) {
        // Update generationJobs with the published URL
        if (pageId) {
          setGenerationJobs(prev => {
            const existing = prev.get(pageId);
            if (existing) {
              const updated = new Map(prev);
              updated.set(pageId, {
                ...existing,
                wordpressUrl: data.publishedUrl || null,
              });
              return updated;
            }
            return prev;
          });
        }

        // Also update draftStatuses for the View Live button
        setDraftStatuses(prev => {
          const updated = new Map(prev);
          // Find entry by draftId
          for (const [pid, status] of updated.entries()) {
            if (status.draftId === data.draftId) {
              updated.set(pid, {
                ...status,
                isPublished: true,
                publishedUrl: data.publishedUrl,
              });
              break;
            }
          }
          return updated;
        });

        toast({
          title: 'Published Successfully',
          description: `Your content is live! View it at: ${data.publishedUrl}`,
        });
      } else if (data.status === 'failed') {
        toast({
          title: 'Publish Failed',
          description: data.error || 'An error occurred while publishing to WordPress',
          variant: 'destructive',
        });
      }
    }
  });

  const tabs: Tab[] = [
    { id: 'ai-checker', label: 'AI Checker', icon: <Sparkles className="h-5 w-5" /> },
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="h-5 w-5" /> },
    { id: 'analytics', label: 'Company', icon: <Building className="h-5 w-5" /> } ,
    { id: 'campaign', label: 'Campaign', icon: <Megaphone className="h-5 w-5" /> },
    { id: 'publish', label: 'Publish', icon: <Send className="h-5 w-5" /> },
    { id: 'gsc-analytics', label: 'GSC Analytics', icon: <BarChart3 className="h-5 w-5" /> },
    { id: 'audit', label: 'Audit', icon: <ClipboardList className="h-5 w-5" /> },
    { id: 'analytics-report', label: 'Analytics Reporting', icon: <FileChartColumnIncreasing className="h-5 w-5" /> },
    { id: 'settings', label: 'Settings', icon: <Settings className="h-5 w-5" /> },
    { id: 'profile', label: 'Profile', icon: <User className="h-5 w-5" /> },
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


const normalizedDomain = companyDomain
  .replace(/^https?:\/\//, "")
  .replace(/^www\./, "")
  .split("/")[0];


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
      // setAuditData(data.audit);
      setAuditComplete(true);
      setShowAuditModal(true);
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
const InfoTooltip = ({ text }: { text: string }) => (
  <span className="relative inline-flex items-center ml-1">
    {/* Trigger */}
    <span className="peer text-gray-400 hover:text-gray-600 transition-colorstext-xs">
     <Info />
    </span>

    {/* Tooltip */}
    <span
      className="
        pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-2
        w-64 rounded-xl bg-gray-800 text-white text-sm leading-relaxed
        px-3 py-2 opacity-0 scale-95 translate-y-1
        peer-hover:opacity-100 peer-hover:scale-100 peer-hover:translate-y-0
        transition-all duration-200 ease-out z-50
      "
    >
      {text}
      <span className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 bg-gray-900 rotate-45" />
    </span>
  </span>
);

const categoryDescriptions: Record<string, string> = {
  Performance: "Overall speed and responsiveness of the page.",
  SEO: "How well the page is optimized for search engines.",
  Accessibility: "How usable the page is for users with disabilities.",
  "Best Practices": "Adherence to modern web development best practices.",
};

const metricDescriptions: Record<string, string> = {
  fcp: "Time until the first visible content appears on the page.",
  lcp: "Time it takes for the largest visible element to fully render.",
  cls: "Measures visual stability by tracking unexpected layout shifts.",
  tbt: "Total time the page is blocked from responding to user input.",
  speedIndex: "How quickly content is visually displayed during load.",
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
    setCompanyDomain(value);
    if (value) validateDomain(value);
  };

  const handleViewReport = () => {
    setShowAuditModal(false);
    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 220);
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
      fetchCompanyDomain();
  }, [activeTab, fetchCompanyDomain]);

  // Fetch audit when audit tab is active
  useEffect(() => {
    if (activeTab === 'audit') {
      fetchAudit();
    }
  }, [activeTab]);

  // On mount: load company domain and any existing audit so Overview reflects latest data on reload
  useEffect(() => {
    fetchCompanyDomain();
    fetchAudit();
  }, [fetchCompanyDomain, fetchAudit]);

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
    console.log("keywords:", keywords.length);
  console.log("createdDomainId:", createdDomainId);
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
    setActiveTab('analytics');
    setActiveCompanySubTab('integration');
  }, []);



  useEffect(() => {
      fetchGscStatus();
      fetchWordpressIntegration();
    
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
    if (activeTab === 'campaign' || activeTab === 'overview') {
      // Fetch campaigns for both the Campaign tab and the Overview
      // so Overview can show recent campaigns/quick access.
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
          padding: 0px 12px 0px 24px;
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
          padding: calc(env(safe-area-inset-top) + 18px) 24px 12px 24px;
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
                marginTop: "20px",
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
                marginTop: "20px",
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
                  {tab.id === "analytics" && (
  <ChevronDown
    className={`h-4 w-4 ml-auto sidebar-tab-chevron transition-transform ${
      activeTab === "analytics" && showResults ? "rotate-180" : ""
    }`}
  />
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
                            : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                        }`}
                      >
                        <FileText className="h-4 w-4" />
                        <span>Domain Info</span>
                        {activeCompanySubTab === "company-info" }
                      </button>
                      <button
                        onClick={() => setActiveCompanySubTab("integration")}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-light transition-all duration-200 ${
                          activeCompanySubTab === "integration" 
                            ? "bg-blue-50 text-blue-700"
                            : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                        }`}
                      >
                        <Plug className="h-4 w-4" />
                        <span>Integration</span>
                        {activeCompanySubTab === "integration" }
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
              {/* <button
                className="desktop-sidebar-toggle"
                onClick={() => setSidebarOpen((prev) => !prev)}
                aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
              >
                {sidebarOpen ? (
                  <ChevronLeft className="h-4 w-4 text-gray-700" />
                ) : (
                  <Menu className="h-4 w-4 text-gray-700" />
                )}
              </button> */}
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

            
            {activeTab === 'campaign' && selectedCampaignId && (
                <div className="flex items-center gap-2 bg-gray-100/80 p-1 rounded-lg border border-gray-200/50 mr-4">
                  <button
                    onClick={() => setCampaignViewMode('split')}
                    className={`p-1.5 rounded-md transition-all flex items-center gap-2 text-xs font-medium ${
                      campaignViewMode === 'split' 
                        ? 'bg-white text-black shadow-sm' 
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <List className="h-4 w-4" />
                    <span>Topics</span>
                  </button>
                  <button
                    onClick={() => setCampaignViewMode('graph')}
                    className={`p-1.5 rounded-md transition-all flex items-center gap-2 text-xs font-medium ${
                      campaignViewMode === 'graph' 
                        ? 'bg-white text-black shadow-sm' 
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Network className="h-4 w-4" />
                    <span>Map</span>
                  </button>
               </div>
            )}

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
        <div className={activeTab === 'campaign' && selectedCampaignId ? "flex-1 min-h-[calc(100vh-80px)] bg-white" : "content-body"}>
          {activeTab === "overview" ? (
           <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-12">

    {/* ===================== HERO ===================== */}
    <div className="relative overflow-hidden rounded-3xl border border-gray-100 bg-gradient-to-br from-white via-slate-50 to-white hover:shadow-lg">
      {/* soft glow */}
      <div className="absolute -top-24 -left-24 w-96 h-96 bg-blue-50 rounded-full blur-3xl opacity-60" />

      <div className="relative p-8 sm:p-10 flex flex-col lg:flex-row gap-10 justify-between">
        {/* Left */}
        <div className="max-w-xl">
          <h1 className="text-4xl sm:text-5xl font-light text-gray-900 leading-tight">
            Overview
          </h1>
          <p className="mt-3 text-base text-gray-600">
            A real-time snapshot of your domain’s SEO health, performance,
            and growth potential.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              onClick={() => handleRunAudit(companyDomain)}
              disabled={!companyDomain || auditLoading}
              className="inline-flex items-center gap-2 px-6 py-3 bg-black text-white rounded-full text-sm font-medium hover:bg-gray-700  disabled:opacity-60 transition"
            >
              {auditLoading ? "Running audit…" : "Run audit"}
            </button>

            <button
              onClick={() => {
                setActiveTab("analytics");
                setActiveCompanySubTab("company-info");
              }}
              className="px-5 py-3 rounded-full border border-gray-200 bg-white text-sm hover:bg-gray-50  hover:shadow-lg transition"
            >
              Analytics
            </button>
          </div>
        </div>

        {/* Right */}
          <div className="hidden lg:block w-px h-54 bg-gray-200" />
<div className="flex flex-col items-center gap-6">
  {companyDomain && (
    <div className="inline-flex items-center gap-3 bg-blue-50 border border-blue-200 text-blue-700 px-5 py-3 rounded-2xl shadow-sm">
      <img
        src={`https://img.logo.dev/${normalizedDomain}?token=pk_DTdFFG1JT9WOCjATvZEzIA&size=128`}
        alt="Company logo"
        width={32}
        height={32}
        className="w-8 h-8 rounded-md"
        loading="lazy"
      />
      <span className="font-medium text-lg tracking-tight">
        <a
          href={companyDomain.startsWith("http") ? companyDomain : `https://${companyDomain}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline text-lg"
        >
          {companyDomain.replace(/^https?:\/\//, "").replace(/^www\./, "")}
        </a>
      </span>
    </div>
  )}

  {/* Info blocks*/}
  <div className="flex flex-col-2 items-center gap-20">
    <div>
      <div className="text-xs text-gray-500">Last scanned</div>
      {auditData?.updatedAt ? (
        <>
          <div className="font-medium text-gray-900">
            {new Date(auditData.updatedAt).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </div>
          <div className="text-xs text-gray-900">
            {new Date(auditData.updatedAt).toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        </>
      ) : (
        <div className="font-medium text-gray-900">Never</div>
      )}
    </div>

    <div>
      <div className="text-xs text-gray-500">Keywords tracked</div>
      <div className="font-medium text-gray-900">{keywordsTableData.length}</div>
    </div>
  </div>
</div>

      </div>
    </div>

    {/* ===================== KPI GRID ===================== */}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

      {/* Opportunities Card */}
<div className="rounded-3xl bg-white border border-gray-100 p-6 hover:shadow-lg transition">
  <div className="flex items-center justify-between mb-4">
    <h3 className="text-base font-medium text-gray-900">
      Top Opportunities
    </h3>
    <div className="text-base font-medium text-gray-900">
      Volume
    </div>
  </div>

  <div className="space-y-4">
    {keywordsTableData
      .slice()
      .sort((a, b) => (b.volume || 0) - (a.volume || 0)) 
      .slice(0, 5) 
      .map((item, idx) => (
        <div key={idx} className="flex items-center justify-between">
          <div>
            <div className="text-lg font-medium text-gray-700"> 
              {item?.keyword.charAt(0).toUpperCase() + item?.keyword.slice(1)|| "No keywords yet"}
            </div>
            <div className="text-xs text-gray-400 mt-1">
              High potential growth keyword
            </div>
          </div>

          {/* Volume badge */}
          <div className="px-3 py-2 rounded-2xl bg-blue-50 flex items-center justify-center min-w-[50px]">
            <span className="text-sm font-medium text-blue-700">
              {item?.volume
                ? item.volume >= 1000
                  ? `${(item.volume / 1000).toFixed(1)}K`
                  : item.volume.toLocaleString()
                : "-"}
            </span>
          </div>
        </div>
      ))}
  </div>
</div>


 {/* Audit Completed Modal */}
              {showAuditModal && (
<div className="absolute inset-0 z-50 flex items-center justify-center">
  <div className="max-w-md w-full rounded-2xl bg-white shadow-2xl">
              <AlertDialog open={showAuditModal} onOpenChange={setShowAuditModal}>
                <AlertDialogOverlay className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40" />
                <AlertDialogContent className=" fixed left-1/2 top-1/2 z-50
    -translate-x-1/2 -translate-y-1/2
    max-w-md w-full
    rounded-2xl
    bg-white
    border border-gray-100
    shadow-2xl
    animate-in fade-in zoom-in-95">
                  <div className="p-4 rounded-lg bg-gradient-to-r from-white/80 to-gray-50 border border-gray-100">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-2xl font-medium">Audit Completed</AlertDialogTitle>
                      <AlertDialogDescription className="text-sm text-muted-foreground">
                        Your domain audit has finished. Here's a quick summary — you can view the full report or download it.
                      </AlertDialogDescription>
                    </AlertDialogHeader>

                    <div className="mt-4 flex items-center gap-4">
                      <div className="flex-shrink-0">
                        <OverallScoreGauge score={Math.round(((auditResult?.performance||0)+(auditResult?.seo||0)+(auditResult?.accessibility||0)+(auditResult?.bestPractices||0))/4*100)/100 || 0} />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm text-gray-600 mb-2">Top category</div>
                        <div className="text-base font-medium text-gray-900">
                          {auditResult ? (
                            (() => {
                              const cats = [
                                { k: 'Performance', v: auditResult.performance },
                                { k: 'SEO', v: auditResult.seo },
                                { k: 'Accessibility', v: auditResult.accessibility },
                                { k: 'Best Practices', v: auditResult.bestPractices },
                              ];
                              const scored = cats.map(c => ({ ...c, s: Math.round((c.v||0)*100) }));
                              const best = scored.reduce((a,b)=> b.s > a.s ? b : a, scored[0]);
                              return `${best.k} — ${best.s}%`;
                            })()
                          ) : '—'}
                        </div>
                        <div className="text-xs text-gray-500 mt-2">Click below to view the full interactive report.</div>
                      </div>
                    </div>

                    <div className="mt-6 flex items-center justify-end gap-2">
                      {auditResult && companyDomain && (
                        <PDFDownloadLink
                          document={<AuditPDF data={auditResult} domain={companyDomain} />}
                          fileName={`audit-${companyDomain}-${new Date().toISOString().split('T')[0]}.pdf`}
                          className="px-4 py-2 rounded-full border border-gray-200 text-sm font-light bg-white hover:bg-gray-50 flex items-center justify-center"
                        >
                          {({ loading }) => (loading ? 'Preparing...' : 'Export PDF')}
                        </PDFDownloadLink>
                      )}
                      <AlertDialogAction onClick={handleViewReport} className="px-4 py-2 rounded-full bg-black text-white text-sm">View Full Report</AlertDialogAction>
                      <AlertDialogCancel className="px-4 py-2 rounded-full border border-gray-200 text-sm">Close</AlertDialogCancel>
                    </div>
                  </div>
                </AlertDialogContent>
              </AlertDialog>
                </div>
</div>
)}
      {/* Audit Summary */}
   <div className="lg:col-span-1 rounded-3xl bg-white border border-gray-100 p-6 shadow-sm hover:shadow-lg transition-shadow duration-300">
  {/* Header */}
  <div className="flex items-center justify-between mb-4">
    <div>
      <h3 className="text-base font-medium text-gray-900">
        Audit Summary
      </h3>
      <p className="text-xs text-gray-400">
        Lighthouse performance breakdown
      </p>
    </div>

    <button
      onClick={() => {
        setActiveTab("audit");
        setTimeout(() => setShowAuditModal(true), 120);
      }}
      className="text-sm font-medium text-blue-600 hover:underline transition-colors duration-200"
    >
      View details
    </button>
  </div>

 {!auditResult ? (
  <p className="text-sm text-gray-500">
    Run an audit to view performance metrics.
  </p>
) : (
  <div className="flex gap-6">
  {/* Metrics grid on the left */}
  <div className="flex flex-col gap-6 flex-1">
    {[
      ["Performance", auditResult.performance],
      ["SEO", auditResult.seo],
      ["Accessibility", auditResult.accessibility],
      ["Best Practices", auditResult.bestPractices],
    ].map(([label, value]) => {
      const pct = Math.round((value || 0) * 100);
      let bgColor = "bg-gray-50";
      let textColor = "text-gray-900";

      if (pct >= 80) {
        bgColor = "bg-green-50";
        textColor = "text-green-700";
      } else if (pct >= 60) {
        bgColor = "bg-yellow-50";
        textColor = "text-yellow-700";
      } else if (pct >= 40) {
        bgColor = "bg-orange-50";
        textColor = "text-orange-700";
      } else {
        bgColor = "bg-red-50";
        textColor = "text-red-700";
      }

      return (
        <div
          key={label}
          className={`flex items-center justify-between rounded-xl px-3 py-4 ${bgColor}`}
        >
          <div className="flex items-center gap-2">
            <ChartNoAxesCombined />
            <span className="text-medium text-gray-600">{label}</span>
          </div>
          <span className={`font-semibold ${textColor}`}>{pct}%</span>
        </div>
      );
    })}
  </div>

  {/* Overall score on the right, vertically centered */}
  <div className="flex items-center justify-center">
    <OverallScoreGauge
      size={150}
      score={
        ((auditResult.performance || 0) +
          (auditResult.seo || 0) +
          (auditResult.accessibility || 0) +
          (auditResult.bestPractices || 0)) /
        4
      }
    />
  </div>
</div>

)}

</div>

    </div>

    {/* ===================== SNAPSHOT ===================== */}
  <div className="grid grid-cols-1 lg:grid-cols-1 gap-6">
  <div className="rounded-3xl bg-white border border-gray-100 p-6 hover:shadow-lg transition">
    <div className="mb-6">
      <h3 className="text-base font-medium text-gray-900">Snapshot</h3>
      <p className="text-xs text-gray-400 mt-1">
        Quick overview of your setup
      </p>
    </div>

    <div className="grid grid-cols-4 gap-4">
      {[
        ["Keywords", keywordsTableData.length],
        ["Campaigns", campaigns.length],
        ["WordPress", hasWordpressIntegration ? "Connected" : "Not connected"],
        ["Integrations", hasWordpressIntegration ? "WordPress" : "—"],
      ].map(([label, value]) => {
        const isConnected =
          value === "Connected" || value === "Disconnected" ;

        return (
          <div
            key={label}
            className="group rounded-2xl border border-gray-100 bg-gray-50/60 p-4 text-left hover:bg-white hover:shadow-sm transition"
          >
            <div className="text-xs uppercase tracking-wide text-gray-500">
              {label}
            </div>

            <div className="mt-2 flex items-center justify-between">
              <div
                className={cn(
                  "text-2xl font-semibold",
                  isConnected
                    ? "text-green-600"
                    : "text-gray-900"
                )}
              >
                {value}
              </div>

              {isConnected && (
                <span className="flex items-center gap-1 text-xs font-medium text-green-600">
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  </div>
  {/* <div className="grid grid-cols-1 lg:grid-cols-1 gap-6">
 <div className="px-4 py-6 grid-cols-1 lg:grid-cols-1 rounded-3xl bg-white border border-gray-100 p-6 hover:shadow-lg transition space-y-2">
      <h3 className='py-2'>Suggested Next Actions</h3>
                           <div className="flex justify-between items-center px-4 py-3 rounded-xl bg-gray-50/50 border border-gray-200 hover:bg-gray-50 transition-all" style={{ borderWidth: '0.5px' }}>
                                  <span className="font-light text-gray-900 flex items-center gap-1" style={{ letterSpacing: '0.011em' }}> Publish 1 ready article</span>
</div>
                           <div className="flex justify-between items-center px-4 py-3 rounded-xl bg-gray-50/50 border border-gray-200 hover:bg-gray-50 transition-all" style={{ borderWidth: '0.5px' }}>
                                  <span className="font-light text-gray-900 flex items-center gap-1" style={{ letterSpacing: '0.011em' }}> Connect WordPress</span>
</div>
                           <div className="flex justify-between items-center px-4 py-3 rounded-xl bg-gray-50/50 border border-gray-200 hover:bg-gray-50 transition-all" style={{ borderWidth: '0.5px' }}>
                                  <span className="font-light text-gray-900 flex items-center gap-1" style={{ letterSpacing: '0.011em' }}> Connect Google Search Console</span>
</div>
                           <div className="flex justify-between items-center px-4 py-3 rounded-xl bg-gray-50/50 border border-gray-200 hover:bg-gray-50 transition-all" style={{ borderWidth: '0.5px' }}>
                                  <span className="font-light text-gray-900 flex items-center gap-1" style={{ letterSpacing: '0.011em' }}> Improve SEO for 2 blogs</span>
</div>
  </div>
</div> */}
  </div>
 <div className="px-4 py-6 grid-cols-1 lg:grid-cols-1 rounded-3xl bg-white border border-gray-100 p-6 hover:shadow-lg transition">
   <GSCAnalyticsView/>
  </div>
  </div>
          ) : activeTab === "analytics" ? (
            companyDomainLoading ? (
              <CompanyInfoSkeleton />
            ) : showResults ? (
              <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
                {/* Company Domain Heading */}
                <div className="text-center mb-12 flex flex-col items-center gap-4">
                  <div className="inline-flex items-center gap-5 bg-blue-50 border border-blue-200 text-blue-700 px-5 py-3 rounded-3xl shadow-sm">
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

                {/* Company Info Tab Content */}
                {activeCompanySubTab === "company-info" && (
                  <div>
                    {/* Domain Context - Centered and Wide */}
                    {domainContext && (
                      <div className="mb-16">
                        {(() => {
                          const full = domainContext;
                          const headers = [
                            "Business Model Analysis",
                            "Target Audience Profiling",
                            "Value Proposition & Positioning",
                            "SEO & Content Strategy Insights",
                            "Competitive Intelligence",
                            "Market Dynamics",
                            "Location-Based SEO Analysis",
                            "SEO Opportunity Analysis",
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
                                                    const leftSections = sections.slice(0, 4);
const rightSections = sections.slice(4, 8);

                       if (sections.some((s) => s.content.length > 0)) {
  return (
    <div className="p-4 sm:p-6 border-b border-gray-100 bg-gradient-to-b from-gray-50/50 to-white rounded-3xl">
      {/* Master Panel */}
      <div>
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-gray-600/50">
          <div>
            <h2 className="text-2xl font-light tracking-tight text-gray-900">
              Domain Info
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              AI-generated strategic analysis & recommendations
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="rounded-full bg-blue-50 px-4 py-1 text-xs font-medium text-blue-600 border border-blue-200">
              Analysis
            </span>
          </div>
        </div>

        {/* Body */}
       <div className="grid grid-cols-1 md:grid-cols-2 gap-6  py-6">
        <div className="space-y-4 ">
  {leftSections.map((sec, idx) => {
    const globalIdx = idx; 
    const isOpen = openSections.includes(globalIdx);

    return (
      <motion.div
        key={globalIdx}
        className="rounded-xl border border-gray-200/60 bg-white overflow-hidden hover:shadow-lg"
      >
        <button
          onClick={() => toggleSection(globalIdx)}
          className="flex w-full items-center justify-between px-6 py-4 text-left"
        >
          <h3 className="text-lg font-light text-gray-900">{sec.title}</h3>

          <motion.div animate={{ rotate: isOpen ? 180 : 0 }}>
            <ChevronDown size={20} />
          </motion.div>
        </button>

        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden px-6 pb-6"
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {sec.content}
              </ReactMarkdown>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  })}
</div>

          <div className="space-y-4">
  {rightSections.map((sec, idx) => {
    const globalIdx = idx + 4; // 4–7
    const isOpen = openSections.includes(globalIdx);

    return (
      <motion.div
        key={globalIdx}
        className="rounded-xl border border-gray-200/60 bg-white overflow-hidden hover:shadow-lg"
      >
        <button
          onClick={() => toggleSection(globalIdx)}
          className="flex w-full items-center justify-between px-6 py-4 text-left"
        >
          <h3 className="text-lg font-light text-gray-900">{sec.title}</h3>

          <motion.div animate={{ rotate: isOpen ? 180 : 0 }}>
            <ChevronDown size={20} />
          </motion.div>
        </button>

        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden px-6 pb-6"
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {sec.content}
              </ReactMarkdown>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  })}
</div>

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
                        <div className="bg-white rounded-3xl border border-gray-100 hover:shadow-lg overflow-hidden backdrop-blur-sm">
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
                                          className={getCompetitionBadge(
                                            keyword.competition
                                          )}
                                        >
                                          {keyword.competition}
                                        </span>
                                      </div>

                                      {/* CPC Column */}
                                      <div className="col-span-1 flex items-center justify-center">
                                        <span className="font-medium text-gray-900 text-sm">
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
                          className="inline-flex items-center gap-2 px-6 py-3 bg-black text-white rounded-full text-sm font-medium hover:bg-black/90  disabled:opacity-60 transition"
                        >
                          View Full Dashboard
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Integration Tab Content */}
                {activeCompanySubTab === 'integration' && (
                  <div className="max-w-6xl mx-auto space-y-6">
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
                          className="px-8 py-3 bg-black text-white rounded-full hover:bg-black/90 focus:outline-none focus:ring-4 focus:ring-black/10 transition-all shadow text-base font-medium"
                        >
                          Connect Google Search Console
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <div className="bg-white rounded-3xl p-8 border border-gray-100 hover:shadow-lg">
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
                          <div className="bg-white rounded-3xl p-8 border border-gray-100 hover:shadow-lg">
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

                    <div className="bg-white rounded-3xl p-8 border border-gray-100 hover:shadow-lg">
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
                              className="inline-flex items-center gap-2 px-6 py-3 bg-black text-white rounded-full text-sm font-medium hover:bg-black/90  disabled:opacity-60 transition"
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
            // Campaign Tab Logic - moved logic inside to handle full width for structure view
            (() => {
              if (selectedCampaignId) {
                 const selectedCampaign = campaigns.find(
                    (c) => c.id === selectedCampaignId
                  );
                  if (!selectedCampaign) {
                    return (
                      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
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
                      viewMode={campaignViewMode}
                      onViewModeChange={setCampaignViewMode}
                      sidebarOpen={sidebarOpen}
                    />
                  );
              }

              // Default Campaign List View (Centered)
              return (
              <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">

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
                      className="inline-flex items-center gap-2 px-6 py-3 bg-black text-white rounded-full text-sm font-medium hover:bg-black/90  disabled:opacity-60 transition"
                    >
                      <Plus className="h-4 w-4" />
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
                
                // Note: selectedCampaignId case is handled above the container now
                
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
            );
            })()
          ) : activeTab === 'publish' ? (
            companyDomainLoading ? (
              <CompanyInfoSkeleton />
                ) : (
                  <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
                  <PublishExperience
                  companyDomain={companyDomain}
                  domainContext={domainContext}
                  keywordsTableData={keywordsTableData}
                  hasWordpressIntegration={hasWordpressIntegration}
                  wpIntegration={wpIntegration}
                  onConfigureWordpress={handleConfigureWordpress}
                  onRefreshWordpressIntegration={async () => {
                    await fetchWordpressIntegration();
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

                {/* Hero Section */}
                <div className="text-center mb-20">
                  <div className="text-xs font-light uppercase tracking-wider text-gray-500 mb-4" style={{ letterSpacing: '0.083em' }}>
                    Domain Performance Audit
                  </div>
                  <h1
                    className="text-5xl sm:text-6xl md:text-7xl font-extralight mb-6 text-gray-900 "
                    style={{ letterSpacing: '-0.003em', lineHeight: 1.05 }}
                  >
                    Audit Your Domain
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
                      className="flex-1 max-w-md bg-white/70 backdrop-blur-md border border-gray-200 rounded-full px-6 py-3 flex items-center justify-between shadow-sm"
                      style={{ borderWidth: '0.5px' }}
                    >
                      <span className="text-gray-700 font-light truncate " style={{ letterSpacing: '0.011em' }}>
                        {companyDomain || "No domain available"}
                      </span>
                    </div>

                    <div className="flex gap-3 ">
                      <button
                        onClick={() => handleRunAudit(companyDomain)}
                        disabled={auditLoading || !companyDomain}
                        className={cn(
                          "inline-flex items-center gap-2 px-6 py-3 bg-black text-white rounded-full text-sm font-medium hover:bg-black/90  disabled:opacity-60 transition",
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
                       <PDFDownloadLink
                            document={<AuditPDF data={auditResult} domain={companyDomain} />}
                            fileName={`audit-${companyDomain}-${new Date().toISOString().split('T')[0]}.pdf`}
                            className="px-4 py-2 rounded-full border border-gray-200 text-sm font-light bg-white hover:bg-gray-50 flex items-center justify-center"
                          >
                            {({ loading }) => (loading ? 'Preparing...' : 'Export PDF')}
                          </PDFDownloadLink>
                    </div>
                  </div>

                  {/* N8n Results Display */}
                  {(n8nStatus || n8nResults) && (
                    <div className="mt-6 p-6 bg-white/70 backdrop-blur-md rounded-2xl border border-gray-200 shadow-sm" style={{ borderWidth: '0.5px' }}>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-light text-gray-900" style={{ letterSpacing: '-0.003em' }}>
                          N8n Processing
                        </h3>
                        <div className={cn(
                          "px-3 py-1 rounded-full text-xs font-light",
                          n8nStatus === 'processing' && "bg-blue-50 text-blue-700",
                          n8nStatus === 'completed' && "bg-green-50 text-green-700",
                          n8nStatus === 'failed' && "bg-red-50 text-red-700"
                        )}>
                          {n8nStatus === 'processing' && 'Processing...'}
                          {n8nStatus === 'completed' && 'Completed'}
                          {n8nStatus === 'failed' && 'Failed'}
                        </div>
                      </div>

                      {n8nStatus === 'processing' && (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>N8n is generating your reports...</span>
                        </div>
                      )}

                      {n8nResults && (
                        <div className="space-y-3">
                          {n8nResults.sheetsUrl && (
                            <a
                              href={n8nResults.sheetsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-3 p-4 rounded-xl bg-green-50 hover:bg-green-100 transition-colors border border-green-200"
                              style={{ borderWidth: '0.5px' }}
                            >
                              <FileText className="h-5 w-5 text-green-700" />
                              <div>
                                <div className="text-sm font-medium text-green-900">Google Sheets Report</div>
                                <div className="text-xs text-green-600">Click to open</div>
                              </div>
                            </a>
                          )}
                          {n8nResults.slidesUrl && (
                            <a
                              href={n8nResults.slidesUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-3 p-4 rounded-xl bg-blue-50 hover:bg-blue-100 transition-colors border border-blue-200"
                              style={{ borderWidth: '0.5px' }}
                            >
                              <FileText className="h-5 w-5 text-blue-700" />
                              <div>
                                <div className="text-sm font-medium text-blue-900">Google Slides Presentation</div>
                                <div className="text-xs text-blue-600">Click to open</div>
                              </div>
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  )}

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
                  ];

                  const scored = categories.map(c => ({ ...c, score: Math.round((c.value || 0) * 100) }));
                  const avg = scored.reduce((a, b) => a + b.score, 0) / scored.length;
                  const best = scored.reduce((a, b) => (b.score > a.score ? b : a));
                  const worst = scored.reduce((a, b) => (b.score < a.score ? b : a));
                  
                  return (
                    <div ref={resultsRef} className="space-y-16">
                      {/* Overall Score Section */}
                      <div className="flex flex-col items-center justify-center py-12">
                        <div className="mb-8">
                          <OverallScoreGauge score={overallScore} />
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
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-6">
  {categories.map(({ label, value }) => (
    <div
      key={label}
      className="bg-white/70 backdrop-blur-md rounded-2xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-all"
      style={{ borderWidth: '0.5px' }}
    >
      {/* Metric Title + Tooltip */}
      <div className="flex items-center justify-center gap-1 mb-4">
        <span
          className="text-sm font-light text-gray-700"
          style={{ letterSpacing: '0.011em' }}
        >
          {label}
        </span>

        {categoryDescriptions[label] && (
          <InfoTooltip text={categoryDescriptions[label]} />
        )}
      </div>

      {/* Gauge */}
      <AuditGaugeChart label={null} score={value} size={140} />
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
                                  <span
  className="font-light text-gray-900 flex items-center gap-1"
  style={{ letterSpacing: '0.011em' }}
>
  {key.toUpperCase()}
  <span className="text-gray-500">({fullForms[key] || key})</span>

  {metricDescriptions[key] && (
    <InfoTooltip text={metricDescriptions[key]} />
  )}
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
          ) : activeTab === 'analytics-report' ? (
            <AnalyticsReportingView />
          ): activeTab === 'gsc-analytics' ? (
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
              {/* GSC Sub-tabs */}
              <div className="flex items-center gap-2 mb-8 border-b border-gray-100 pb-4">
                <button
                  onClick={() => setActiveGscSubTab('whole-analytics')}
                  className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-200 ${
                    activeGscSubTab === 'whole-analytics'
                      ? 'bg-purple-600 text-white shadow-lg shadow-purple-200'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <ChartNoAxesCombined className="h-4 w-4" />
                    Whole Analytics
                  </span>
                </button>
                <button
                  onClick={() => setActiveGscSubTab('blog-performance')}
                  className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-200 ${
                    activeGscSubTab === 'blog-performance'
                      ? 'bg-purple-600 text-white shadow-lg shadow-purple-200'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    Our Blog Performance
                  </span>
                </button>
              </div>

              {/* GSC Sub-tab Content */}
              {activeGscSubTab === 'whole-analytics' ? (
                <GSCAnalyticsView />
              ) : (
                <GSCBlogAnalytics />
              )}
            </div>
          ) : activeTab === 'profile' ? (
            <div className="max-w-8xl mx-auto px-4 sm:px-6 py-12 sm:py-16 space-y-12">
              <Profile />
            </div>
          ) : activeTab === 'settings' ? (
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
              <div className="bg-white rounded-3xl p-12 border border-gray-100 hover:shadow-lg text-center">
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
  viewMode: 'split' | 'graph';
  onViewModeChange: (mode: 'split' | 'graph') => void;
  sidebarOpen: boolean;
}

function CampaignStructureView({ 
  campaign, 
  onBack, 
  companyDomain, 
  domainContext,
  keywordsTableData,
  hasWordpressIntegration,
  wpIntegration,
  onConfigureWordpress,
  onRefreshWordpressIntegration,
  viewMode,
  onViewModeChange,
  sidebarOpen
}: CampaignStructureViewProps) {
  const CAMPAIGN_API_BASE = `${API_BASE_URL}/api/campaigns`;
  // campaignViewMode state lifted to parent
  const [selectedTopicId, setSelectedTopicId] = useState<number | null>(null);
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
  
  // Track draft statuses (published/local drafts)
  const [draftStatuses, setDraftStatuses] = useState<Map<number, { isPublished: boolean; publishedUrl?: string; draftId?: number }>>(new Map());

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

  // Generation Drawer State
  const [generationDrawerOpen, setGenerationDrawerOpen] = useState(false);
  const [pendingGenerationTopic, setPendingGenerationTopic] = useState<Topic | null>(null);
  const [generationConfig, setGenerationConfig] = useState({
    wordCount: 800,
    images: 2,
    featuredImage: true,
    brandName: '',
    brandDescription: ''
  });
  
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
  // Pillar page generation states
  // generationDrawerOpen, generationConfig are already defined above
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

  // Hydrate active jobs on mount

  
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

  // Hydrate active jobs on mount
  const fetchActiveJobs = useCallback(async () => {
    try {
      const response = await fetch(`${CAMPAIGN_API_BASE}/active-jobs`, {
        headers: getAuthHeaders()
      });
      
      if (response.status === 401 || response.status === 403) {
        handleUnauthorized();
        return;
      }
      
      if (!response.ok) return;
      
      const data = await response.json();
      if (data.success && data.jobs) {
        // Update generationJobs
        setGenerationJobs(prev => {
             const updated = new Map(prev);
             // First mark all existing generating jobs as potentially stale/checked by backend
             // If a job is NOT in the backend active list, it might have finished or failed silently
             // But we don't want to remove it aggressively unless we know for sure.
             // For now, we just update/upsert what the backend tells us.
             
             data.jobs.forEach((job: any) => {
                 job.pages.forEach((p: any) => {
                     updated.set(p.pageId, {
                        jobId: job.jobId,
                        pageId: p.pageId,
                        pageType: p.pageType,
                        status: p.status,
                        draftId: p.draftId, // draftId from DB response
                        progress: p.progress || 0,
                        primaryKeyword: p.primaryKeyword,
                        hasHtml: false, // We'll rely on draft status mostly
                        updatedAt: new Date().toISOString(),
                        error: null
                     });
                 });
             });
             return updated;
        });
        
        // Update streaming messages
        setStreamingMessages(prev => {
            const updated = new Map(prev);
            data.jobs.forEach((job: any) => {
                if (job.messages && job.messages.length > 0) {
                    updated.set(job.jobId, job.messages);
                }
            });
            return updated;
        });
        
        // Update jobId mapping
        setJobIdToTopicId(prev => {
           const updated = new Map(prev);
           data.jobs.forEach((job: any) => {
               updated.set(job.jobId, job.topicId);
           });
           return updated;
        });

        // Sync backend job status for consistency
        setBackendJobStatus(prev => {
          const updated = new Map(prev);
          data.jobs.forEach((job: any) => {
            updated.set(job.jobId, {
              status: job.status,
              pages: job.pages
            });
          });
          return updated;
        });
      }
    } catch (err) {
      console.error("Failed to hydrate active jobs", err);
    }
  }, [CAMPAIGN_API_BASE, getAuthHeaders, handleUnauthorized]);

  React.useEffect(() => {
    fetchActiveJobs();
  }, [fetchActiveJobs]);

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
          error?: string;
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

  // Periodic polling for active generation jobs using the bulk endpoint
  // This serves as a fallback if SSE events are missed or not supported
  useEffect(() => {
    // Check if we have any active jobs that need monitoring
    const hasActiveJobs = Array.from(generationJobs.values()).some(
      job => job.status === 'generating' || job.status === 'pending'
    );
    
    // Also check streaming messages for recently active jobs
    const hasRecentStreaming = Array.from(lastStreamingTimestamp.entries()).some(
       ([jobId, timestamp]) => Date.now() - timestamp < 5 * 60 * 1000 // 5 mins
    );

    if (!hasActiveJobs && !hasRecentStreaming) return;

    const interval = setInterval(() => {
      fetchActiveJobs();
    }, 15000); // Poll every 15 seconds

    return () => clearInterval(interval);
  }, [generationJobs, lastStreamingTimestamp, fetchActiveJobs]);

  // Rehydrate generation state on load so generate buttons stay disabled after reload
  useEffect(() => {
    const rehydrate = async () => {
      if (!campaignStructure.topics || campaignStructure.topics.length === 0) return;
      const newMap = new Map<number, GenerationPageStatus>();
      const newDraftStatuses = new Map<number, { isPublished: boolean; publishedUrl?: string; draftId?: number }>();

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
            // Populate draftStatuses map if published
            if (p.draftId && (p.status === 'published' || (p.wordpressUrl && p.wordpressUrl.startsWith('http')))) {
                newDraftStatuses.set(p.pageId, {
                    isPublished: true,
                    publishedUrl: p.wordpressUrl || undefined,
                    draftId: p.draftId
                });
            }

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
      if (newDraftStatuses.size > 0) {
        setDraftStatuses(newDraftStatuses);
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

  function confirmDelete(label: string, action: () => void) {
    setDeleteLabel(label);
    setDeleteAction(() => action);
    setShowDeleteModal(true);
  }

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
  // Auto-fill brand fields is handled on initialization in handleGenerateTopic

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
    // 0. Check explicit loading state first (prevents jitter)
    if (generateTopicLoading === topic.id) return true;

    const pageIds = [
      topic.pillarPage?.id,
      ...(topic.subPages || []).map((sp) => sp.id),
    ].filter(Boolean) as number[];
    
    return pageIds.some((id) => {
      const job = generationJobs.get(id);
      if (!job) return false;
      
      // If page has HTML, it's completed (not generating)
      if (job.hasHtml) return false;

      // If explicitly marked as failed (e.g. by zombie check), it's not generating
      if (job.status === 'failed' || job.status === 'completed') return false;
      
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
        return true; // Fallback: if in generationJobs map and no HTML, assume generating
      }
      
      // If no jobId but in map and no HTML, assume initial generating state
      return true; 
    });
  }, [generationJobs, backendJobStatus, generateTopicLoading, isGenerationActive]);


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

    // Set loading state for this page
    if (pageId) {
      setPublishLoadingPageId(pageId);
      // Track that this page is publishing (SSE will clear this)
      setPublishingPageIds(prev => new Set(prev).add(pageId));
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
          draftId: draftId,
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

      // Job queued successfully - store mapping for SSE handler
      // The actual publishedUrl will come via SSE when n8n responds
      if (publishData.draftId && pageId) {
        setDraftToPageMap(prev => new Map(prev).set(publishData.draftId, pageId));
      }

      // Show "Publishing..." toast - success toast will come from SSE handler
      toast({
        title: 'Publishing...',
        description: 'Your content is being published to WordPress. This may take a moment.',
      });

      // Clear the initial loading state but keep publishingPageIds set
      // SSE handler will clear publishingPageIds when done
      if (pageId) {
        setPublishLoadingPageId(null);
      }

    } catch (error) {
      console.error('Error publishing draft:', error);
      toast({
        title: 'Publish Failed',
        description: error instanceof Error ? error.message : 'Unable to publish content',
        variant: 'destructive',
      });
      // On error, clear all loading states
      if (pageId) {
        setPublishLoadingPageId(null);
        setPublishingPageIds(prev => {
          const next = new Set(prev);
          next.delete(pageId);
          return next;
        });
      }
    }
  };

  const renderStatusPill = (pageId?: number) => {
    if (!pageId) return null;
    const job = generationJobs.get(pageId);

    // Check if currently publishing (waiting for SSE confirmation)
    if (publishingPageIds.has(pageId)) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium bg-purple-50 text-purple-600 border border-purple-100/50">
           <Loader2 className="h-3 w-3 animate-spin" />
           Publishing...
        </span>
      );
    }
    
    // Check generating state first
    const isGenerating = job && !job.hasHtml && (
      (job.jobId && isGenerationActive(job.jobId)) || 
      (job.jobId && backendJobStatus.get(job.jobId)?.status === 'generating')
    );

    if (isGenerating) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium bg-blue-50 text-blue-600 border border-blue-100/50">
           <div className="h-2.5 w-2.5 text-blue-600 flex items-center justify-center">
             <ButtonSpinner />
           </div>
           Generating
        </span>
      );
    }

    if (job?.hasHtml) {
      return (
        <div className="flex items-center gap-1.5">
           <button 
             onClick={() => viewDraft(job.draftId, pageId)}
             className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
           >
              <Eye className="h-3 w-3" />
              View
           </button>
           <button 
             onClick={() => publishDraft(job.draftId, pageId)}
             className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-colors"
           >
              <Send className="h-3 w-3" />
              Publish
           </button>
        </div>
      );
    }
    
    // Check if published via draft status
    const draftStatus = draftStatuses.get(pageId);
    if (draftStatus?.isPublished) {
         return (
            <div className="flex items-center gap-1.5">
               <button 
                 onClick={() => viewDraft(draftStatus.draftId!, pageId)}
                 className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
               >
                  <Pencil className="h-3 w-3" />
                  Edit
               </button>
               <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-green-50 text-green-700 border border-green-100/50">
                 Published
               </span>
               <a 
                 href={draftStatus.publishedUrl} 
                 target="_blank" 
                 rel="noopener noreferrer"
                 className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
               >
                  <ExternalLink className="h-3 w-3" />
                  View Live
               </a>
            </div>
         );
    }

    return null;
  };

  const currentTopic = currentGenerationTopicId
    ? campaignStructure.topics.find((t) => t.id === currentGenerationTopicId)
    : null;

  // Generation step state
  const [generationStep, setGenerationStep] = useState(1);

  const handleGenerateTopic = (topic: Topic) => {
    if (!canGenerateTopic(topic)) {
      toast({
        title: 'Add keywords first',
        description: 'Pillar and sub-pages need at least one keyword each before generating.',
        variant: 'destructive',
      });
      return;
    }

    setPendingGenerationTopic(topic);
    // Reset config with defaults or existing values if applicable
    setGenerationConfig({
      wordCount: 800,
      images: 2,
      featuredImage: true,
      brandName: derivedBrandName || 'Brand',
      brandDescription: derivedBrandDescription || '',
    });
    setGenerationStep(1);
    setGenerationDrawerOpen(true);
  };

  const handleConfirmGeneration = async () => {
    const topic = pendingGenerationTopic;
    if (!topic) return;

    setGenerateTopicLoading(topic.id);
    console.log(`[Campaign] Starting generation for topic ${topic.id}: ${topic.title}`);

    // Close drawer immediately
    setGenerationDrawerOpen(false);

    try {
      // Helper function to get primary and longtail keywords from a page's keywords
      const getKeywordSelections = (
        pageKeywords: Array<{ id: number; term: string; aiMetadata?: any }>,
      ) => {
        // Find primary keyword (marked with isPrimary: true in aiMetadata)
        const primaryKeyword = pageKeywords.find((kw) => {
          const metadata = kw.aiMetadata as any;
          return metadata?.isPrimary === true;
        });

        // Find longtail keywords (marked with isLongtail: true in aiMetadata)
        const longtailKeywords = pageKeywords.filter((kw) => {
          const metadata = kw.aiMetadata as any;
          return metadata?.isLongtail === true;
        });

        // Fallback: if no primary selected, use first keyword
        // If no longtail selected, use remaining keywords
        const fallbackPrimary = primaryKeyword || pageKeywords[0];
        const fallbackLongtail =
          longtailKeywords.length > 0
            ? longtailKeywords
            : pageKeywords.filter((_, idx) => idx > 0);

        return {
          primary: fallbackPrimary?.term || '',
          longtail: fallbackLongtail.map((k) => k.term).filter(Boolean),
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
            image: generationConfig.images,
            word_count: generationConfig.wordCount,
            featured_image: generationConfig.featuredImage ? 'yes' : 'no',
          },
        },
        sub_pillar_pages: topic.subPages.map((sp) => {
          const subPageKeywords = getKeywordSelections(sp.keywords);
          return {
            primary_keyword: subPageKeywords.primary || sp.title,
            longtail_keywords: subPageKeywords.longtail,
            options: {
              image: generationConfig.images,
              word_count: generationConfig.wordCount,
              featured_image: generationConfig.featuredImage ? 'yes' : 'no',
            },
          };
        }),
        brand: {
          brand_name: generationConfig.brandName,
          brand_description: generationConfig.brandDescription,
        },
      };

      const response = await fetch(
        `${API_BASE_URL}/api/campaigns/topics/${topic.id}/generate-content`,
        {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload),
        },
      );

      if (response.status === 401 || response.status === 403) {
        handleUnauthorized();
        return;
      }

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to start generation');
      }

      const { jobId, pages } = data as {
        jobId: string;
        pages: { pageId: number; pageType: string; draftId?: number; primaryKeyword?: string }[];
      };

      // Store jobId -> topicId mapping for streaming updates
      setJobIdToTopicId((prev) => {
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
      setPendingGenerationTopic(null);
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

const handleUpdatePillar = async (topicId: number, updates: { title?: string; referenceUrl?: string }) => {
    try {
      await mutateStructure(
        `${CAMPAIGN_API_BASE}/topics/${topicId}/pillar`,
        {
          method: 'PUT',
          body: JSON.stringify(updates),
        },
        { successMessage: 'Pillar page updated' }
      );
    } catch {
      // handled upstream
    }
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

  const handleDeleteKeyword = (
  _context: { type: 'pillar' | 'subpage'; topicId: number; pageId: number },
  keywordId: number
) => {
  setDeleteLabel('keyword')
  setDeleteAction(() => () =>
    mutateStructure(
      `${CAMPAIGN_API_BASE}/keywords/${keywordId}`,
      { method: 'DELETE' },
      { successMessage: 'Keyword deleted' }
    )
  )
  setShowDeleteModal(true)
}


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

  // --- Render ---
  
  const selectedTopic = selectedTopicId 
    ? campaignStructure.topics.find(t => t.id === selectedTopicId) || null 
    : null;

  return (
    <>
    <div className="flex h-[calc(100vh-4rem)] w-full bg-white overflow-hidden">
      {/* 2. Secondary Sidebar: Topic List */}
      <div 
        className={`w-[280px] border-r border-[#0000001a] flex-shrink-0 transition-all duration-300 ${viewMode === 'graph' ? 'w-0 opacity-0 overflow-hidden border-none' : ''}`}
        style={{
          background: 'rgba(255, 255, 255, 0.72)',
          backdropFilter: 'saturate(180%) blur(20px)',
          WebkitBackdropFilter: 'saturate(180%) blur(20px)',
        }}
      >
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="h-16 flex items-center px-5 border-b border-[#0000001a] flex-shrink-0 z-10">
             <button
                onClick={onBack}
                className="mr-3 p-1.5 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors"
             >
               <ArrowLeft className="h-4 w-4" />
             </button>
             <h1 className="font-medium text-gray-900 truncate text-sm" title={campaign.title}>
               {campaign.title}
             </h1>
          </div>

          <CampaignTopicSidebar
            topics={campaignStructure.topics}
            selectedTopicId={selectedTopicId}
            onSelectTopic={setSelectedTopicId}
            onAddTopic={(isAi) => isAi ? handleAddTopic(true) : handleAddTopic(false)}
            onDeleteTopic={handleDeleteTopic}
            aiLoading={aiLoading}
            syncing={syncing}
            isTopicGenerating={isTopicGenerating}
          />
        </div>
      </div>

      {/* 3. Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-gray-50/50 relative">
      
        {/* Content Body */}
        <div className="flex-1 relative overflow-hidden">
            
            {/* Split View: Detail Pane */}
            <div className={`absolute inset-0 bg-gray-50/50 transition-opacity duration-300 overflow-y-auto ${viewMode === 'split' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
               <div className="h-full p-8 max-w-5xl mx-auto">
                 {selectedTopic ? (
                   <CampaignTopicDetail
                     topic={selectedTopic}
                     isGenerating={isTopicGenerating(selectedTopic)}
                     streamingMessages={
                       (jobIdToTopicId.size > 0 
                         ? Array.from(jobIdToTopicId.entries()).find(([_, tid]) => tid === selectedTopicId)?.[0] 
                         : undefined) 
                         ? streamingMessages.get(Array.from(jobIdToTopicId.entries()).find(([_, tid]) => tid === selectedTopicId)![0]) || []
                         : []
                     }
                     jobId={
                       Array.from(jobIdToTopicId.entries()).find(([_, tid]) => tid === selectedTopicId)?.[0]
                     }
                     generationJobs={generationJobs}
                     onGenerateTopic={handleGenerateTopic}
                     onReferenceUrlChange={(tid, url) => {
                        const t = campaignStructure.topics.find(t => t.id === tid);
                        if(t) handleUpdatePillar(t.pillarPage!.id, { referenceUrl: url });
                     }}
                     onDeletePillar={handleDeletePillarPage}
                     onDeleteSubPage={handleDeleteSubPage}
                     renderStatusPill={renderStatusPill}
                     onAddSubPage={(tid) => { setTargetTopicId(tid); setShowAddSubPageModal(true); }}
                     onAddKeyword={handleAddKeyword}
                     onDeleteKeyword={handleDeleteKeyword}
                     onSelectPrimaryKeyword={handleSelectPrimaryKeyword}
                     onSelectLongtailKeyword={handleSelectLongtailKeyword}
                     onDeselectKeyword={handleDeselectKeyword}
                     aiLoading={aiLoading}
                   />
                 ) : (
                   <div className="h-full flex flex-col items-center justify-center text-gray-400">
                     <Layout className="h-12 w-12 mb-4 opacity-20" />
                     <p>Create/Select your topic to get started.</p>
                     <img className="mt-4 h-40 w-40" src="/public/Campaign.png" alt="Campaign" />
                   </div>
                 )}
               </div>
            </div>

            {/* Graph View: Full Screen */}
            <div className={`absolute inset-0 bg-white transition-opacity duration-300 ${viewMode === 'graph' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
               <div className="w-full h-full">
                <CampaignGraph
                  campaignStructure={campaignStructure}
                  selectedTopics={selectedTopics}
                />
               </div>
            </div>

        </div>
      </div>
{showAddSubPageModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-gray-100">
            <h2 className="text-xl font-light text-gray-900 mb-6">Add Sub Page</h2>
            <input
              type="text"
              placeholder="Page Title"
              className="w-full p-4 border border-gray-200 rounded-xl mb-6 text-sm focus:ring-2 focus:ring-black/5 focus:border-black outline-none transition-all"
              value={newSubPageTitle}
              onChange={(e) => setNewSubPageTitle(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if(e.key === 'Enter') handleSubmitSubPage();
                if(e.key === 'Escape') setShowAddSubPageModal(false);
              }}
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowAddSubPageModal(false)}
                className="px-6 py-2.5 rounded-full text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitSubPage}
                disabled={!newSubPageTitle.trim()}
                className="px-6 py-2.5 bg-black text-white rounded-full hover:bg-black/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm font-medium shadow-lg shadow-black/10"
              >
                Add Page
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Generation Config Drawer */}
      <Sheet open={generationDrawerOpen} onOpenChange={setGenerationDrawerOpen}>
        <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle>Generate Content</SheetTitle>
            <SheetDescription>
              Configure generation options for "{pendingGenerationTopic?.title}".
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-8 py-4">
            {/* Step 1: Word Count */}
            {generationStep === 1 && (
              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <Label className="text-base font-medium">Word Count Target</Label>
                    <span className="text-sm text-gray-500 font-mono bg-gray-100 px-2 py-1 rounded">{generationConfig.wordCount} words</span>
                  </div>
                  <Slider
                    value={[generationConfig.wordCount]}
                    min={400}
                    max={3000}
                    step={100}
                    onValueChange={(vals) => setGenerationConfig(prev => ({ ...prev, wordCount: vals[0] }))}
                    className="py-4"
                  />
                  <p className="text-xs text-gray-500">
                    Determines the approximate length of each article. Longer articles perform better for SEO but take longer to generate.
                  </p>
                </div>

                <div className="flex flex-col gap-4 pt-4">
                   <button 
                     onClick={() => setGenerationStep(2)}
                     className="w-full py-2.5 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors font-medium text-sm"
                   >
                     Next: Imagery
                   </button>
                </div>
              </div>
            )}

            {/* Step 2: Imagery */}
            {generationStep === 2 && (
              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <Label className="text-base font-medium">Images per Article</Label>
                    <span className="text-sm text-gray-500 font-mono bg-gray-100 px-2 py-1 rounded">{generationConfig.images} images</span>
                  </div>
                  <Slider
                    value={[generationConfig.images]}
                    min={0}
                    max={5}
                    step={1}
                    onValueChange={(vals) => setGenerationConfig(prev => ({ ...prev, images: vals[0] }))}
                    className="py-4"
                  />
                </div>

                <div className="flex items-center justify-between p-4 border border-gray-100 rounded-xl bg-gray-50/50">
                  <div className="space-y-0.5">
                    <Label className="text-base">Featured Image</Label>
                    <p className="text-xs text-gray-500">Generate a high-quality hero image</p>
                  </div>
                  <Switch
                    checked={generationConfig.featuredImage}
                    onCheckedChange={(checked) => setGenerationConfig(prev => ({ ...prev, featuredImage: checked }))}
                  />
                </div>

                <div className="flex flex-col gap-3 pt-4">
                   <button 
                     onClick={() => setGenerationStep(3)}
                     className="w-full py-2.5 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors font-medium text-sm"
                   >
                     Next: Brand Voice
                   </button>
                   <button 
                     onClick={() => setGenerationStep(1)}
                     className="w-full py-2.5 bg-white text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm"
                   >
                     Back
                   </button>
                </div>
              </div>
            )}

            {/* Step 3: Brand Voice */}
            {generationStep === 3 && (
              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="brand-name">Brand Name</Label>
                    <Input 
                      id="brand-name"
                      value={generationConfig.brandName}
                      onChange={(e) => setGenerationConfig(prev => ({ ...prev, brandName: e.target.value }))}
                      placeholder="e.g. Acme Corp"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="brand-desc">Tone & Description (Optional)</Label>
                    <textarea 
                      id="brand-desc"
                      className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      value={generationConfig.brandDescription}
                      onChange={(e) => setGenerationConfig(prev => ({ ...prev, brandDescription: e.target.value }))}
                      placeholder="e.g. Professional, authoritative, yet accessible. Focus on Enterprise solutions."
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-3 pt-6">
                   <button 
                     onClick={handleConfirmGeneration}
                     disabled={generateTopicLoading === pendingGenerationTopic?.id}
                     className="w-full py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors font-medium flex items-center justify-center gap-2"
                   >
                     {generateTopicLoading === pendingGenerationTopic?.id ? (
                       <>
                         <ButtonSpinner /> Starting Generation...
                       </>
                     ) : (
                       <>
                         <Sparkles className="w-4 h-4" /> Start Generation
                       </>
                     )}
                   </button>
                   <button 
                     onClick={() => setGenerationStep(2)}
                     className="w-full py-2.5 bg-white text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm"
                   >
                     Back
                   </button>
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {showAddKeywordModal && addKeywordContext && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60]">
          <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-lg border border-gray-100 transform transition-all scale-100">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-light text-gray-900">Add Keyword</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Adding to <span className="font-medium text-gray-900">{addKeywordContext.type === 'pillar' ? 'Pillar Page' : 'Sub Page'}</span>
                </p>
              </div>
              <button 
                onClick={() => setShowAddKeywordModal(false)}
                className="p-2 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors text-gray-400 hover:text-gray-600"
              >
                <Trash2 className="h-5 w-5 " />
              </button>
            </div>

            {/* Keyword Type Selection */}
            <div className="flex bg-gray-100 p-1 rounded-lg mb-6">
              <button
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                  newKeywordType === 'primary' 
                    ? 'bg-white text-black shadow-sm' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
                onClick={() => setNewKeywordType('primary')}
              >
                Primary
              </button>
              <button
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                  newKeywordType === 'longtail' 
                    ? 'bg-white text-black shadow-sm' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
                onClick={() => setNewKeywordType('longtail')}
              >
                Longtail
              </button>
            </div>

            <div className="space-y-4">
              {/* Searchable Dropdown */}
              <div className="relative">
                <label className="block text-xs uppercase tracking-wider text-gray-500 font-medium mb-1.5">
                  Keyword Term
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search or enter custom keyword..."
                    className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-black/5 focus:border-black outline-none transition-all"
                    value={keywordSearchOpen ? keywordSearchValue : newKeywordTerm}
                    onChange={(e) => {
                      setKeywordSearchValue(e.target.value);
                      setNewKeywordTerm(e.target.value);
                      setKeywordSearchOpen(true);
                    }}
                    onFocus={() => {
                        setKeywordSearchOpen(true);
                        // Ensure keywords are loaded
                        if (availableKeywords.length === 0) {
                            fetchDomainKeywords(campaign.id);
                        }
                    }}
                  />
                </div>
                
                {/* Dropdown Results */}
                {keywordSearchOpen && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-100 max-h-60 overflow-y-auto z-50 animate-in fade-in zoom-in-95 duration-200">
                    {loadingKeywords ? (
                      <div className="p-8 text-center text-gray-400 flex flex-col items-center">
                        <Loader2 className="h-5 w-5 animate-spin mb-2" />
                        <span className="text-xs">Loading suggestions...</span>
                      </div>
                    ) : (
                      <>
                         {availableKeywords
                          .filter(k => k.term.toLowerCase().includes(keywordSearchValue.toLowerCase()))
                          .slice(0, 50) 
                          .map((k) => (
                            <button
                              key={k.id}
                              className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center justify-between group transition-colors border-b border-gray-50 last:border-0"
                              onClick={() => {
                                setNewKeywordTerm(k.term);
                                setNewKeywordVolume(k.volume?.toString() || '');
                                setNewKeywordDifficulty(k.difficulty || 'Medium');
                                setKeywordSearchOpen(false);
                              }}
                            >
                              <div>
                                <span className="text-sm text-gray-900 font-medium">{k.term}</span>
                                <div className="flex items-center gap-2 mt-0.5">
                                   <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                      k.difficulty === 'Easy' ? 'bg-green-100 text-green-700' :
                                      k.difficulty === 'Hard' ? 'bg-red-100 text-red-700' :
                                      'bg-yellow-100 text-yellow-700'
                                   }`}>
                                     {k.difficulty || 'Medium'}
                                   </span>
                                   {k.volume && (
                                     <span className="text-[10px] text-gray-400">
                                       Vol: {k.volume.toLocaleString()}
                                     </span>
                                   )}
                                </div>
                              </div>
                              <Plus className="h-4 w-4 text-gray-300 group-hover:text-black transition-colors" />
                            </button>
                          ))}
                        
                        {/* No results state */}
                        {availableKeywords.filter(k => k.term.toLowerCase().includes(keywordSearchValue.toLowerCase())).length === 0 && (
                          <div className="p-4 text-center">
                            <p className="text-sm text-gray-500 mb-2">No matching keywords found</p>
                            <button
                                onClick={() => setKeywordSearchOpen(false)}
                                className="text-xs text-blue-600 hover:underline font-medium"
                            >
                                Use &quot;{keywordSearchValue}&quot; as custom keyword
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs uppercase tracking-wider text-gray-500 font-medium mb-1.5">
                    Volume
                  </label>
                  <input
                    type="number"
                    placeholder="e.g. 1000"
                    className="w-full p-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-black/5 focus:border-black outline-none transition-all"
                    value={newKeywordVolume}
                    onChange={(e) => setNewKeywordVolume(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider text-gray-500 font-medium mb-1.5">
                    Difficulty
                  </label>
                  <select
                    className="w-full p-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-black/5 focus:border-black outline-none transition-all bg-white"
                    value={newKeywordDifficulty}
                    onChange={(e) => setNewKeywordDifficulty(e.target.value)}
                  >
                    <option value="Easy">Easy</option>
                    <option value="Medium">Medium</option>
                    <option value="Hard">Hard</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-gray-100">
              <button
                onClick={() => setShowAddKeywordModal(false)}
                className="px-6 py-2.5 rounded-full text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                disabled={keywordSearchOpen}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitKeyword}
                disabled={!newKeywordTerm.trim() || keywordSearchOpen}
                className="px-8 py-2.5 bg-black text-white rounded-full hover:bg-black/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm font-medium shadow-lg shadow-black/10 flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Add Keyword
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-[70]">
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

      {/* Generation Config Drawer - Matches Publish Tab Style */}
      <Sheet open={generationDrawerOpen} onOpenChange={setGenerationDrawerOpen}>
        <SheetContent 
          side="right" 
          className="w-full sm:max-w-3xl border-l border-[#e2e4ea] bg-[#f5f6fa] px-10 py-12 overflow-y-auto font-light"
        >
          <div className="space-y-10">
            {/* Header Card */}
            <div className="rounded-[32px] border border-white/80 bg-white/90 px-6 py-6 shadow-[0_30px_80px_rgba(15,23,42,0.10)] backdrop-blur">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-3">
                  <div className="inline-flex items-center gap-2 rounded-full border border-black/10 px-4 py-1 text-[10px] tracking-[0.35em] uppercase text-gray-500">
                    Content Generation
                  </div>
                  <div>
                    <h3 className="text-[28px] font-light text-gray-900 tracking-tight">
                      {generateTopicLoading === pendingGenerationTopic?.id ? (
                        <span className="flex items-center gap-2">
                          Generating content...
                          <svg className="h-5 w-5 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4A8 8 0 104 12z" />
                          </svg>
                        </span>
                      ) : (
                        `Step ${generationStep} of 3`
                      )}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">Configure options for "{pendingGenerationTopic?.title}"</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-1">
                    {[1, 2, 3].map((step) => (
                      <span
                        key={`progress-${step}`}
                        className={`h-1.5 w-12 rounded-full transition-all ${
                          step <= generationStep ? 'bg-black/80' : 'bg-black/10'
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-xs uppercase tracking-[0.3em] text-gray-400">
                    Generation flow
                  </p>
                </div>
              </div>
            </div>

            {/* Step 1: Word Count */}
            {generationStep === 1 && (
              <section className="rounded-[36px] border border-white/70 bg-white p-8 shadow-[0_30px_80px_rgba(15,23,42,0.08)] space-y-8">
                <div className="space-y-2">
                  <span className="text-[11px] uppercase tracking-[0.35em] text-gray-400">Word cadence</span>
                  <h4 className="text-2xl font-light text-gray-900">Dial in the depth and pace.</h4>
                  <p className="text-sm text-gray-500 max-w-2xl">
                    Glide between quick reads and flagship editorials. Every notch subtly changes paragraph
                    length, transitions, and how immersive the narration should feel.
                  </p>
                </div>
                <div className="rounded-[28px] border border-gray-100 bg-gray-50/70 p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">Projected read time</p>
                      <p className="text-xs text-gray-500">A calm slider tuned for editorial pacing.</p>
                    </div>
                    <div className="inline-flex items-baseline gap-2 rounded-full bg-white px-5 py-1.5 shadow-inner">
                      <span className="text-2xl font-light">{generationConfig.wordCount}</span>
                      <span className="text-xs uppercase tracking-[0.25em] text-gray-500">words</span>
                    </div>
                  </div>
                  <Slider
                    value={[generationConfig.wordCount]}
                    min={400}
                    max={3000}
                    step={100}
                    onValueChange={(vals) => setGenerationConfig(prev => ({ ...prev, wordCount: vals[0] }))}
                    className="py-4"
                  />
                </div>
                <button 
                  onClick={() => setGenerationStep(2)}
                  className="w-full py-3.5 bg-gray-900 text-white rounded-full hover:bg-gray-800 transition-colors font-medium text-sm"
                >
                  Continue to Imagery
                </button>
              </section>
            )}

            {/* Step 2: Imagery */}
            {generationStep === 2 && (
              <section className="rounded-[36px] border border-white/70 bg-white p-8 shadow-[0_30px_80px_rgba(15,23,42,0.08)] space-y-8">
                <div className="space-y-2">
                  <span className="text-[11px] uppercase tracking-[0.35em] text-gray-400">Visual elements</span>
                  <h4 className="text-2xl font-light text-gray-900">Set the visual tone.</h4>
                  <p className="text-sm text-gray-500 max-w-2xl">
                    Choose how many images to generate and whether to include a featured hero image.
                  </p>
                </div>
                <div className="rounded-[28px] border border-gray-100 bg-gray-50/70 p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">Images per article</p>
                      <p className="text-xs text-gray-500">Inline images throughout the content.</p>
                    </div>
                    <div className="inline-flex items-baseline gap-2 rounded-full bg-white px-5 py-1.5 shadow-inner">
                      <span className="text-2xl font-light">{generationConfig.images}</span>
                      <span className="text-xs uppercase tracking-[0.25em] text-gray-500">images</span>
                    </div>
                  </div>
                  <Slider
                    value={[generationConfig.images]}
                    min={0}
                    max={5}
                    step={1}
                    onValueChange={(vals) => setGenerationConfig(prev => ({ ...prev, images: vals[0] }))}
                    className="py-4"
                  />
                </div>
                <div className="flex items-center justify-between p-5 rounded-[28px] border border-gray-100 bg-gray-50/70">
                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold text-gray-800">Featured Image</p>
                    <p className="text-xs text-gray-500">Generate a high-quality hero banner</p>
                  </div>
                  <Switch
                    checked={generationConfig.featuredImage}
                    onCheckedChange={(checked) => setGenerationConfig(prev => ({ ...prev, featuredImage: checked }))}
                  />
                </div>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setGenerationStep(1)}
                    className="flex-1 py-3.5 bg-white text-gray-700 border border-gray-200 rounded-full hover:bg-gray-50 transition-colors font-medium text-sm"
                  >
                    Back
                  </button>
                  <button 
                    onClick={() => setGenerationStep(3)}
                    className="flex-1 py-3.5 bg-gray-900 text-white rounded-full hover:bg-gray-800 transition-colors font-medium text-sm"
                  >
                    Continue to Brand
                  </button>
                </div>
              </section>
            )}

            {/* Step 3: Brand Voice */}
            {generationStep === 3 && (
              <section className="rounded-[36px] border border-white/70 bg-white p-8 shadow-[0_30px_80px_rgba(15,23,42,0.08)] space-y-8">
                <div className="space-y-2">
                  <span className="text-[11px] uppercase tracking-[0.35em] text-gray-400">Brand voice</span>
                  <h4 className="text-2xl font-light text-gray-900">Define your brand's personality.</h4>
                  <p className="text-sm text-gray-500 max-w-2xl">
                    The AI will adapt its writing style to match your brand's tone and values.
                  </p>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs uppercase tracking-[0.35em] text-gray-400">Brand Name</label>
                    <input
                      type="text"
                      value={generationConfig.brandName}
                      onChange={(e) => setGenerationConfig(prev => ({ ...prev, brandName: e.target.value }))}
                      placeholder="e.g. Acme Corp"
                      className="w-full px-5 py-4 rounded-[28px] border border-gray-200 bg-gradient-to-br from-white via-white to-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-base shadow-inner"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs uppercase tracking-[0.35em] text-gray-400">Tone & Description (Optional)</label>
                    <textarea
                      value={generationConfig.brandDescription}
                      onChange={(e) => setGenerationConfig(prev => ({ ...prev, brandDescription: e.target.value }))}
                      placeholder="e.g. Professional, authoritative, yet accessible. Focus on Enterprise solutions."
                      rows={4}
                      className="w-full px-5 py-4 rounded-[28px] border border-gray-200 bg-gradient-to-br from-white via-white to-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-base shadow-inner resize-none"
                    />
                  </div>
                </div>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setGenerationStep(2)}
                    className="flex-1 py-3.5 bg-white text-gray-700 border border-gray-200 rounded-full hover:bg-gray-50 transition-colors font-medium text-sm"
                  >
                    Back
                  </button>
                  <button 
                    onClick={handleConfirmGeneration}
                    disabled={generateTopicLoading === pendingGenerationTopic?.id}
                    className="flex-1 py-3.5 bg-gray-900 text-white rounded-full hover:bg-gray-800 transition-colors font-medium text-sm flex items-center justify-center gap-2"
                  >
                    {generateTopicLoading === pendingGenerationTopic?.id ? (
                      <>
                        <ButtonSpinner /> Starting...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" /> Start Generation
                      </>
                    )}
                  </button>
                </div>
              </section>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Preview Overlay - Fills content area beside sidebar */}
      {previewPageId && (
        <div 
          className="fixed top-0 right-0 bottom-0 z-[60] bg-[#f5f6fa] flex flex-col"
          style={{ left: sidebarOpen ? '280px' : '96px' }}
        >
          {/* Header with prominent back button */}
          <div className="sticky top-0 z-[70] flex items-center gap-4 px-6 py-4 border-b border-gray-200 bg-white/80 backdrop-blur-md shadow-sm supports-[backdrop-filter]:bg-white/60">
            <button
              onClick={() => { setPreviewPageId(null); setPreviewDraft(null); }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm group"
            >
              <ChevronLeft className="h-4 w-4 text-gray-400 group-hover:text-gray-900 transition-colors" />
              <span className="text-sm font-medium">Back</span>
            </button>
            <div className="h-6 w-px bg-gray-200" />
            <span className="text-sm text-gray-900 font-medium">Draft Preview</span>
            
            <div className="flex-1" />
            
            <button
              onClick={() => { setPreviewPageId(null); setPreviewDraft(null); }}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors"
              aria-label="Close preview"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          
          {/* Content */}
          <div className="relative flex-1 overflow-hidden bg-gray-50">
            <PublishExperience
              companyDomain={companyDomain}
              domainContext={domainContext}
              keywordsTableData={keywordsTableData}
              hasWordpressIntegration={hasWordpressIntegration}
              wpIntegration={wpIntegration}
              onConfigureWordpress={onConfigureWordpress}
              onRefreshWordpressIntegration={onRefreshWordpressIntegration}
              isActive={true}
              initialDraftId={previewPageId}
              disablePreviewOverlay={true}
            />
          </div>
        </div>
      )}
    </>
  );
};

export default SidebarDashboard;
