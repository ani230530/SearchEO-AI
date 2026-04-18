import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Edit,
  ExternalLink,
  Eye,
  List,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Table,
  Trash2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ButtonSpinner } from '@/components/ui/button-spinner';
import type {
  CampaignStructure,
  DraftStatusRecord,
  GenerationPageStatus,
  GenerationStreamingEvent,
  Keyword,
  KeywordTableItem,
  Topic,
} from '@/types';
import type { WordpressIntegration } from '@/types/publish';
import {
  normalizeDomain,
  summarizeDomainContext,
} from '@/features/sidebar-dashboard/utils';
import { CampaignStructureSurface } from './CampaignStructureSurface';


const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3002";

export type CampaignViewMode = 'split' | 'graph' | 'table';

export type CampaignDraftStatus = {
  isPublished: boolean;
  isFailed?: boolean;
  publishedUrl?: string;
  draftId?: number;
  error?: string;
};

export type CampaignSharedPublishStatus = {
  status: 'generating' | 'published' | 'failed';
  publishedUrl?: string;
  wordpressPostId?: number | null;
  error?: string;
  updatedAt?: string;
};

export type CampaignGenerationConfig = {
  wordCount: number;
  images: number;
  featuredImageEnabled: boolean;
  brandName: string;
  brandDescription: string;
};

export type CampaignAddKeywordContext = {
  type: 'pillar' | 'subpage';
  topicId: number;
  pageId: number;
} | null;

// Campaign Structure View Component
export interface CampaignStructureViewProps {
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
  viewMode: CampaignViewMode;
  onViewModeChange: (mode: CampaignViewMode) => void;

  sidebarOpen: boolean;
  // Sync states passed from SidebarDashboard
  publishingPageIds: Set<number>;
  setPublishingPageIds: React.Dispatch<React.SetStateAction<Set<number>>>;
  draftToPageMap: Map<number, number>;
  setDraftToPageMap: React.Dispatch<React.SetStateAction<Map<number, number>>>;
  draftStatuses: Map<number, CampaignDraftStatus>;
  setDraftStatuses: React.Dispatch<React.SetStateAction<Map<number, CampaignDraftStatus>>>;
  sharedPublishStatuses: Map<number, CampaignSharedPublishStatus>;
  onPublishUpdate: (data: {
    draftId?: number;
    pageId?: number;
    status: 'published' | 'failed' | 'generating';
    publishedUrl?: string;
    wordpressPostId?: number | null;
    error?: string;
  }) => void;
  getCampaignPageDisplayName: (pageId?: number, fallback?: string | null) => string;
  generationJobs: Map<number, GenerationPageStatus>;
  setGenerationJobs: React.Dispatch<React.SetStateAction<Map<number, GenerationPageStatus>>>;
  campaignPageIdContext: number | null;
  setCampaignPageIdContext: React.Dispatch<React.SetStateAction<number | null>>;
  currentGenerationTopicId: number | null;
  setCurrentGenerationTopicId: React.Dispatch<React.SetStateAction<number | null>>;
}

export default function CampaignStructureView({ 
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
  sidebarOpen,
  publishingPageIds,
  setPublishingPageIds,
  draftToPageMap,
  setDraftToPageMap,
  draftStatuses,
  setDraftStatuses,
  sharedPublishStatuses,
  onPublishUpdate,
  getCampaignPageDisplayName,
  generationJobs,
  setGenerationJobs,
  campaignPageIdContext,
  setCampaignPageIdContext,
  currentGenerationTopicId,
  setCurrentGenerationTopicId
}: CampaignStructureViewProps) {
  // campaignPageIdContext lifted to props

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

  // Track generation job statuses moved to props


  // Modal states
  const [showAddTopicModal, setShowAddTopicModal] = useState(false);
  const [showAddPillarModal, setShowAddPillarModal] = useState(false);
  const [showAddSubPageModal, setShowAddSubPageModal] = useState(false);
  


  const [showAddKeywordModal, setShowAddKeywordModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteLabel, setDeleteLabel] = useState<string>('');
  const [deleteAction, setDeleteAction] = useState<(() => void) | null>(null);
  const [addKeywordContext, setAddKeywordContext] = useState<CampaignAddKeywordContext>(null);

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
  const [generationDrawerOpen, setGenerationDrawerOpen] = useState(false);
  const [pendingGenerationTopic, setPendingGenerationTopic] = useState<Topic | null>(null);
  const [generationConfig, setGenerationConfig] = useState<CampaignGenerationConfig>({
    wordCount: 800,
    images: 0,
    featuredImageEnabled: true,
    brandName: '',
    brandDescription: '',
  });
  const { toast } = useToast();

  // Pillar page generation states
  // Pillar page generation states
  // generationDrawerOpen, generationConfig are already defined above
  // Auto-fill brand fields using company domain/context (mirrors publish tab)
  const derivedBrandName = React.useMemo(() => {
    if (companyDomain) {
      return normalizeDomain(companyDomain);
    }
    return '';
  }, [companyDomain]);
  const derivedBrandDescription = React.useMemo(
    () => summarizeDomainContext(domainContext || ''),
    [domainContext]
  );

  const [generateTopicLoading, setGenerateTopicLoading] = useState<number | null>(null);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);
  const [previewPageId, setPreviewPageId] = useState<number | null>(null);
  // currentGenerationTopicId lifted to props

  const [viewLoadingPageId, setViewLoadingPageId] = useState<number | null>(null);
  const [closePreviewLoading, setClosePreviewLoading] = useState(false);
  const [publishLoadingPageId, setPublishLoadingPageId] = useState<number | null>(null);
  // States now lifted to parent props: publishingPageIds, draftToPageMap, draftStatuses, generationJobs
  
  // Streaming progress state
  const [streamingMessages, setStreamingMessages] = useState<Map<string, GenerationStreamingEvent[]>>(new Map());
  const [jobIdToTopicId, setJobIdToTopicId] = useState<Map<string, number>>(new Map());
  
  // Active generation tracking - track last streaming timestamp per jobId
  const [lastStreamingTimestamp, setLastStreamingTimestamp] = useState<Map<string, number>>(new Map());

  // Hydrate active jobs on mount

  
  // Backend job status tracking - stores backend's view of job status
  const [backendJobStatus, setBackendJobStatus] = useState<Map<string, {
    status: 'pending' | 'generating' | 'completed' | 'failed';
    pages: Array<{ pageId: number; status: string; progress: number }>;
  }>>(new Map());
  const generationJobsRef = useRef(generationJobs);
  const jobIdToTopicIdRef = useRef(jobIdToTopicId);
  const draftToPageMapRef = useRef(draftToPageMap);
  const campaignEventSourceRef = useRef<EventSource | null>(null);
  const campaignReconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const campaignReconnectAttemptRef = useRef(0);
  
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

  useEffect(() => {
    generationJobsRef.current = generationJobs;
  }, [generationJobs]);

  useEffect(() => {
    jobIdToTopicIdRef.current = jobIdToTopicId;
  }, [jobIdToTopicId]);

  useEffect(() => {
    draftToPageMapRef.current = draftToPageMap;
  }, [draftToPageMap]);

  const resolveTopicIdForJobId = useCallback((jobId: string): number | null => {
    const mappedTopicId = jobIdToTopicIdRef.current.get(jobId);
    if (typeof mappedTopicId === 'number') return mappedTopicId;
    return null;
  }, []);

  const reconcileTopicDraftStatus = useCallback(async (topicId: number) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/campaigns/topics/${topicId}/drafts-status`,
        { headers: getAuthHeaders() }
      );

      if (response.status === 401 || response.status === 403) {
        handleUnauthorized();
        return;
      }

      if (!response.ok) return;
      const data = await response.json();
      if (!data.success || !Array.isArray(data.pages)) return;

      const topicPages = data.pages as DraftStatusRecord[];
      if (!topicPages.length) return;
      const terminalPageIds = new Set<number>();
      const terminalDraftIds = new Set<number>();

      topicPages.forEach((p) => {
        if (p.status === 'published' || p.status === 'failed') {
          terminalPageIds.add(p.pageId);
          if (p.draftId) {
            terminalDraftIds.add(p.draftId);
          }
        }
      });

      setGenerationJobs(prev => {
        const updated = new Map(prev);
        topicPages.forEach((p) => {
          const existing = updated.get(p.pageId);
          let finalStatus = (p.status || existing?.status || 'pending') as GenerationPageStatus['status'];
          if (p.hasHtml && finalStatus !== 'published') {
            finalStatus = 'completed';
          }
          updated.set(p.pageId, {
            jobId: p.jobId || existing?.jobId || '',
            topicId,
            pageId: p.pageId,
            pageType: p.pageType === 'subpage' ? 'subpage' : 'pillar',
            status: finalStatus,
            draftId: p.draftId ?? existing?.draftId,
            progress: typeof p.progress === 'number' ? p.progress : p.hasHtml ? 100 : existing?.progress ?? 0,
            primaryKeyword: p.primaryKeyword ?? existing?.primaryKeyword,
            hasHtml: p.hasHtml ?? existing?.hasHtml,
            updatedAt: p.updatedAt || existing?.updatedAt || new Date().toISOString(),
            error: p.error ?? existing?.error ?? null,
            wordpressUrl: p.wordpressUrl ?? existing?.wordpressUrl ?? null,
          });
        });
        return updated;
      });

        setDraftStatuses(prev => {
          const updated = new Map(prev);
          topicPages.forEach((p) => {
            const existing = updated.get(p.pageId);
            if (p.draftId) {
            const isPublished = p.status === 'published';
            updated.set(p.pageId, {
              isPublished,
              isFailed: p.status === 'failed',
              publishedUrl: isPublished ? p.wordpressUrl || undefined : undefined,
              draftId: p.draftId,
              error: p.error || existing?.error
            });
            return;
          }
          if (p.status === 'failed' && existing) {
            updated.set(p.pageId, {
              ...existing,
              isPublished: false,
              isFailed: true,
              error: p.error || existing.error
            });
          }
        });
        return updated;
      });

      if (terminalPageIds.size > 0) {
        setPublishingPageIds((prev) => {
          const updated = new Set(prev);
          terminalPageIds.forEach((pageId) => updated.delete(pageId));
          return updated;
        });
      }

      if (terminalDraftIds.size > 0) {
        setDraftToPageMap((prev) => {
          const updated = new Map(prev);
          terminalDraftIds.forEach((draftId) => updated.delete(draftId));
          return updated;
        });
      }

      if (data.job?.jobId && Array.isArray(data.events)) {
        setJobIdToTopicId(prev => {
          const updated = new Map(prev);
          updated.set(data.job.jobId, topicId);
          return updated;
        });
        setStreamingMessages(prev => {
          const updated = new Map(prev);
          updated.set(data.job.jobId, data.events);
          return updated;
        });
      }
    } catch (err) {
      console.error('Failed to reconcile topic drafts-status', { topicId, err });
    }
  }, [getAuthHeaders, handleUnauthorized, setDraftStatuses, setGenerationJobs, setDraftToPageMap, setPublishingPageIds]);

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
        const activeJobIds = new Set<string>(data.jobs.map((job: any) => String(job.jobId)));
        const staleJobIds = new Set<string>();
        generationJobsRef.current.forEach((job) => {
          if (!job.jobId) return;
          if ((job.status === 'generating' || job.status === 'pending') && !activeJobIds.has(job.jobId)) {
            staleJobIds.add(job.jobId);
          }
        });

        // Update generationJobs
        setGenerationJobs(prev => {
          const updated = new Map(prev);

          data.jobs.forEach((job: any) => {
            job.pages.forEach((p: any) => {
              updated.set(p.pageId, {
                jobId: job.jobId,
                topicId: job.topicId,
                pageId: p.pageId,
                pageType: p.pageType,
                status: p.status,
                draftId: p.draftId,
                progress: p.progress || 0,
                primaryKeyword: p.primaryKeyword,
                hasHtml: false,
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
          for (const key of Array.from(updated.keys())) {
            if (!activeJobIds.has(key)) updated.delete(key);
          }
          data.jobs.forEach((job: any) => {
            if (job.events && job.events.length > 0) {
              updated.set(job.jobId, job.events);
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
          for (const key of Array.from(updated.keys())) {
            if (!activeJobIds.has(key)) updated.delete(key);
          }
          data.jobs.forEach((job: any) => {
            updated.set(job.jobId, {
              status: job.status,
              pages: job.pages
            });
          });
          return updated;
        });

        setLastStreamingTimestamp(prev => {
          const updated = new Map(prev);
          for (const key of Array.from(updated.keys())) {
            if (!activeJobIds.has(key)) updated.delete(key);
          }
          return updated;
        });

        if (staleJobIds.size > 0) {
          const topicIds = new Set<number>();
          staleJobIds.forEach((jobId) => {
            const topicId = resolveTopicIdForJobId(jobId);
            if (typeof topicId === 'number') {
              topicIds.add(topicId);
            }
          });
          if (topicIds.size > 0) {
            await Promise.all(Array.from(topicIds).map((topicId) => reconcileTopicDraftStatus(topicId)));
          }
        }
      }
    } catch (err) {
      console.error("Failed to hydrate active jobs", err);
    }
  }, [CAMPAIGN_API_BASE, getAuthHeaders, handleUnauthorized, reconcileTopicDraftStatus, resolveTopicIdForJobId]);

  React.useEffect(() => {
    fetchActiveJobs();
  }, [fetchActiveJobs]);

  // Handle streaming progress updates
  const handleStreamingUpdate = useCallback((event: GenerationStreamingEvent) => {
    if (!event.jobId || !event.message) return;

    if (typeof event.topicId === 'number') {
      setJobIdToTopicId(prev => {
        const updated = new Map(prev);
        updated.set(event.jobId, event.topicId!);
        return updated;
      });
    }

    // Update last streaming timestamp (marks generation as active)
    const now = Date.now();
    setLastStreamingTimestamp(prev => {
      const updated = new Map(prev);
      updated.set(event.jobId, now);
      return updated;
    });

    setStreamingMessages(prev => {
      const updated = new Map(prev);
      const messages = updated.get(event.jobId) || [];
      updated.set(event.jobId, [...messages, event].slice(-100));
      return updated;
    });

    if (typeof event.pageId === 'number') {
      setGenerationJobs((prev) => {
        const updated = new Map(prev);
        const existing = updated.get(event.pageId!);
        updated.set(event.pageId!, {
          jobId: event.jobId,
          topicId: event.topicId ?? existing?.topicId ?? null,
          pageId: event.pageId!,
          pageType: event.pageType === 'subpage' ? 'subpage' : 'pillar',
          status: (event.status || existing?.status || 'generating') as GenerationPageStatus['status'],
          draftId: existing?.draftId,
          progress: typeof event.progress === 'number' ? event.progress : existing?.progress,
          primaryKeyword: existing?.primaryKeyword,
          hasHtml: existing?.hasHtml,
          updatedAt: event.timestamp,
          error: event.status === 'failed' ? event.message : existing?.error ?? null,
          wordpressUrl: existing?.wordpressUrl || null,
          phase: event.phase ?? existing?.phase ?? null,
        });
        return updated;
      });
    }
  }, []);

  // Subscribe to one SSE stream for campaign + publish state.
  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (!token) return;

    let isUnmounted = false;

    const connect = () => {
      if (isUnmounted) return;
      if (campaignEventSourceRef.current) {
        campaignEventSourceRef.current.close();
      }

      const eventSource = new EventSource(`${API_BASE_URL}/api/sse?token=${encodeURIComponent(token)}`);
      campaignEventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        campaignReconnectAttemptRef.current = 0;
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as {
            type?: string;
            jobId?: string;
            topicId?: number;
            pageId?: number;
            pageType?: 'pillar' | 'subpage';
            status?: 'pending' | 'generating' | 'completed' | 'failed' | 'published';
            phase?: string;
            progress?: number;
            message?: string;
            timestamp?: string;
            sequence?: number;
            draftId?: number;
            publishedUrl?: string;
            wordpressPostId?: number | null;
            pages?: Partial<GenerationPageStatus & { pageType: string; hasHtml?: boolean; error?: string | null }>[];
            error?: string;
          };

          if (data.type === 'publish_update' && data.status) {
            onPublishUpdate({
              draftId: data.draftId,
              pageId: data.pageId,
              status: data.status === 'published' || data.status === 'failed' ? data.status : 'generating',
              publishedUrl: data.publishedUrl,
              wordpressPostId: data.wordpressPostId,
              error: data.error,
            });
            return;
          }

          if (data.type === 'generation_update' && data.jobId) {
            setBackendJobStatus((prev) => {
              const updated = new Map(prev);
              updated.set(data.jobId!, {
                status: data.status === 'failed' ? 'failed' : 'generating',
                pages: [],
              });
              return updated;
            });

            if (data.status === 'failed') {
              setGenerationJobs((prev) => {
                const updated = new Map(prev);
                updated.forEach((job, pageId) => {
                  if (job.jobId === data.jobId && (job.status === 'pending' || job.status === 'generating')) {
                    updated.set(pageId, {
                      ...job,
                      status: 'failed',
                      error: data.error || 'Generation failed before n8n returned content.',
                      updatedAt: data.timestamp || new Date().toISOString(),
                    });
                  }
                });
                return updated;
              });

              toast({
                title: 'Generation Failed',
                description: data.error || 'The generation request was rejected.',
                variant: 'destructive',
              });
            }
            return;
          }
          
          // Handle streaming progress updates
          if (data.type === 'streaming') {
            handleStreamingUpdate({
              jobId: data.jobId || '',
              topicId: data.topicId,
              pageId: data.pageId,
              pageType: data.pageType,
              status: data.status,
              phase: data.phase,
              progress: data.progress,
              message: data.message || '',
              sequence: data.sequence,
              timestamp: data.timestamp || new Date().toISOString(),
            });
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
                  topicId: data.topicId ?? existing?.topicId ?? null,
                  pageId,
                  pageType: p.pageType === 'subpage' ? 'subpage' : 'pillar',
                  status: (p.status || existing?.status || 'generating') as GenerationPageStatus['status'],
                  draftId: p.draftId ?? existing?.draftId,
                  progress: typeof p.progress === 'number' ? p.progress : p.hasHtml ? 100 : existing?.progress,
                  primaryKeyword: p.primaryKeyword ?? existing?.primaryKeyword,
                  hasHtml: p.hasHtml ?? existing?.hasHtml,
                  updatedAt: new Date().toISOString(),
                  error: p.error ?? existing?.error ?? null,
                  wordpressUrl: existing?.wordpressUrl ?? null,
                  phase: existing?.phase ?? null,
                });

                const justCompleted =
                  p.status === 'completed' &&
                  existing?.status !== 'completed' &&
                  existing?.status !== 'published' &&
                  !notifiedReadyPageIdsRef.current.has(pageId);

                if (justCompleted) {
                  notifiedReadyPageIdsRef.current.add(pageId);
                  const pageName = getCampaignPageDisplayName(pageId, p.primaryKeyword ?? existing?.primaryKeyword ?? null);
                  toast({
                    title: 'Draft ready',
                    description: `${pageName} is ready for review.`,
                  });
                }
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
        if (campaignEventSourceRef.current === eventSource) {
          campaignEventSourceRef.current = null;
        }
        if (isUnmounted) return;
        const attempt = campaignReconnectAttemptRef.current + 1;
        campaignReconnectAttemptRef.current = attempt;
        const delayMs = Math.min(30000, 1000 * Math.pow(2, Math.min(attempt, 5)));
        if (campaignReconnectTimerRef.current) {
          clearTimeout(campaignReconnectTimerRef.current);
        }
        campaignReconnectTimerRef.current = setTimeout(() => {
          connect();
        }, delayMs);
      };
    };

    connect();

    return () => {
      isUnmounted = true;
      if (campaignReconnectTimerRef.current) {
        clearTimeout(campaignReconnectTimerRef.current);
        campaignReconnectTimerRef.current = null;
      }
      if (campaignEventSourceRef.current) {
        campaignEventSourceRef.current.close();
        campaignEventSourceRef.current = null;
      }
    };
  }, [onPublishUpdate, handleStreamingUpdate, toast, getCampaignPageDisplayName]);

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
      const newDraftStatuses = new Map<number, {
        isPublished: boolean;
        isFailed?: boolean;
        publishedUrl?: string;
        draftId?: number;
        error?: string;
      }>();

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
            // Populate draftStatuses map if we have a draftId
            if (p.draftId) {
                newDraftStatuses.set(p.pageId, {
                    isPublished: p.status === 'published',
                    isFailed: p.status === 'failed',
                    publishedUrl: p.status === 'published' ? p.wordpressUrl || undefined : undefined,
                    draftId: p.draftId,
                    error: p.error || undefined
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
              topicId: topic.id,
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
          if (data.job?.jobId && Array.isArray(data.events)) {
            setJobIdToTopicId((prev) => {
              const updated = new Map(prev);
              updated.set(data.job.jobId, topic.id);
              return updated;
            });
            setStreamingMessages((prev) => {
              const updated = new Map(prev);
              updated.set(data.job.jobId, data.events);
              return updated;
            });
          }
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
      console.log('triggerAiSubPage triggered for topicId:', topicId);
      const key = `subpage-${topicId}`;
      setAiLoading(key);
      try {
        console.log('Calling API:', `${CAMPAIGN_API_BASE}/topics/${topicId}/subpages/ai`);
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
        return false;
      }
      
      return false;
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
      // Keep only the draft id here; PublishExperience loads the draft by id.
      setPreviewPageId(draftId);
      if (pageId) setCampaignPageIdContext(pageId);
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

  // Poll publish status as fallback when SSE terminal event is missed
  useEffect(() => {
    if (publishingPageIds.size === 0) return;

    let cancelled = false;

    const pollPublishStatuses = async () => {
      const mappings = Array.from(draftToPageMap.entries());
      const publishingTopicIds = new Set<number>();
      publishingPageIds.forEach((pageId) => {
        const topicId = generationJobs.get(pageId)?.topicId
          || campaignStructure.topics.find((topic) =>
            topic.pillarPage?.id === pageId || topic.subPages?.some((page) => page.id === pageId)
          )?.id;
        if (typeof topicId === 'number') {
          publishingTopicIds.add(topicId);
        }
      });

      type TerminalPublishStatus = {
        draftId: number;
        pageId: number;
        status: 'published' | 'failed';
        wordpressUrl?: string | null;
        error?: string | null;
      };

      try {
        if (mappings.length > 0) {
          const results = await Promise.all(
            mappings.map(async ([draftId, pageId]): Promise<TerminalPublishStatus | null> => {
              const draftHeaders = getAuthHeaders();
              let response = await fetch(`${API_BASE_URL}/api/publish/drafts/${draftId}`, {
                headers: draftHeaders,
              });

              if (response.status === 401 || response.status === 403) {
                handleUnauthorized();
                return null;
              }

              if (!response.ok) {
                response = await fetch(`${API_BASE_URL}/api/campaigns/drafts/${draftId}`, {
                  headers: draftHeaders,
                });
                if (response.status === 401 || response.status === 403) {
                  handleUnauthorized();
                  return null;
                }
              }

              if (!response.ok) return null;

              const data = await response.json();
              if (!data.success || !data.draft) return null;

              const status = String(data.draft.status || '').toLowerCase();
              if (status !== 'published' && status !== 'failed') return null;

              return {
                draftId,
                pageId,
                status,
                wordpressUrl: data.draft.wordpressUrl ?? null,
                error: data.draft.error ?? null
              };
            })
          );

          if (cancelled) return;

          const terminalResults = results.filter(Boolean) as TerminalPublishStatus[];
          if (terminalResults.length > 0) {
            const terminalDraftIds = new Set<number>(terminalResults.map((r) => r.draftId));
            const terminalPageIds = new Set<number>(terminalResults.map((r) => r.pageId));

            setPublishingPageIds(prev => {
              const updated = new Set(prev);
              terminalPageIds.forEach((pageId) => updated.delete(pageId));
              return updated;
            });

            setDraftToPageMap(prev => {
              const updated = new Map(prev);
              terminalDraftIds.forEach((draftId) => updated.delete(draftId));
              return updated;
            });

            setSharedPublishStatuses(prev => {
              const updated = new Map(prev);
              terminalResults.forEach((result) => {
                updated.set(result.draftId, {
                  status: result.status,
                  publishedUrl: result.wordpressUrl || undefined,
                  error: result.error || undefined,
                  updatedAt: new Date().toISOString()
                });
              });
              return updated;
            });

            setDraftStatuses(prev => {
              const updated = new Map(prev);
              terminalResults.forEach((result) => {
                const existing = updated.get(result.pageId);
                if (result.status === 'published') {
                  updated.set(result.pageId, {
                    isPublished: true,
                    isFailed: false,
                    publishedUrl: result.wordpressUrl || undefined,
                    draftId: result.draftId,
                    error: undefined
                  });
                  return;
                }
                updated.set(result.pageId, {
                  isPublished: false,
                  isFailed: true,
                  publishedUrl: undefined,
                  draftId: result.draftId,
                  error: result.error || existing?.error
                });
              });
              return updated;
            });

            setGenerationJobs(prev => {
              const updated = new Map(prev);
              terminalResults.forEach((result) => {
                const existing = updated.get(result.pageId);
                if (!existing) return;
                updated.set(result.pageId, {
                  ...existing,
                  status: result.status,
                  wordpressUrl: result.status === 'published'
                    ? (result.wordpressUrl || existing.wordpressUrl || null)
                    : null,
                  error: result.status === 'failed'
                    ? (result.error || existing.error || null)
                    : null
                });
              });
              return updated;
            });
          }
        }

        if (publishingTopicIds.size > 0) {
          await Promise.all(Array.from(publishingTopicIds).map((topicId) => reconcileTopicDraftStatus(topicId)));
        }
      } catch (err) {
        console.error('Publish polling fallback failed', err);
      }
    };

    pollPublishStatuses();
    const interval = setInterval(pollPublishStatuses, 15000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [campaignStructure.topics, draftToPageMap, generationJobs, getAuthHeaders, handleUnauthorized, publishingPageIds, reconcileTopicDraftStatus, setDraftStatuses, setGenerationJobs, setDraftToPageMap, setPublishingPageIds]);

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
          pageId: pageId, // Pass pageId context for campaign synchronization
          primaryKeyword: draft.primaryKeyword,
          htmlContent: draft.htmlContent,
          featuredImageEnabled: draft.featuredImageEnabled,
          featuredImageUrl: draft.featuredImageUrl,
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
      const mappedDraftId = publishData.draftId || draftId;
      if (mappedDraftId && pageId) {
        setDraftToPageMap(prev => new Map(prev).set(Number(mappedDraftId), pageId));
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
    const draftStatus = draftStatuses.get(pageId);
    const resolvedPublishedUrl =
      draftStatus?.publishedUrl ||
      (job?.status === 'published' ? job.wordpressUrl || undefined : undefined);
    const resolvedDraftId = draftStatus?.draftId || job?.draftId;

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

    // 3. Published State
    if ((draftStatus?.isPublished || job?.status === 'published') && resolvedPublishedUrl) {
         return (
            <div className="flex items-center gap-1.5">
               <button 
                 onClick={() => viewDraft(resolvedDraftId!, pageId)}
                 className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
               >
                  <Pencil className="h-3 w-3" />
                  Edit
               </button>
               <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-green-50 text-green-700 border border-green-100/50">
                 Published
               </span>
               <a 
                 href={resolvedPublishedUrl} 
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

    // 4. Failed State
    if (draftStatus?.isFailed || job?.status === 'failed') {
      const failedDraftId = draftStatus?.draftId || job?.draftId;
      return (
        <div className="flex items-center gap-1.5">
           <button 
             onClick={() => viewDraft(failedDraftId, pageId)}
             className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
           >
              <Eye className="h-3 w-3" />
              View
           </button>
           <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-50 text-red-700 border border-red-100/50">
             Failed
           </span>
           <button 
             onClick={() => publishDraft(failedDraftId, pageId)}
             className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-colors"
           >
              <RefreshCw className="h-3 w-3" />
              Retry
           </button>
        </div>
      );
    }

    // 5. Draft Ready to Publish
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
      images: 0,
      featuredImageEnabled: true,
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
        campaign_id: campaign.id,
        topic_id: topic.id,
        pages: [
          {
            page_id: pillar.id,
            page_type: 'pillar',
            primary_keyword: pillarKeywords.primary || pillar.title,
            longtail_keywords: pillarKeywords.longtail,
            options: {
              image_count: generationConfig.images,
              word_count: generationConfig.wordCount,
              featured_image: generationConfig.featuredImageEnabled ? 'yes' : 'no',
            },
          },
          ...topic.subPages.map((sp) => {
          const subPageKeywords = getKeywordSelections(sp.keywords);
          return {
            page_id: sp.id,
            page_type: 'subpage',
            primary_keyword: subPageKeywords.primary || sp.title,
            longtail_keywords: subPageKeywords.longtail,
            options: {
              image_count: generationConfig.images,
              word_count: generationConfig.wordCount,
              featured_image: generationConfig.featuredImageEnabled ? 'yes' : 'no',
            },
          };
        })],
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
            topicId: topic.id,
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
        description: `Generating ${pages.length} page(s).`,
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

  const handleCreatePillarPage = async (topicId: number) => {
    try {
      await mutateStructure(
        `${CAMPAIGN_API_BASE}/topics/${topicId}/pillar`,
        { method: 'POST' },
        { successMessage: 'Pillar page created' }
      );
    } catch {
      // handled upstream
    }
  };

  const handleUpdateTopicTitle = async (topicId: number, title: string) => {
    try {
      await mutateStructure(
        `${CAMPAIGN_API_BASE}/topics/${topicId}`,
        {
          method: 'PUT',
          body: JSON.stringify({ title }),
        },
        { successMessage: 'Topic title updated' }
      );
    } catch {
      // handled upstream
    }
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

  const handleUpdatePageTitle = async (pageId: number, title: string) => {
    try {
      await mutateStructure(
        `${CAMPAIGN_API_BASE}/pages/${pageId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ title }),
        },
        { successMessage: 'Page title updated' }
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

  // --- Render ---
  
  const selectedTopic = selectedTopicId 
    ? campaignStructure.topics.find(t => t.id === selectedTopicId) || null 
    : null;

  return (
    <CampaignStructureSurface
      campaign={campaign}
      onBack={onBack}
      viewMode={viewMode}
      onViewModeChange={onViewModeChange}
      sidebarOpen={sidebarOpen}
      companyDomain={companyDomain}
      domainContext={domainContext}
      keywordsTableData={keywordsTableData}
      hasWordpressIntegration={hasWordpressIntegration}
      wpIntegration={wpIntegration}
      onConfigureWordpress={onConfigureWordpress}
      onRefreshWordpressIntegration={onRefreshWordpressIntegration}
      campaignPageIdContext={campaignPageIdContext}
      sharedPublishStatuses={sharedPublishStatuses}
      campaignStructure={campaignStructure}
      selectedTopicId={selectedTopicId}
      setSelectedTopicId={setSelectedTopicId}
      selectedTopic={selectedTopic}
      aiLoading={aiLoading}
      syncing={syncing}
      generationJobs={generationJobs}
      draftStatuses={draftStatuses}
      selectedTopics={selectedTopics}
      jobIdToTopicId={jobIdToTopicId}
      streamingMessages={streamingMessages}
      isTopicGenerating={isTopicGenerating}
      handleAddTopic={handleAddTopic}
      handleDeleteTopic={handleDeleteTopic}
      handleGenerateTopic={handleGenerateTopic}
      handleUpdateTopicTitle={handleUpdateTopicTitle}
      handleUpdatePillar={handleUpdatePillar}
      handleDeletePillarPage={handleDeletePillarPage}
      handleAddPillarPage={handleAddPillarPage}
      triggerAiPillar={triggerAiPillar}
      handleAddSubPage={handleAddSubPage}
      triggerAiSubPage={triggerAiSubPage}
      handleDeleteSubPage={handleDeleteSubPage}
      handleUpdatePageTitle={handleUpdatePageTitle}
      renderStatusPill={renderStatusPill}
      handleAddKeyword={handleAddKeyword}
      handleDeleteKeyword={handleDeleteKeyword}
      handleSelectPrimaryKeyword={handleSelectPrimaryKeyword}
      handleSelectLongtailKeyword={handleSelectLongtailKeyword}
      handleDeselectKeyword={handleDeselectKeyword}
      showAddPillarModal={showAddPillarModal}
      setShowAddPillarModal={setShowAddPillarModal}
      newPillarTitle={newPillarTitle}
      setNewPillarTitle={setNewPillarTitle}
      handleSubmitPillarPage={handleSubmitPillarPage}
      showAddSubPageModal={showAddSubPageModal}
      setShowAddSubPageModal={setShowAddSubPageModal}
      newSubPageTitle={newSubPageTitle}
      setNewSubPageTitle={setNewSubPageTitle}
      handleSubmitSubPage={handleSubmitSubPage}
      generationDrawerOpen={generationDrawerOpen}
      setGenerationDrawerOpen={setGenerationDrawerOpen}
      pendingGenerationTopic={pendingGenerationTopic}
      generationStep={generationStep}
      setGenerationStep={setGenerationStep}
      generationConfig={generationConfig}
      setGenerationConfig={setGenerationConfig}
      handleConfirmGeneration={handleConfirmGeneration}
      generateTopicLoading={generateTopicLoading}
      showAddTopicModal={showAddTopicModal}
      setShowAddTopicModal={setShowAddTopicModal}
      newTopicTitle={newTopicTitle}
      setNewTopicTitle={setNewTopicTitle}
      handleSubmitTopic={handleSubmitTopic}
      showAddKeywordModal={showAddKeywordModal}
      setShowAddKeywordModal={setShowAddKeywordModal}
      addKeywordContext={addKeywordContext}
      newKeywordType={newKeywordType}
      setNewKeywordType={setNewKeywordType}
      keywordSearchOpen={keywordSearchOpen}
      setKeywordSearchOpen={setKeywordSearchOpen}
      keywordSearchValue={keywordSearchValue}
      setKeywordSearchValue={setKeywordSearchValue}
      newKeywordTerm={newKeywordTerm}
      setNewKeywordTerm={setNewKeywordTerm}
      newKeywordVolume={newKeywordVolume}
      setNewKeywordVolume={setNewKeywordVolume}
      newKeywordDifficulty={newKeywordDifficulty}
      setNewKeywordDifficulty={setNewKeywordDifficulty}
      loadingKeywords={loadingKeywords}
      availableKeywords={availableKeywords}
      fetchDomainKeywords={fetchDomainKeywords}
      handleSubmitKeyword={handleSubmitKeyword}
      showDeleteModal={showDeleteModal}
      setShowDeleteModal={setShowDeleteModal}
      deleteLabel={deleteLabel}
      deleteAction={deleteAction}
      previewPageId={previewPageId}
      closePreview={() => {
        setPreviewPageId(null);
      }}
    />
  );
};
