import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Search,
  Check,
  CheckCircle,
  Plus,
  Save ,
  X,
  ImagePlus,
  ArrowUpDown,
  RotateCcw,
  Edit,
  Eye,
  Trash2,
  Image as ImageIcon,
  Send,
} from 'lucide-react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/use-toast';
import PublishOverviewCard from './PublishOverviewCard';
import PublishHistoryTable from './PublishHistoryTable';
import Tippy from '@tippyjs/react';
import 'tippy.js/dist/tippy.css';
import 'tippy.js/themes/light.css';
import { KeywordTableItem, DraftPreview } from '@/types';
import {
  WordpressIntegration,
  GeneratedArticleContent,
  PublishHistoryEntry,
} from '@/types/publish';
import type { Instance } from 'tippy.js';
import parse from 'html-react-parser';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002';

interface PublishExperienceProps {
  companyDomain?: string;
  domainContext?: string;
  keywordsTableData?: KeywordTableItem[];
  hasWordpressIntegration?: boolean;
  wpIntegration?: WordpressIntegration | null;
  onRefreshWordpressIntegration?: () => void;
  initialDraft?: GeneratedArticleContent | null;
  initialDraftId?: number | null;
  pageId?: number;
  onBack?: () => void;
  publishingPageIds?: Set<number>;
  setPublishingPageIds?: React.Dispatch<React.SetStateAction<Set<number>>>;
  draftToPageMap?: Map<number, number>;
  setDraftToPageMap?: React.Dispatch<React.SetStateAction<Map<number, number>>>;
  draftStatuses?: Map<number, { isPublished: boolean; isFailed?: boolean; publishedUrl?: string; draftId?: number; error?: string }>;
  setDraftStatuses?: React.Dispatch<React.SetStateAction<Map<number, { isPublished: boolean; isFailed?: boolean; publishedUrl?: string; draftId?: number; error?: string }>>>;
  sharedPublishStatuses?: Map<number, {
    status: 'generating' | 'published' | 'failed';
    publishedUrl?: string;
    wordpressPostId?: number | null;
    error?: string;
    updatedAt?: string;
  }>;
}

interface PublishFormState {
  primaryKeyword: string;
  longtailKeywords: string;
  brandName: string;
  brandDescription: string;
  images: number;
  wordCount: number;
  featuredImageEnabled: boolean;
}

interface DraftSnapshot {
  htmlContent: string;
  title: string;
  metaDescription: string;
  slug: string;
  longtailKeywords: string;
  featuredImageEnabled: boolean;
  featuredImageUrl: string;
  primaryKeyword: string;
}

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
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4A8 8 0 104 12z" />
  </svg>
);

// Calculate word count from HTML content
const calculateWordCount = (html: string): number => {
  if (!html) return 0;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const text = doc.body.textContent || '';
    const words = text.trim().split(/\s+/).filter(word => word.length > 0);
    return words.length;
  } catch (error) {
    console.error('Error calculating word count:', error);
    return 0;
  }
};

const slugifyText = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

const isValidHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

const createDraftSnapshot = (
  content: GeneratedArticleContent | null,
  htmlContent?: string
): DraftSnapshot => ({
  htmlContent: htmlContent ?? content?.htmlContent ?? '',
  title: content?.title ?? '',
  metaDescription: content?.metaDescription ?? '',
  slug: content?.slug ?? '',
  longtailKeywords: content?.longtailKeywords ?? '',
  featuredImageEnabled: Boolean(content?.featuredImageEnabled),
  featuredImageUrl: content?.featuredImageUrl ?? '',
  primaryKeyword: content?.primaryKeyword ?? '',
});

const PublishExperience: React.FC<PublishExperienceProps> = ({
  companyDomain,
  domainContext,
  keywordsTableData,
  hasWordpressIntegration,
  wpIntegration,
  onRefreshWordpressIntegration,
  initialDraft,
  initialDraftId,
  pageId,
  onBack,
  publishingPageIds,
  setPublishingPageIds,
  draftToPageMap,
  setDraftToPageMap,
  draftStatuses,
  setDraftStatuses,
  sharedPublishStatuses,
}) => {
  const { toast } = useToast();
  const [publishForm, setPublishForm] = useState<PublishFormState>({
    primaryKeyword: '',
    longtailKeywords: '',
    brandName: '',
    brandDescription: '',
    images: 2,
    wordCount: 800,
    featuredImageEnabled: true,
  });
  const [publishLoading, setPublishLoading] = useState(false);
  const [publishResult, setPublishResult] = useState<GeneratedArticleContent | null>(null);
  const [publishStage, setPublishStage] = useState<'compose' | 'preview'>('preview');
  const [publishHistory, setPublishHistory] = useState<PublishHistoryEntry[]>([]);
  const [publishDrawerOpen, setPublishDrawerOpen] = useState(false);
  const [drawerStep, setDrawerStep] = useState(1);
  const totalDrawerSteps = 4;
  // savingDraft removed - using 'saving' state instead
  const [currentDraftId, setCurrentDraftId] = useState<number | null>(initialDraftId || null);
  const [currentDraftStatus, setCurrentDraftStatus] = useState<string | null>(null);
  /**
   * Specific to the WordPress publish action so its loading state can be
   * distinguished from `publishLoading` (which is also true during content
   * generation, regenerate, edits, etc.). Set in handlePublishToWordpress;
   * cleared by applyTerminalPublishState on the resulting SSE event.
   */
  const [isPublishing, setIsPublishing] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [textEditNote, setTextEditNote] = useState('');
  const [textEditing, setTextEditing] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string>('');
  const [selectedImageAlt, setSelectedImageAlt] = useState('');
  const [imageEditNote, setImageEditNote] = useState('');
  const [imageEditing, setImageEditing] = useState(false);
  const [selectedRange, setSelectedRange] = useState<Range | null>(null);
  const [publishError, setPublishError] = useState('');
  const [publishKeywordQuery, setPublishKeywordQuery] = useState('');
  const [primaryKeywordInput, setPrimaryKeywordInput] = useState('');
  const [selectedLongtailKeywords, setSelectedLongtailKeywords] = useState<string[]>([]);
  const [longtailInput, setLongtailInput] = useState('');
  const [sortConfig, setSortConfig] = useState<{
    key: keyof KeywordTableItem;
    direction: 'asc' | 'desc';
  } | null>(null);
  const textEditTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const imageEditTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const textTooltipInstanceRef = useRef<Instance | null>(null);
  const imageTooltipInstanceRef = useRef<Instance | null>(null);
  const textSelectionIntervalRef = useRef<number | null>(null);
  const tooltipAnchorRef = useRef<HTMLSpanElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const addImageInputRef = useRef<HTMLInputElement | null>(null);
  
  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedHtmlContent, setEditedHtmlContent] = useState('');
  const [newImageUrl, setNewImageUrl] = useState('');
  const [newImageAlt, setNewImageAlt] = useState('');
  const [featuredImageInput, setFeaturedImageInput] = useState('');
  const [featuredImageEditNote, setFeaturedImageEditNote] = useState('');
  const [featuredImageEditing, setFeaturedImageEditing] = useState(false);
  const [showAddImageModal, setShowAddImageModal] = useState(false);
  const [originalHtmlContent, setOriginalHtmlContent] = useState('');
  const quillRef = useRef<ReactQuill>(null);
   const [previewPageId, setPreviewPageId] = useState<number | null>(null);
    const [previewDraft, setPreviewDraft] = useState<DraftPreview | null>(null);
    
  // Track if content has unsaved changes (dirty state)
  const [isDirty, setIsDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [originalDraftSnapshot, setOriginalDraftSnapshot] = useState<DraftSnapshot>(() =>
    createDraftSnapshot(initialDraft ?? null, initialDraft?.htmlContent ?? '')
  );

  // Publish history list lives only on the (now-removed) Publish tab. Embedded
  // overlay never renders the history; keep the symbol as a no-op so legacy
  // call sites in save/publish handlers stay valid until they are pruned.
  const fetchPublishHistory = useCallback(async () => {}, []);

  const applyTerminalPublishState = useCallback((params: {
    status: 'published' | 'failed';
    draftId?: number | null;
    publishedUrl?: string | null;
    wordpressPostId?: number | null;
    error?: string | null;
    notify?: boolean;
  }) => {
    const { status, draftId, publishedUrl, wordpressPostId, error, notify = false } = params;

    setPublishLoading(false);
    setIsPublishing(false);

    if (status === 'published') {
      setPublishError('');
      setCurrentDraftStatus('published');
      if (publishedUrl || wordpressPostId !== undefined) {
        setPublishResult((prev) =>
          prev
            ? {
                ...prev,
                wordpressUrl: publishedUrl || prev.wordpressUrl,
                wordpressPostId:
                  wordpressPostId !== undefined ? wordpressPostId : prev.wordpressPostId,
              }
            : null
        );
      }
      if (pageId && setPublishingPageIds) {
        setPublishingPageIds((prev) => {
          const updated = new Set(prev);
          updated.delete(pageId);
          return updated;
        });
      }
      if (pageId && setDraftStatuses) {
        setDraftStatuses((prev) => {
          const updated = new Map(prev);
          const existing = updated.get(pageId);
          updated.set(pageId, {
            ...(existing || {}),
            isPublished: true,
            isFailed: false,
            publishedUrl: publishedUrl || undefined,
            draftId: draftId || existing?.draftId,
            error: undefined,
          });
          return updated;
        });
      }
      if (draftId && setDraftToPageMap) {
        setDraftToPageMap((prev) => {
          const updated = new Map(prev);
          updated.delete(Number(draftId));
          return updated;
        });
      }
      onRefreshWordpressIntegration();
      if (!initialDraft) {
        fetchPublishHistory();
      }
      if (notify && publishedUrl) {
        toast({
          title: 'Published Successfully',
          description: `Your content is live! View it here: ${publishedUrl}`,
        });
      }
      return;
    }

    setCurrentDraftStatus('failed');
    setPublishError(error || 'Publish failed');
    if (pageId && setPublishingPageIds) {
      setPublishingPageIds((prev) => {
        const updated = new Set(prev);
        updated.delete(pageId);
        return updated;
      });
    }
    if (pageId && setDraftStatuses) {
      setDraftStatuses((prev) => {
        const updated = new Map(prev);
        const existing = updated.get(pageId);
        updated.set(pageId, {
          ...(existing || {}),
          isPublished: false,
          isFailed: true,
          publishedUrl: undefined,
          draftId: draftId || existing?.draftId,
          error: error || existing?.error,
        });
        return updated;
      });
    }
    if (draftId && setDraftToPageMap) {
      setDraftToPageMap((prev) => {
        const updated = new Map(prev);
        updated.delete(Number(draftId));
        return updated;
      });
    }
    if (!initialDraft) {
      fetchPublishHistory();
    }
    if (notify) {
      toast({
        title: 'Publish Failed',
        description: error || 'The publish job failed.',
        variant: 'destructive',
      });
    }
  }, [
    fetchPublishHistory,
    initialDraft,
    onRefreshWordpressIntegration,
    pageId,
    setDraftStatuses,
    setDraftToPageMap,
    setPublishingPageIds,
    toast,
  ]);

  useEffect(() => {
    if (!currentDraftId || !sharedPublishStatuses) return;
    const update = sharedPublishStatuses.get(Number(currentDraftId));
    if (!update) return;

    if (update.status === 'published') {
      applyTerminalPublishState({
        status: 'published',
        draftId: currentDraftId,
        publishedUrl: update.publishedUrl,
        wordpressPostId: update.wordpressPostId,
      });
      return;
    }

    if (update.status === 'failed') {
      applyTerminalPublishState({
        status: 'failed',
        draftId: currentDraftId,
        error: update.error,
      });
    }
  }, [applyTerminalPublishState, currentDraftId, sharedPublishStatuses]);

  // Polling fallback to ensure we don't get stuck in loading state if SSE fails
  useEffect(() => {
    if (!publishLoading || !currentDraftId) return;

    const pollInterval = setInterval(async () => {
      try {
        // Prefer publish endpoint (status-capable), then fallback to campaign endpoint
        let response = await fetch(`${API_BASE_URL}/api/publish/drafts/${currentDraftId}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
        });

        if (!response.ok) {
           response = await fetch(`${API_BASE_URL}/api/campaigns/drafts/${currentDraftId}`, {
             headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
           });
        }

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.draft) {
             const status = data.draft.status;
             
             // If terminal state reached, update UI
             if (status === 'published') {
                applyTerminalPublishState({
                  status: 'published',
                  draftId: currentDraftId,
                  publishedUrl: data.draft.wordpressUrl,
                  notify: true,
                });
             } else if (status === 'failed') {
                applyTerminalPublishState({
                  status: 'failed',
                  draftId: currentDraftId,
                  error: data.draft.error || 'The publish job failed.',
                  notify: true,
                });
             }
          }
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 15000); // 15 seconds

    return () => clearInterval(pollInterval);
  }, [applyTerminalPublishState, publishLoading, currentDraftId]);

  const showPreviewStage = publishStage === 'preview';

  // SINGLE SOURCE OF TRUTH for HTML content in preview
  // Always prioritize editedHtmlContent - if it's empty, use publishResult (but never reset editedHtmlContent automatically)
  const currentHtmlContent = useMemo(() => {
    // If editedHtmlContent has content, use it (even if it's different from publishResult)
    // This ensures regenerated content persists
    if (editedHtmlContent && editedHtmlContent.trim().length > 0) {
      return editedHtmlContent;
    }
    // Only use publishResult if editedHtmlContent is truly empty (initial state)
    return publishResult?.htmlContent || '';
  }, [editedHtmlContent, publishResult?.htmlContent]);

  const wordCount = useMemo(() => {
    return calculateWordCount(currentHtmlContent);
  }, [currentHtmlContent]);

  const hasUnsavedChanges = useMemo(() => {
    if (!publishResult) return false;
    return (
      currentHtmlContent !== originalDraftSnapshot.htmlContent ||
      (publishResult.title ?? '') !== originalDraftSnapshot.title ||
      (publishResult.metaDescription ?? '') !== originalDraftSnapshot.metaDescription ||
      (publishResult.slug ?? '') !== originalDraftSnapshot.slug ||
      (publishResult.longtailKeywords ?? '') !== originalDraftSnapshot.longtailKeywords ||
      Boolean(publishResult.featuredImageEnabled) !== originalDraftSnapshot.featuredImageEnabled ||
      (publishResult.featuredImageUrl ?? '') !== originalDraftSnapshot.featuredImageUrl ||
      (publishResult.primaryKeyword ?? '') !== originalDraftSnapshot.primaryKeyword
    );
  }, [currentHtmlContent, originalDraftSnapshot, publishResult]);
  
  // Sync dirty state
  useEffect(() => {
    setIsDirty(hasUnsavedChanges);
  }, [hasUnsavedChanges]);

  const secondaryKeywords = useMemo(() => {
    const longtails = publishForm.longtailKeywords || publishResult?.longtailKeywords;
    if (!longtails) return [];
    return longtails
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
  }, [publishResult?.longtailKeywords, publishForm.longtailKeywords]);

  const publishImages = useMemo(() => {
    if (typeof window === 'undefined' || !currentHtmlContent) {
      return [];
    }

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(currentHtmlContent, 'text/html');
      return Array.from(doc.querySelectorAll('img'))
        .map((img, index) => ({
          src: img.getAttribute('src') || '',
          alt: img.getAttribute('alt') || `Generated image ${index + 1}`,
        }))
        .filter((img) => Boolean(img.src));
    } catch (error) {
      console.error('Failed to parse images from generated HTML:', error);
      return [];
    }
  }, [currentHtmlContent]);

  const selectedImageDetails = useMemo(
    () => publishImages.find((image) => image.src === selectedImage) ?? null,
    [publishImages, selectedImage]
  );

  useEffect(() => {
    setFeaturedImageInput(publishResult?.featuredImageUrl ?? '');
  }, [publishResult?.featuredImageUrl]);

  const filteredPublishKeywords = useMemo(() => {
    // Defensive: keywordsTableData is an optional prop. Not every caller
    // (e.g. an embedded preview overlay) wires it through. Always return
    // an array so downstream useMemo spreads stay safe.
    const source = Array.isArray(keywordsTableData) ? keywordsTableData : [];
    if (!publishKeywordQuery) {
      return source;
    }
    return source.filter((keyword) =>
      keyword.keyword.toLowerCase().includes(publishKeywordQuery.toLowerCase())
    );
  }, [keywordsTableData, publishKeywordQuery]);

  const derivedBrandName = useMemo(() => {
    if (!companyDomain) return '';
    return companyDomain.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0];
  }, [companyDomain]);

  const derivedBrandDescription = useMemo(
    () => summarizeDomainContext(domainContext || ''),
    [domainContext]
  );

  const drawerSteps = [
    { id: 1, title: 'Word Count', description: 'Shape the depth' },
    { id: 2, title: 'Imagery', description: 'Images & banner' },
    { id: 3, title: 'Primary Keyword', description: 'Pick the hero query' },
    { id: 4, title: 'Long-tail Notes', description: 'Supportive angles' },
  ];

 
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleAutoHide = () => {
      textTooltipInstanceRef.current?.hide();
      imageTooltipInstanceRef.current?.hide();
      if (tooltipAnchorRef.current) {
        tooltipAnchorRef.current.style.display = 'none';
      }
    };
    window.addEventListener('scroll', handleAutoHide, true);
    window.addEventListener('resize', handleAutoHide);
    return () => {
      window.removeEventListener('scroll', handleAutoHide, true);
      window.removeEventListener('resize', handleAutoHide);
    };
  }, []);

  // Fetch draft from DB - SINGLE SOURCE OF TRUTH
  const fetchDraftFromDb = useCallback(async (draftId: number) => {
    try {
      // Try campaign endpoint first (for campaign drafts)
      let response = await fetch(`${API_BASE_URL}/api/campaigns/drafts/${draftId}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json',
        },
      });
      
      // If that fails, try publish drafts endpoint
      if (!response.ok) {
        response = await fetch(`${API_BASE_URL}/api/publish/drafts/${draftId}`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('authToken')}`,
            'Content-Type': 'application/json',
          },
        });
      }
      
      if (!response.ok) {
        throw new Error('Failed to fetch draft');
      }
      
      const data = await response.json();
      if (!data.success || !data.draft) {
        throw new Error('Invalid draft data');
      }
      
      const draft = data.draft;
      const draftContent: GeneratedArticleContent = {
        primaryKeyword: draft.primaryKeyword || '',
        htmlContent: draft.htmlContent || '',
        featuredImageEnabled: Boolean(draft.featuredImageEnabled),
        featuredImageUrl: draft.featuredImageUrl || null,
        wordpressPostId: draft.wordpressPostId ?? null,
        title: draft.title,
        metaDescription: draft.metaDescription,
        slug: draft.slug,
        longtailKeywords: draft.longtailKeywords || '',
        wordpressUrl: draft.wordpressUrl,
      };
      
      // Set as source of truth
      setPublishResult(draftContent);
      setEditedHtmlContent(draftContent.htmlContent || '');
      setOriginalHtmlContent(draftContent.htmlContent || ''); // This is what we'll compare against for dirty state
      setOriginalDraftSnapshot(createDraftSnapshot(draftContent, draftContent.htmlContent || ''));
      setCurrentDraftId(draftId);
      setCurrentDraftStatus(draft.status || 'draft');
      setPublishStage('preview');
      setIsEditMode(false);
      setIsDirty(false);
      setLastSavedAt(new Date());
      
      // Update form
      setPublishForm((prev) => ({
        ...prev,
        primaryKeyword: draftContent.primaryKeyword || prev.primaryKeyword,
        longtailKeywords: draftContent.longtailKeywords || prev.longtailKeywords,
        featuredImageEnabled: draftContent.featuredImageEnabled,
      }));
      setSelectedLongtailKeywords(
        (draftContent.longtailKeywords || '')
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean)
      );
      
      return draftContent;
    } catch (error) {
      console.error('Error fetching draft from DB:', error);
      toast({
        title: 'Failed to Load Draft',
        description: error instanceof Error ? error.message : 'Could not load draft from database',
        variant: 'destructive',
      });
      return null;
    }
  }, [toast]);

  // Track if we've already initialized to prevent resets
  const hasInitializedRef = useRef(false);
  const lastInitialDraftIdRef = useRef<number | null | undefined>(null);

  // Seed publishResult when an initial draft is provided OR fetch from DB if draftId provided
  // ONLY runs once on mount or when initialDraftId actually changes (not on every render)
  useEffect(() => {
    // Only initialize if:
    // 1. We haven't initialized yet AND we have a draftId/initialDraft, OR
    // 2. The initialDraftId actually changed (not just a ref recreation)
    const shouldInitialize = 
      (!hasInitializedRef.current && (initialDraftId !== null && initialDraftId !== undefined || initialDraft)) ||
      (initialDraftId !== null && initialDraftId !== undefined && initialDraftId !== lastInitialDraftIdRef.current);
    
    if (!shouldInitialize) return;
    
    // Mark as initialized
    hasInitializedRef.current = true;
    if (initialDraftId !== null && initialDraftId !== undefined) {
      lastInitialDraftIdRef.current = initialDraftId;
      // Always fetch from DB when draftId is provided - DB is single source of truth
      fetchDraftFromDb(initialDraftId);
    } else if (initialDraft) {
      // Fallback to initialDraft if no draftId (for backward compatibility)
      setPublishResult(initialDraft);
      setPublishStage('preview');
      setPublishForm((prev) => ({
        ...prev,
        primaryKeyword: initialDraft.primaryKeyword || prev.primaryKeyword,
        longtailKeywords: initialDraft.longtailKeywords || prev.longtailKeywords,
        featuredImageEnabled: initialDraft.featuredImageEnabled,
      }));
      setSelectedLongtailKeywords(
        (initialDraft.longtailKeywords || '')
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean)
      );
      const initialHtml = initialDraft.htmlContent || '';
      setEditedHtmlContent(initialHtml);
      setOriginalHtmlContent(initialHtml);
      setOriginalDraftSnapshot(createDraftSnapshot(initialDraft, initialHtml));
      setIsEditMode(false);
      setIsDirty(false);
      // Clear edit UI state
      setSelectedText('');
      setTextEditNote('');
      setSelectedImage('');
      setImageEditNote('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDraftId]); // Only depend on initialDraftId - don't depend on fetchDraftFromDb or initialDraft object reference

  // REMOVED: This was resetting editedHtmlContent when publishResult changed
  // Now we only update editedHtmlContent explicitly in handleTextEdit, handleImageEdit, etc.

  // Cleanup removed - no auto-save timeout to clean up

  useEffect(() => {
    setPublishForm((prev) => {
      let changed = false;
      const next = { ...prev };

      if (!next.brandName && derivedBrandName) {
        next.brandName = derivedBrandName;
        changed = true;
      }

      if (!next.brandDescription && derivedBrandDescription) {
        next.brandDescription = derivedBrandDescription;
        changed = true;
      }

      return changed ? next : prev;
    });
  }, [derivedBrandName, derivedBrandDescription]);

  useEffect(() => {
    setPrimaryKeywordInput(publishForm.primaryKeyword);
  }, [publishForm.primaryKeyword]);

  useEffect(() => {
    const joined = selectedLongtailKeywords.join(', ');
    setPublishForm((prev) =>
      prev.longtailKeywords === joined ? prev : { ...prev, longtailKeywords: joined }
    );
  }, [selectedLongtailKeywords]);

  const extractEditedText = useCallback((result: unknown): string => {
    if (!result) return '';
    if (typeof result === 'string') {
      return result;
    }
    if (Array.isArray(result)) {
      for (const entry of result) {
        const text = extractEditedText(entry);
        if (text) return text;
      }
      return '';
    }
    if (typeof result === 'object') {
      const record = result as Record<string, unknown>;
      if (typeof record.finalEditedContent === 'string') return record.finalEditedContent;
      if (typeof record['Final Edited Content'] === 'string') return record['Final Edited Content'] as string;
      if (typeof record.content === 'string') return record.content;
      if (typeof record.text === 'string') return record.text;
      if (typeof record.output === 'string') return record.output;
      if (typeof record['Content'] === 'string') return record['Content'];
      if (record.body) return extractEditedText(record.body);
    }
    return '';
  }, []);

  const extractEditedImage = useCallback((result: unknown): string => {
    if (!result) return '';
    if (typeof result === 'string') {
      return result;
    }
    if (Array.isArray(result)) {
      for (const entry of result) {
        const image = extractEditedImage(entry);
        if (image) return image;
      }
      return '';
    }
    if (typeof result === 'object') {
      const record = result as Record<string, unknown>;
      if (typeof record.newImage === 'string') return record.newImage;
      if (typeof record['New Image'] === 'string') return record['New Image'] as string;
      if (typeof record.image === 'string') return record.image;
      if (typeof record.url === 'string') return record.url;
      if (typeof record['Image'] === 'string') return record['Image'];
      if (record.body) return extractEditedImage(record.body);
    }
    return '';
  }, []);

  const handleOpenComposeDrawer = useCallback(() => {
    setPublishStage('compose');
    setDrawerStep(1);
  }, []);

  const handleDrawerNext = () => {
    if (drawerStep === 3 && !publishForm.primaryKeyword.trim()) {
      toast({
        title: 'Primary keyword required',
        description: 'Select or enter a primary keyword before continuing.',
        variant: 'destructive',
      });
      return;
    }
    setDrawerStep((prev) => Math.min(totalDrawerSteps, prev + 1));
  };

  const handleDrawerBack = () => {
    setDrawerStep((prev) => Math.max(1, prev - 1));
  };

  const handlePrimaryKeywordSelect = (keyword: string) => {
    setPublishForm((prev) => ({ ...prev, primaryKeyword: keyword }));
  };

  const handlePrimaryInputChange = (value: string) => {
    setPrimaryKeywordInput(value);
    setPublishForm((prev) => ({ ...prev, primaryKeyword: value }));
  };

  const toggleLongtailKeyword = (keyword: string) => {
    setSelectedLongtailKeywords((prev) =>
      prev.includes(keyword) ? prev.filter((item) => item !== keyword) : [...prev, keyword]
    );
  };

  const handleAddLongtailInput = () => {
    const value = longtailInput.trim();
    if (!value) return;
    setSelectedLongtailKeywords((prev) => (prev.includes(value) ? prev : [...prev, value]));
    setLongtailInput('');
  };

  const handleRemoveLongtailKeyword = (keyword: string) => {
    setSelectedLongtailKeywords((prev) => prev.filter((item) => item !== keyword));
  };

  const handleSort = useCallback((key: keyof KeywordTableItem) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  }, [sortConfig]);

  const sortedKeywords = useMemo(() => {
    const sortableKeywords = [...filteredPublishKeywords];
    if (sortConfig !== null) {
      sortableKeywords.sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];
        
        if (typeof aValue === 'number' && typeof bValue === 'number') {
          return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
        }
        
        const aStr = String(aValue).toLowerCase();
        const bStr = String(bValue).toLowerCase();
        
        if (aStr < bStr) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aStr > bStr) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableKeywords;
  }, [filteredPublishKeywords, sortConfig]);

  const getSortIcon = useCallback((key: keyof KeywordTableItem) => {
    if (!sortConfig || sortConfig.key !== key) {
      return <ArrowUpDown className="w-3 h-3 text-gray-400" />;
    }
    return sortConfig.direction === 'asc' ? 
      <ChevronUp className="w-3 h-3 text-gray-600" /> : 
      <ChevronDown className="w-3 h-3 text-gray-600" />;
  }, [sortConfig]);

  const getCompetitionBadge = useCallback((competition: string) => {
    const baseClasses = "px-2.5 py-1 rounded-full text-xs font-semibold";
    switch (competition) {
      case 'High':
        return `${baseClasses} bg-red-100 text-red-800`;
      case 'Medium':
        return `${baseClasses} bg-yellow-100 text-yellow-800`;
      case 'Low':
        return `${baseClasses} bg-green-100 text-green-800`;
      default:
        return `${baseClasses} bg-gray-100 text-gray-800`;
    }
  }, []);

  const handleExitPreview = useCallback(() => {
    setPublishStage('compose');
  }, []);

  const updatePublishMetadata = useCallback(
    (field: 'title' | 'metaDescription' | 'slug', value: string) => {
      setPublishResult((prev) => (prev ? { ...prev, [field]: value } : prev));
    },
    []
  );

  const syncSlugFromTitle = useCallback(() => {
    setPublishResult((prev) => {
      if (!prev) return prev;
      return { ...prev, slug: slugifyText(prev.title || prev.primaryKeyword || '') };
    });
  }, []);

  const applyFeaturedImageState = useCallback((url: string | null, enabled: boolean) => {
    const normalizedUrl = url?.trim() ? url.trim() : null;
    setFeaturedImageInput(normalizedUrl ?? '');
    setPublishResult((prev) =>
      prev
        ? {
            ...prev,
            featuredImageEnabled: enabled,
            featuredImageUrl: normalizedUrl,
          }
        : prev
    );
  }, []);

  const handleApplyFeaturedImageUrl = useCallback(() => {
    if (!publishResult) return;

    const trimmedUrl = featuredImageInput.trim();
    if (!trimmedUrl) {
      toast({
        title: 'Thumbnail URL Required',
        description: 'Paste an image URL to update the featured image.',
        variant: 'destructive',
      });
      return;
    }

    if (!isValidHttpUrl(trimmedUrl)) {
      toast({
        title: 'Invalid URL',
        description: 'Use a full http or https image URL.',
        variant: 'destructive',
      });
      return;
    }

    applyFeaturedImageState(trimmedUrl, true);
    toast({
      title: 'Thumbnail Updated',
      description: 'Save draft or publish to persist the featured image change.',
    });
  }, [applyFeaturedImageState, featuredImageInput, publishResult, toast]);

  const handleUseInlineImageAsFeatured = useCallback(
    (imageSrc: string) => {
      if (!publishResult) return;

      applyFeaturedImageState(imageSrc, true);
      toast({
        title: 'Thumbnail Selected',
        description: 'The inline image is now set as the featured thumbnail.',
      });
    },
    [applyFeaturedImageState, publishResult, toast]
  );

  const handleEnableAutoFeaturedImage = useCallback(() => {
    if (!publishResult) return;

    applyFeaturedImageState(null, true);
    setFeaturedImageEditNote('');
    toast({
      title: 'Automatic Thumbnail Enabled',
      description: 'WordPress publishing will use an automatic featured image again.',
    });
  }, [applyFeaturedImageState, publishResult, toast]);

  const handleDisableFeaturedImage = useCallback(() => {
    if (!publishResult) return;

    applyFeaturedImageState(null, false);
    setFeaturedImageEditNote('');
    toast({
      title: 'Thumbnail Disabled',
      description: 'The post will publish without a featured image.',
    });
  }, [applyFeaturedImageState, publishResult, toast]);

  const handleFeaturedImageEdit = useCallback(async () => {
    if (!publishResult || !publishResult.featuredImageUrl || !featuredImageEditNote.trim()) {
      toast({
        title: 'Thumbnail Note Required',
        description: 'Add a note describing how the thumbnail should change.',
        variant: 'destructive',
      });
      return;
    }

    setFeaturedImageEditing(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/publish/edit-image`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: publishResult.title,
          metaDescription: publishResult.metaDescription,
          image: publishResult.featuredImageUrl,
          userNote: featuredImageEditNote,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to edit thumbnail');
      }

      const updatedImage = extractEditedImage(data.result);
      if (!updatedImage) {
        throw new Error('Automation service did not return an updated thumbnail');
      }

      applyFeaturedImageState(updatedImage, true);
      setFeaturedImageEditNote('');
      toast({
        title: 'Thumbnail Regenerated',
        description: 'Review the new featured image, then save draft or publish.',
      });
    } catch (error) {
      console.error('Error editing featured image:', error);
      toast({
        title: 'Thumbnail Edit Failed',
        description: error instanceof Error ? error.message : 'Unable to update the thumbnail',
        variant: 'destructive',
      });
    } finally {
      setFeaturedImageEditing(false);
    }
  }, [applyFeaturedImageState, extractEditedImage, featuredImageEditNote, publishResult, toast]);

  /**
   * Publish button state machine.
   *
   * Single source of truth for what the Publish button should render.
   * Distinguishes between background-queued publishes (n8n still running
   * server-side, page can be navigated away from) and the in-flight
   * client-side request that fires it. Cleared on terminal SSE updates
   * via applyTerminalPublishState.
   */
  type PublishButtonState =
    | 'hidden'
    | 'idle-fresh'
    | 'idle-republish'
    | 'publishing'
    | 'queued'
    | 'failed';

  const computePublishButtonState = (): PublishButtonState => {
    if (!publishResult) return 'hidden';
    if (currentDraftStatus === 'generating' && isPublishing) return 'queued';
    if (isPublishing) return 'publishing';
    if (currentDraftStatus === 'failed') return 'failed';
    if (publishResult.wordpressUrl?.startsWith('http')) return 'idle-republish';
    return 'idle-fresh';
  };

  const renderPublishButton = (variant: 'compact' | 'full' = 'compact') => {
    const state = computePublishButtonState();
    if (state === 'hidden') return null;

    const baseCompact =
      'px-4 py-2.5 rounded-md text-white text-sm font-medium shadow-lg transition-colors flex items-center gap-2';
    const baseFull =
      'px-6 py-2.5 rounded-full text-white text-sm font-medium shadow-lg transition-all flex items-center gap-2';
    const base = variant === 'full' ? baseFull : baseCompact;

    type ButtonConfig = {
      label: string;
      icon: React.ReactNode;
      tone: string;
      disabled: boolean;
      title?: string;
    };

    const configByState: Record<Exclude<PublishButtonState, 'hidden'>, ButtonConfig> = {
      'idle-fresh': {
        label: 'Publish',
        icon: <Send className="h-4 w-4" />,
        tone:
          variant === 'full'
            ? 'bg-black hover:bg-gray-800'
            : 'bg-[#2D4059] hover:bg-[#2D4059]/90',
        disabled: false,
      },
      'idle-republish': {
        label: 'Re-publish',
        icon: <Send className="h-4 w-4" />,
        tone:
          variant === 'full'
            ? 'bg-black hover:bg-gray-800'
            : 'bg-[#2D4059] hover:bg-[#2D4059]/90',
        disabled: false,
        title: 'Republish to WordPress (overwrites the live post)',
      },
      publishing: {
        label: 'Publishing…',
        icon: <ButtonSpinner />,
        tone:
          variant === 'full'
            ? 'bg-black hover:bg-gray-800'
            : 'bg-[#2D4059] hover:bg-[#2D4059]/90',
        disabled: true,
      },
      queued: {
        label: 'Publishing in background…',
        icon: <ButtonSpinner />,
        tone: 'bg-[#5f6dab] hover:bg-[#5f6dab]',
        disabled: true,
        title: 'WordPress is processing this publish in the background',
      },
      failed: {
        label: 'Retry publish',
        icon: <Send className="h-4 w-4" />,
        tone: 'bg-red-600 hover:bg-red-700',
        disabled: false,
        title: 'The last publish failed. Click to try again.',
      },
    };

    const cfg = configByState[state];

    // When the draft is already live, "Re-publish" is more accurate than
    // "Publish" — and we want a slightly stronger CTA to match the design.
    const label = state === 'idle-republish' ? 'Re-publish to WordPress' : cfg.label;

    return (
      <button
        type="button"
        onClick={handlePublishToWordpress}
        disabled={cfg.disabled || !publishResult}
        title={cfg.title}
        className={`${base} ${cfg.tone} disabled:opacity-60 disabled:cursor-not-allowed`}
      >
        {cfg.icon}
        <span>{label}</span>
      </button>
    );
  };

  /**
   * Renders the publish-button + (when actually live) a sibling "View Live"
   * link. Used everywhere the publish action surface lives — embedded
   * preview header and publish-tab footer — so both layouts stay in sync.
   *
   * View-Live gating: the WordpressPublishLog row's `wordpressUrl` is
   * always populated (defaulting to the integration's base URL during
   * generation). It only points to the actual live post once the publish
   * completes, so we additionally require `currentDraftStatus === 'published'`
   * — the state machine's terminal — before rendering the link. This
   * prevents View Live from showing while the draft is still pre-publish.
   */
  const renderPublishActions = (variant: 'compact' | 'full' = 'compact') => {
    const button = renderPublishButton(variant);
    if (!button) return null;
    const isPublished = currentDraftStatus === 'published';
    const liveUrl =
      isPublished && publishResult?.wordpressUrl?.startsWith('http')
        ? publishResult.wordpressUrl
        : null;
    if (!liveUrl) return button;

    const liveBase =
      variant === 'full'
        ? 'inline-flex items-center gap-2 px-6 py-2.5 rounded-full border border-emerald-700 bg-emerald-700 text-white text-sm font-medium shadow-lg hover:bg-emerald-800 transition-colors'
        : 'inline-flex items-center gap-2 px-4 py-2.5 rounded-md border border-emerald-700 bg-emerald-700 text-white text-sm font-medium shadow-lg hover:bg-emerald-800 transition-colors';

    return (
      <>
        <a
          href={liveUrl}
          target="_blank"
          rel="noreferrer"
          className={liveBase}
          title="Open the live post in a new tab"
        >
          <Eye className="h-4 w-4" />
          <span>View Live</span>
        </a>
        {button}
      </>
    );
  };

  /**
   * Always-on metadata editor. Title, meta description, and slug are
   * editable in any mode (preview or content-edit). Status pill and the
   * live URL are folded in here so users see everything in one card and
   * don't need to flip into edit mode just to see/edit metadata.
   */
  const renderMetadataEditor = () => {
    if (!publishResult) return null;

    const status = publishResult.status || 'draft';
    const isPublished = status.toLowerCase() === 'published';

    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-4">
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <div>
            <p className="text-xs text-gray-500 mb-1">Draft metadata</p>
            <p className="text-sm font-medium text-gray-900">Title, description, and slug</p>
          </div>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
              isPublished
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-blue-50 text-blue-700'
            }`}
          >
            {status}
          </span>
        </div>

        {isPublished && publishResult.wordpressUrl && (
          <a
            href={publishResult.wordpressUrl}
            target="_blank"
            rel="noreferrer"
            className="block text-xs text-blue-600 hover:underline break-all"
          >
            {publishResult.wordpressUrl}
          </a>
        )}

        <button
          type="button"
          onClick={syncSlugFromTitle}
          className="w-full rounded-xl border border-[#2D4059]/20 px-3 py-1.5 text-center text-[12px] font-semibold text-[#2D4059] hover:bg-[#2D4059]/10 transition-colors"
        >
          Use title for slug
        </button>

        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-[0.2em] text-gray-500">Title</label>
          <input
            type="text"
            value={publishResult.title ?? ''}
            onChange={(event) => updatePublishMetadata('title', event.target.value)}
            placeholder="Draft title"
            className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-gray-900"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-[0.2em] text-gray-500">Meta Description</label>
          <textarea
            value={publishResult.metaDescription ?? ''}
            onChange={(event) => updatePublishMetadata('metaDescription', event.target.value)}
            placeholder="Search snippet description"
            rows={3}
            className="w-full resize-none rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-gray-900"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-[0.2em] text-gray-500">Slug</label>
          <input
            type="text"
            value={publishResult.slug ?? ''}
            onChange={(event) => updatePublishMetadata('slug', slugifyText(event.target.value))}
            placeholder="url-slug"
            className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-gray-900"
          />
        </div>
      </div>
    );
  };

  const renderFeaturedImageEditor = () => {
    if (!publishResult || !isEditMode) return null;

    const featuredImageUrl = publishResult.featuredImageUrl ?? '';
    const hasCustomThumbnail = Boolean(featuredImageUrl);
    const quickPickImages = publishImages.filter((image) => image.src !== featuredImageUrl).slice(0, 4);

    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-gray-500 mb-1">Featured image</p>
            <p className="text-sm font-medium text-gray-900">Thumbnail for WordPress and previews</p>
          </div>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${
              publishResult.featuredImageEnabled
                ? hasCustomThumbnail
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-amber-100 text-amber-700'
                : 'bg-gray-100 text-gray-500'
            }`}
          >
            {publishResult.featuredImageEnabled
              ? hasCustomThumbnail
                ? 'Custom'
                : 'Auto'
              : 'Off'}
          </span>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-gray-50">
          {hasCustomThumbnail ? (
            <img
              src={featuredImageUrl}
              alt="Featured thumbnail preview"
              className="h-40 w-full object-cover"
            />
          ) : (
            <div className="flex h-40 flex-col items-center justify-center gap-2 px-4 text-center text-sm text-gray-500">
              <ImageIcon className="h-8 w-8 text-gray-400" />
              <p>
                {publishResult.featuredImageEnabled
                  ? 'No custom thumbnail set. The publish flow will generate one automatically.'
                  : 'Featured image is currently disabled.'}
              </p>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-[0.2em] text-gray-500">
            Thumbnail URL
          </label>
          <input
            type="url"
            value={featuredImageInput}
            onChange={(event) => setFeaturedImageInput(event.target.value)}
            placeholder="https://example.com/featured-image.jpg"
            className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-gray-900"
          />
          <div className="grid grid-cols-1 gap-2">
            <button
              type="button"
              onClick={handleApplyFeaturedImageUrl}
              className="inline-flex w-full items-center justify-center rounded-xl bg-[#2D4059] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#2D4059]/90"
            >
              Apply URL
            </button>
            <button
              type="button"
              onClick={handleEnableAutoFeaturedImage}
              className="inline-flex w-full items-center justify-center rounded-xl border border-[#2D4059]/20  px-4 py-2.5 text-sm font-semibold text-[#2D4059] transition hover:bg-[#2D4059]/10"
            >
              Auto-generate
            </button>
            <button
              type="button"
              onClick={handleDisableFeaturedImage}
              className="inline-flex w-full items-center justify-center rounded-xl border border-[#2D4059]/20  px-4 py-2.5 text-sm font-semibold text-[#2D4059] transition hover:bg-[#2D4059]/10"
            >
              Disable
            </button>
          </div>
        </div>

        {quickPickImages.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-gray-500">
              Use inline image
            </p>
            <div className="grid grid-cols-2 gap-2">
              {quickPickImages.map((image) => (
                <button
                  key={`featured-image-pick-${image.src}`}
                  type="button"
                  onClick={() => handleUseInlineImageAsFeatured(image.src)}
                  className="overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 text-left transition hover:border-gray-300 hover:bg-gray-100"
                >
                  <img src={image.src} alt={image.alt} className="h-20 w-full object-cover" />
                  <div className="px-3 py-2">
                    <p className="truncate text-xs font-medium text-gray-700">{image.alt}</p>
                    <p className="mt-1 text-[11px] text-gray-500">Use as thumbnail</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {hasCustomThumbnail && (
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-[0.2em] text-gray-500">
              Regenerate thumbnail
            </label>
            <textarea
              value={featuredImageEditNote}
              onChange={(event) => setFeaturedImageEditNote(event.target.value)}
              placeholder="Describe the new look, style, framing, or mood for the thumbnail..."
              rows={3}
              className="w-full resize-none rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-gray-900"
            />
            <button
              type="button"
              onClick={handleFeaturedImageEdit}
              disabled={!featuredImageEditNote.trim() || featuredImageEditing}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#2D4059]/20 bg-[#2D4059]/5 px-4 py-2.5 text-sm font-semibold text-[#2D4059] transition hover:bg-[#2D4059]/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {featuredImageEditing ? (
                <>
                  <ButtonSpinner />
                  Regenerating
                </>
              ) : (
                'Regenerate thumbnail'
              )}
            </button>
          </div>
        )}
      </div>
    );
  };

  const savePublishedEdits = useCallback(async () => {
    if (!publishResult) {
      toast({
        title: 'Nothing to Save',
        description: 'No content to update',
        variant: 'destructive',
      });
      return false;
    }

    if (!currentDraftId) {
      toast({
        title: 'Missing Draft',
        description: 'Published edit requires a draft ID.',
        variant: 'destructive',
      });
      return false;
    }

    setSaving(true);
    try {
      const latestHtml = currentHtmlContent;
      const response = await fetch(`${API_BASE_URL}/api/publish/published-edit`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          draftId: currentDraftId,
          pageId,
          primaryKeyword: publishResult.primaryKeyword || publishForm.primaryKeyword,
          htmlContent: latestHtml,
          featuredImageEnabled: publishResult.featuredImageEnabled,
          featuredImageUrl: publishResult.featuredImageUrl,
          title: publishResult.title,
          metaDescription: publishResult.metaDescription,
          slug: publishResult.slug,
          longtailKeywords: publishResult.longtailKeywords ?? publishForm.longtailKeywords,
          wordpressUrl: publishResult.wordpressUrl,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to update published blog');
      }

      const savedResult = {
        ...publishResult,
        htmlContent: latestHtml,
        wordpressUrl: data.wordpressUrl || publishResult.wordpressUrl,
      };

      setOriginalHtmlContent(latestHtml);
      setOriginalDraftSnapshot(createDraftSnapshot(savedResult, latestHtml));
      setIsDirty(false);
      setLastSavedAt(new Date());
      setPublishResult(savedResult);
      setCurrentDraftStatus('published');

      if (!initialDraft) {
        fetchPublishHistory();
      }

      toast({
        title: 'Published Blog Updated',
        description: 'Changes were sent to WordPress automation.',
      });

      return true;
    } catch (error) {
      console.error('Error updating published blog:', error);
      toast({
        title: 'Update Failed',
        description: error instanceof Error ? error.message : 'Failed to update published blog',
        variant: 'destructive',
      });
      return false;
    } finally {
      setSaving(false);
    }
  }, [toast, publishResult, currentDraftId, currentHtmlContent, pageId, publishForm.primaryKeyword, publishForm.longtailKeywords, initialDraft, fetchPublishHistory]);

  // SIMPLE SAVE FUNCTION - Only called by Save button
  const saveDraftToDatabase = useCallback(async (silent = false) => {
    if (!publishResult) {
      if (!silent) {
        toast({
          title: 'Nothing to Save',
          description: 'No content to save',
          variant: 'destructive',
        });
      }
      return false;
    }

    setSaving(true);
    try {
      // SIMPLE: Use currentHtmlContent - this includes all edits and regenerations
      const latestHtml = currentHtmlContent;
      
      const response = await fetch(`${API_BASE_URL}/api/publish/drafts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          draftId: currentDraftId || undefined, // Updates existing draft if we have ID
          primaryKeyword: publishResult.primaryKeyword || publishForm.primaryKeyword,
          htmlContent: latestHtml, // The actual content to save
          featuredImageEnabled: publishResult.featuredImageEnabled,
          featuredImageUrl: publishResult.featuredImageUrl,
          title: publishResult.title,
          metaDescription: publishResult.metaDescription,
          slug: publishResult.slug,
          longtailKeywords: publishResult.longtailKeywords ?? publishForm.longtailKeywords,
          wordpressUrl: publishResult.wordpressUrl,
          pageId: pageId, // Pass context to backend to link draft to CampaignPage
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to save draft');
      }
      
      // Update draft ID if we got one back
      if (data.draftId) {
        setCurrentDraftId(data.draftId);
      }
      
      const savedResult = {
        ...publishResult,
        htmlContent: latestHtml,
      };

      // SIMPLE: After saving, update state to reflect what was saved
      setOriginalHtmlContent(latestHtml); // This is what we compare against for dirty state
      setOriginalDraftSnapshot(createDraftSnapshot(savedResult, latestHtml));
      setIsDirty(false);
      setLastSavedAt(new Date());
      
      // Update publishResult with saved HTML (for metadata consistency)
      setPublishResult(savedResult);
      // editedHtmlContent already has latestHtml, so preview stays correct
      
      if (!silent) {
        toast({
          title: 'Draft Saved',
          description: 'Changes saved to database.',
        });
      }
      
      // Refresh history in publish tab only
      if (!initialDraft) {
      fetchPublishHistory();
      }
      
      return true;
    } catch (error) {
      console.error('Error saving draft:', error);
      if (!silent) {
        toast({
          title: 'Save Failed',
          description: error instanceof Error ? error.message : 'Failed to save draft',
          variant: 'destructive',
        });
      }
      return false;
    } finally {
      setSaving(false);
    }
  }, [toast, fetchPublishHistory, currentDraftId, publishForm, publishResult, currentHtmlContent, initialDraft, pageId]);

  // Keep publishResult in sync with updated long-tail selections (for preview only)
  // User must click Save to persist to DB
  useEffect(() => {
    if (!publishResult) return;
    const joined = selectedLongtailKeywords.join(', ');
    if (joined && joined !== publishResult.longtailKeywords) {
      const updated = { ...publishResult, longtailKeywords: joined };
      setPublishResult(updated);
      // Don't auto-save - user clicks Save button
    }
  }, [selectedLongtailKeywords, publishResult]);

  // SIMPLE: Save button handler
  const handleSaveDraft = useCallback(async () => {
    if (currentDraftStatus === 'published') {
      await savePublishedEdits();
      return;
    }

    await saveDraftToDatabase(false);
  }, [currentDraftStatus, savePublishedEdits, saveDraftToDatabase]);

  const handleResumeDraft = useCallback(
    (entry: PublishHistoryEntry) => {
      const payload = (entry.response ?? {}) as Record<string, unknown>;
      const htmlContent =
        typeof payload.htmlContent === 'string'
          ? payload.htmlContent
          : typeof payload['Html Content'] === 'string'
          ? (payload['Html Content'] as string)
          : '';

      if (!htmlContent) {
        toast({
          title: 'Draft Content Missing',
          description: 'This draft does not contain any saved content.',
          variant: 'destructive',
        });
        return;
      }

      const nextResult: GeneratedArticleContent = {
        primaryKeyword:
          (payload.primaryKeyword as string) ??
          (entry.primaryKeyword ?? publishForm.primaryKeyword),
        htmlContent,
        featuredImageEnabled:
          Boolean(payload.featuredImageEnabled ?? payload['Featured Image Enabled']) ||
          Boolean(payload.featuredImageUrl ?? payload.featuredImage ?? payload['Featured Image']) ||
          publishResult?.featuredImageEnabled ||
          false,
        featuredImageUrl:
          (payload.featuredImageUrl as string) ??
          (payload.featuredImage as string) ??
          (payload['Featured Image'] as string | undefined) ??
          publishResult?.featuredImageUrl,
        title:
          (payload.title as string) ??
          (payload['Title'] as string | undefined) ??
          entry.title ??
          'Draft article',
        metaDescription:
          (payload.metaDescription as string) ??
          (payload['Meta Description'] as string | undefined) ??
          publishResult?.metaDescription,
        wordpressPostId:
          typeof payload.wordpressPostId === 'number'
            ? payload.wordpressPostId
            : typeof payload.id === 'number'
            ? payload.id
            : entry.wordpressPostId ?? publishResult?.wordpressPostId ?? null,
        slug: (payload.slug as string) ?? (entry.slug ?? publishResult?.slug),
        wordpressUrl:
          (payload.wordpressUrl as string) ?? entry.wordpressUrl ?? publishResult?.wordpressUrl,
        longtailKeywords: (payload.longtailKeywords as string) ?? publishResult?.longtailKeywords,
      };

      const payloadLongtail =
        (payload.longtailKeywords as string) ?? publishResult?.longtailKeywords ?? '';
      const normalizedLongtail = payloadLongtail
        ? payloadLongtail
            .split(',')
            .map((k) => k.trim())
            .filter(Boolean)
        : [];

      // Initialize all state from the draft
      setPublishResult(nextResult);
      setCurrentDraftId(entry.id);
      setCurrentDraftStatus(entry.status ?? 'draft');
      const initialHtml = nextResult.htmlContent || '';
      setEditedHtmlContent(initialHtml);
      setOriginalHtmlContent(initialHtml);
      setOriginalDraftSnapshot(createDraftSnapshot(nextResult, initialHtml));
      setPublishForm((prev) => ({
        ...prev,
        primaryKeyword: nextResult.primaryKeyword || prev.primaryKeyword,
        longtailKeywords: payloadLongtail || prev.longtailKeywords,
        featuredImageEnabled: nextResult.featuredImageEnabled,
      }));
      setSelectedLongtailKeywords(normalizedLongtail);
      setPublishStage('preview');
      setIsEditMode(false);
      setIsDirty(false);
      setPublishDrawerOpen(false);
      setSelectedText('');
      setSelectedRange(null);
      setSelectedImage('');
      setTextEditNote('');
      setImageEditNote('');
      toast({
        title: 'Draft Loaded',
        description: `${nextResult.title || 'Draft'} is ready for review.`,
      });
    },
    [toast, publishForm.primaryKeyword, publishResult]
  );

  const handleGenerateContent = async () => {
    if (!publishForm.primaryKeyword.trim()) {
      toast({
        title: 'Keyword Required',
        description: 'Select or enter a primary keyword to generate content',
        variant: 'destructive',
      });
      return;
    }

    if (!hasWordpressIntegration) {
      toast({
        title: 'Connect WordPress',
        description: 'Add your WordPress credentials in the Integration tab to continue',
        variant: 'destructive',
      });
      return;
    }

    // Close drawer immediately
    setPublishDrawerOpen(false);
    
    // Immediately switch to preview stage with loading state
    setPublishStage('preview');
    setPublishLoading(true);
    setPublishError('');
    
    let generatingDraftId: number | null = null;
    
    // Create a "generating" draft entry in DB
    try {
      const draftResponse = await fetch(`${import.meta.env.VITE_API_URL}/api/publish/generating`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          primaryKeyword: publishForm.primaryKeyword.trim(),
          title: `${publishForm.primaryKeyword.trim()} - Generating...`,
          wordCount: publishForm.wordCount,
          images: publishForm.images,
        }),
      });
      
      const draftData = await draftResponse.json();
      if (draftData.success && draftData.draftId) {
        generatingDraftId = draftData.draftId;
        // Refresh history to show generating status
        fetchPublishHistory();
      }
    } catch (error) {
      console.error('Failed to create generating draft:', error);
      // Continue with generation even if draft creation fails
    }
    
    const payload = {
      primaryKeyword: publishForm.primaryKeyword.trim(),
      longtailKeywords: publishForm.longtailKeywords,
      brandName: publishForm.brandName || companyDomain || 'Brand',
      brandDescription: publishForm.brandDescription,
      images: publishForm.images,
      wordCount: publishForm.wordCount,
      featuredImageEnabled: publishForm.featuredImageEnabled,
    };

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/publish/generate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to generate content');
      }

      const normalized: GeneratedArticleContent = {
        primaryKeyword: data.content?.primaryKeyword || publishForm.primaryKeyword,
        htmlContent: data.content?.htmlContent || '',
        featuredImageEnabled: Boolean(data.content?.featuredImageEnabled),
        featuredImageUrl: data.content?.featuredImageUrl || null,
        title: data.content?.title,
        metaDescription: data.content?.metaDescription,
        slug: data.content?.slug,
        wordpressUrl: data.content?.wordpressUrl,
        longtailKeywords: data.content?.longtailKeywords || publishForm.longtailKeywords,
      };

      if (!normalized.htmlContent) {
        throw new Error('Automation service did not return HTML content');
      }

      // Initialize all state from generated content
      setPublishResult(normalized);
      const initialHtml = normalized.htmlContent || '';
      setEditedHtmlContent(initialHtml);
      setOriginalHtmlContent(initialHtml);
      setOriginalDraftSnapshot(createDraftSnapshot(normalized, initialHtml));
      setPublishStage('preview');
      setIsEditMode(false);
      setIsDirty(false);
      // Close drawer when generation completes successfully
      setPublishDrawerOpen(false);
      // Clear edit UI state
      setSelectedText('');
      setSelectedImage('');
      setTextEditNote('');
      setImageEditNote('');
      
      // Update the generating draft to completed draft
      if (generatingDraftId) {
        try {
          await fetch(`${import.meta.env.VITE_API_URL}/api/publish/generating/${generatingDraftId}`, {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${localStorage.getItem('authToken')}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              htmlContent: normalized.htmlContent,
              title: normalized.title,
              metaDescription: normalized.metaDescription,
              slug: normalized.slug,
              featuredImageEnabled: normalized.featuredImageEnabled,
              featuredImageUrl: normalized.featuredImageUrl,
              longtailKeywords: normalized.longtailKeywords,
              wordpressUrl: normalized.wordpressUrl,
            }),
          });
          // Set the current draft ID so future edits update this draft
          setCurrentDraftId(generatingDraftId);
          // Refresh history to show updated draft
          fetchPublishHistory();
        } catch (error) {
          console.error('Failed to update generating draft:', error);
        }
      }
      
      toast({
        title: 'Draft Ready',
        description: 'Content generated successfully',
      });
    } catch (error) {
      console.error('Error generating publish content:', error);
      setPublishError(error instanceof Error ? error.message : 'Generation failed');
      
      // Delete the generating draft on failure
      if (generatingDraftId) {
        try {
          await fetch(`${import.meta.env.VITE_API_URL}/api/publish/generating/${generatingDraftId}`, {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${localStorage.getItem('authToken')}`,
            },
          });
          // Refresh history to remove failed generating entry
          fetchPublishHistory();
        } catch (deleteError) {
          console.error('Failed to delete generating draft:', deleteError);
        }
      }
      
      toast({
        title: 'Generation Failed',
        description: error instanceof Error ? error.message : 'Unable to generate content',
        variant: 'destructive',
      });
      if (!publishResult) {
        setPublishStage('compose');
      }
    } finally {
      setPublishLoading(false);
    }
  };

  const highlightEditedText = useCallback((quill: { root: HTMLElement; getText: () => string }) => {
    if (!quill || !originalHtmlContent) return;
    
    try {
      const editorElement = quill.root;
      if (!editorElement) return;
      
      // Get plain text from both versions
      const currentText = quill.getText();
      const originalText = new DOMParser().parseFromString(originalHtmlContent, 'text/html').body.textContent || '';
      
      // Simple approach: if content changed, add a visual indicator
      // We'll add a class to the editor container to show it's been edited
      if (currentText.trim() !== originalText.trim()) {
        editorElement.classList.add('has-edits');
      } else {
        editorElement.classList.remove('has-edits');
      }
    } catch (error) {
      console.error('Error highlighting edited text:', error);
    }
  }, [originalHtmlContent]);

  const handleHtmlEditorChange = useCallback((value: string) => {
    setEditedHtmlContent(value);
    
    // Highlight edited text
    if (quillRef.current) {
      const quill = quillRef.current.getEditor();
      setTimeout(() => highlightEditedText(quill), 100);
    }
    
    // No auto-save - user must click Save button (DB is single source of truth)
    // Content changes will be tracked by hasUnsavedChanges
  }, [highlightEditedText]);

  const handleTextEdit = useCallback(async () => {
    if (!publishResult || !selectedText || !textEditNote.trim()) {
      toast({
        title: 'Selection Required',
        description: 'Select text in the preview and add a note before requesting edits',
        variant: 'destructive',
      });
      return;
    }

    setTextEditing(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/publish/edit-text`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: publishResult.title,
          metaDescription: publishResult.metaDescription,
          originalContent: selectedText,
          userNote: textEditNote,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to edit text');
      }

      const updatedText = extractEditedText(data.result);
      if (!updatedText) {
        throw new Error('No edited text returned by automation service');
      }

      // Use currentHtmlContent as source of truth - includes all previous edits
      const currentHtml = currentHtmlContent;
      let updatedHtml = currentHtml;
      
      // Try DOM replacement for preview mode (more accurate)
      if (!isEditMode && selectedRange && previewRef.current) {
        try {
          const workingRange = selectedRange.cloneRange();
          workingRange.deleteContents();
          workingRange.insertNode(document.createTextNode(updatedText));
          previewRef.current.normalize();
          updatedHtml = previewRef.current.innerHTML;
        } catch (error) {
          console.warn('DOM range replacement failed, falling back to string replace:', error);
          updatedHtml = currentHtml.replace(selectedText, updatedText);
        }
      } else {
        // String replacement (works in both modes)
        updatedHtml = currentHtml.replace(selectedText, updatedText);
      }

      // SIMPLE: Just update editedHtmlContent - this is what preview and save use
        setEditedHtmlContent(updatedHtml);
      
      // If in edit mode, update editor
      if (isEditMode) {
        handleHtmlEditorChange(updatedHtml);
      }
      
      setSelectedText(updatedText);
      setTextEditNote('');
      setSelectedRange(null);

      if (typeof window !== 'undefined') {
        window.getSelection()?.removeAllRanges();
      }

      setTimeout(() => {
        textTooltipInstanceRef.current?.hide();
        if (tooltipAnchorRef.current) {
          tooltipAnchorRef.current.style.display = 'none';
        }
      }, 500);

      toast({
        title: 'Text Updated',
        description: 'Your selection has been rewritten',
      });
    } catch (error) {
      console.error('Error editing text:', error);
      toast({
        title: 'Edit Failed',
        description: error instanceof Error ? error.message : 'Unable to edit selection',
        variant: 'destructive',
      });
    } finally {
      setTextEditing(false);
    }
  }, [publishResult, selectedText, textEditNote, toast, selectedRange, extractEditedText, isEditMode, currentHtmlContent, handleHtmlEditorChange]);

  const handleImageEdit = useCallback(async () => {
    if (!publishResult || !selectedImage || !imageEditNote.trim()) {
      toast({
        title: 'Choose an Image',
        description: 'Select an image and provide a note before requesting edits',
        variant: 'destructive',
      });
      return;
    }

    setImageEditing(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/publish/edit-image`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: publishResult.title,
          metaDescription: publishResult.metaDescription,
          image: selectedImage,
          userNote: imageEditNote,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to edit image');
      }

      const updatedImage = extractEditedImage(data.result);
      if (!updatedImage) {
        console.error('Failed to extract image from response:', data.result);
        throw new Error('Automation service did not return an updated image');
      }

      console.log('Image regeneration - Old:', selectedImage, 'New:', updatedImage);

      // Use currentHtmlContent as source of truth - includes all previous edits
      const currentHtml = currentHtmlContent;
      
      // Replace image URL in HTML - handle both src attributes and plain URLs
      // Escape special regex characters in both URLs
      const escapedSelectedImage = selectedImage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const escapedUpdatedImage = updatedImage.replace(/\$/g, '$$$$'); // Escape $ for replacement string
      
      // Replace in img src attributes first (most common case)
      let updatedHtml = currentHtml.replace(
        new RegExp(`(<img[^>]*src=["'])${escapedSelectedImage}(["'][^>]*>)`, 'gi'),
        `$1${escapedUpdatedImage}$2`
      );
      
      // If the URL also appears outside of img tags, replace those too
      updatedHtml = updatedHtml.replace(new RegExp(escapedSelectedImage, 'g'), escapedUpdatedImage);

      // Fallback: if nothing changed, append the new image
      if (updatedHtml === currentHtml) {
        updatedHtml = `${currentHtml}\n<img src="${updatedImage}" alt="Updated image" />`;
      }
      
      console.log('Image regeneration - HTML updated:', updatedHtml !== currentHtml ? 'Yes' : 'No');
      
      // SIMPLE: Just update editedHtmlContent - this is what preview and save use
        setEditedHtmlContent(updatedHtml);
      
      // If in edit mode, update editor
      if (isEditMode) {
        handleHtmlEditorChange(updatedHtml);
      }
      
      setSelectedImage(updatedImage);
      setImageEditNote('');
      imageTooltipInstanceRef.current?.hide();
      toast({
        title: 'Image Updated',
        description: 'Image updated successfully',
      });
    } catch (error) {
      console.error('Error editing image:', error);
      toast({
        title: 'Image Edit Failed',
        description: error instanceof Error ? error.message : 'Unable to edit image',
        variant: 'destructive',
      });
    } finally {
      setImageEditing(false);
    }
  }, [publishResult, selectedImage, imageEditNote, toast, extractEditedImage, isEditMode, currentHtmlContent, handleHtmlEditorChange]);

  const handlePublishToWordpress = async () => {
    if (!publishResult || !currentHtmlContent) {
      toast({
        title: 'No Draft',
        description: 'Generate or edit content before publishing',
        variant: 'destructive',
      });
      return;
    }

    if (!hasWordpressIntegration) {
      toast({
        title: 'Connect WordPress',
        description: 'Add your WordPress credentials in the Integration tab',
        variant: 'destructive',
      });
      return;
    }

    setPublishLoading(true);
    setIsPublishing(true);
    try {
      // SIMPLE: Just use currentHtmlContent - user should save manually before publishing
      const latestHtmlContent = currentHtmlContent;

      // AUTO-SAVE: Ensure DB has latest content before we publish and potentially re-fetch
      // This prevents stale DB data from overwriting local edits when we fetchDraftFromDb later
      await saveDraftToDatabase(true);

      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/publish/publish`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          draftId: currentDraftId, // Pass draftId to update existing draft instead of creating new one
          pageId, // Pass pageId context for campaign synchronization
          primaryKeyword: publishResult.primaryKeyword || publishForm.primaryKeyword,
          htmlContent: latestHtmlContent, // This is now synced with DB
          featuredImageEnabled: publishResult.featuredImageEnabled,
          featuredImageUrl: publishResult.featuredImageUrl,
          title: publishResult.title,
          metaDescription: publishResult.metaDescription,
          slug: publishResult.slug,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Publish request failed');
      }

      // Sync with parent for Campaign tab real-time view
      if (pageId && setPublishingPageIds && setDraftToPageMap) {
        setPublishingPageIds(prev => new Set(prev).add(pageId));
        if (data.draftId) {
          setDraftToPageMap(prev => new Map(prev).set(data.draftId, pageId));
        }
      }

      // Handle Immediate Success
      if (data.status === 'published' && data.publishedUrl) {
        const publishedUrl = data.publishedUrl;
        setCurrentDraftStatus('published');
        
        setPublishResult((prev) => prev ? {
          ...prev,
          wordpressUrl: publishedUrl,
          wordpressPostId: typeof data.wordpressPostId === 'number' ? data.wordpressPostId : prev.wordpressPostId,
        } : null);
        
        toast({
          title: 'Published',
          description: `Content published successfully. View it here: ${publishedUrl}`,
        });

        // IMMMEDIATE UPDATE: Manually update history state so "View Live" appears instantly
        if (currentDraftId) {
          setPublishHistory((prev) => prev.map(entry => {
            if (entry.id === currentDraftId) {
              return {
                ...entry,
                status: 'published',
                wordpressUrl: publishedUrl,
                wordpressPostId: typeof data.wordpressPostId === 'number' ? data.wordpressPostId : entry.wordpressPostId,
                updatedAt: new Date().toISOString()
              };
            }
            return entry;
          }));
        }
        
        fetchDraftFromDb(currentDraftId!);
        fetchPublishHistory();
        onRefreshWordpressIntegration();
        setPublishLoading(false); // Stop loading on success
        setIsPublishing(false);
      }
      // Handle Queued/Generating Status
      else if (data.status === 'generating') {
        console.log('[Publish:Debug] Job queued, setting currentDraftId:', data.draftId);
        setCurrentDraftStatus('generating');
        if (data.draftId) {
          setCurrentDraftId(data.draftId);
        }
        
        toast({
          title: 'Publish Queued',
          description: 'Your article is being published to WordPress in the background.',
        });
        // We KEEP publishLoading(true) here!
      }
      else {
        // STRICT FAILURE HANDLING: If no URL and not generating, treat as failed
        throw new Error('WordPress did not return a valid URL. The publish may have failed.');
      }
    } catch (error) {
      console.error('Error publishing to WordPress:', error);
      toast({
        title: 'Publish Failed',
        description: error instanceof Error ? error.message : 'Unable to publish content',
        variant: 'destructive',
      });
      setPublishLoading(false); // Stop loading on error
      setIsPublishing(false);
    }
  };

  const handlePreviewMouseUp = useCallback((e?: MouseEvent) => {
    if (typeof window === 'undefined') return;
    if (!previewRef.current) return;

    setTimeout(() => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        const target = e?.target as HTMLElement;
        if (
          target &&
          !target.closest('.tippy-box') &&
          !target.closest('[data-tippy-root]') &&
          !previewRef.current?.contains(target)
        ) {
          textTooltipInstanceRef.current?.hide();
          setSelectedText('');
          setSelectedRange(null);
        }
        return;
      }

      const range = selection.getRangeAt(0);
      if (!previewRef.current?.contains(range.commonAncestorContainer)) {
        return;
      }

      const text = selection.toString().trim();

      if (text && text.length >= 3 && text.replace(/\s+/g, '').length >= 2) {
        const clonedRange = range.cloneRange();
        setSelectedRange(clonedRange);
        setSelectedText(text);
        setTextEditNote('');

        requestAnimationFrame(() => {
          textTooltipInstanceRef.current?.show();
        });

        setTimeout(() => {
          textEditTextareaRef.current?.focus();
        }, 200);
      } else {
        setSelectedText('');
        setSelectedRange(null);
        textTooltipInstanceRef.current?.hide();
      }
    }, 10);
  }, []);

  const handleImageSelect = useCallback(
    (imageSrc: string) => {
      setSelectedImage(imageSrc);
      setSelectedImageAlt(
        publishImages.find((image) => image.src === imageSrc)?.alt || ''
      );
      setImageEditNote((prev) => (selectedImage === imageSrc ? prev : ''));
      imageTooltipInstanceRef.current?.show();
      setTimeout(() => {
        imageEditTextareaRef.current?.focus();
      }, 100);
    },
    [publishImages, selectedImage]
  );

  const handleResetDraft = useCallback(() => {
    setPublishResult(null);
    setCurrentDraftId(null);
    setSelectedText('');
    setSelectedImage('');
    setSelectedImageAlt('');
    setTextEditNote('');
    setImageEditNote('');
    setPublishStage('compose');
    setIsEditMode(false);
    setEditedHtmlContent('');
    textTooltipInstanceRef.current?.hide();
    imageTooltipInstanceRef.current?.hide();
    if (tooltipAnchorRef.current) {
      tooltipAnchorRef.current.style.display = 'none';
    }
    setSelectedRange(null);
    setOriginalDraftSnapshot(createDraftSnapshot(null, ''));
  }, []);

  const handleToggleEditMode = useCallback(() => {
    if (!publishResult) return;
    
    if (!isEditMode) {
      // Entering edit mode - load current content
      const htmlToEdit = currentHtmlContent;
      setEditedHtmlContent(htmlToEdit);
      setIsEditMode(true);
    } else {
      // Exiting edit mode - just switch modes, don't auto-save (user clicks Save button)
      setIsEditMode(false);
    }
  }, [isEditMode, publishResult, currentHtmlContent]);


  const handleRemoveImage = useCallback((imageSrc: string) => {
    if (!publishResult) return;
    
    const currentHtml = currentHtmlContent;
    const updatedHtml = currentHtml.replace(
      new RegExp(`<img[^>]*src=["']${imageSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`, 'gi'),
      ''
    );
    
    // SIMPLE: Just update editedHtmlContent
      setEditedHtmlContent(updatedHtml);
    if (isEditMode) {
      handleHtmlEditorChange(updatedHtml);
    }
    
    toast({
      title: 'Image Removed',
        description: 'The image has been removed. Click Save to persist changes.',
    });
  }, [publishResult, isEditMode, currentHtmlContent, handleHtmlEditorChange, toast]);

  const updateImageAltText = useCallback(() => {
    if (!publishResult || !selectedImage) return;

    const parser = new DOMParser();
    const doc = parser.parseFromString(currentHtmlContent, 'text/html');
    const image = Array.from(doc.querySelectorAll('img')).find(
      (item) => item.getAttribute('src') === selectedImage
    );

    if (!image) {
      toast({
        title: 'Image Not Found',
        description: 'The selected image could not be updated.',
        variant: 'destructive',
      });
      return;
    }

    image.setAttribute('alt', selectedImageAlt.trim());
    const updatedHtml = doc.body.innerHTML;

    setEditedHtmlContent(updatedHtml);
    if (isEditMode) {
      handleHtmlEditorChange(updatedHtml);
    }

    toast({
      title: 'Alt Text Updated',
      description: 'Image alt text was updated. Save to persist changes.',
    });
  }, [
    currentHtmlContent,
    handleHtmlEditorChange,
    isEditMode,
    publishResult,
    selectedImage,
    selectedImageAlt,
    toast,
  ]);

  const handleAddImage = useCallback(() => {
    if (!newImageUrl.trim()) {
      toast({
        title: 'URL Required',
        description: 'Please enter an image URL',
        variant: 'destructive',
      });
      return;
    }

    if (!publishResult) return;

    const currentHtml = currentHtmlContent;
    const imgTag = `<img src="${newImageUrl.trim()}" alt="${newImageAlt.trim() || 'Article image'}" />`;
    const updatedHtml = currentHtml + '\n' + imgTag;

    // SIMPLE: Just update editedHtmlContent
      setEditedHtmlContent(updatedHtml);
    if (isEditMode) {
      handleHtmlEditorChange(updatedHtml);
    }

    setNewImageUrl('');
    setNewImageAlt('');
    setShowAddImageModal(false);
    
    toast({
      title: 'Image Added',
      description: 'The image has been added. Click Save to persist changes.',
    });
  }, [newImageUrl, newImageAlt, publishResult, isEditMode, currentHtmlContent, handleHtmlEditorChange, toast]);

  const handleDeviceImageSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }

      if (!file.type.startsWith('image/')) {
        toast({
          title: 'Invalid File',
          description: 'Please choose an image file.',
          variant: 'destructive',
        });
        event.target.value = '';
        return;
      }

      if (!publishResult) {
        event.target.value = '';
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const imageSrc = typeof reader.result === 'string' ? reader.result : '';
        if (!imageSrc) {
          toast({
            title: 'Image Upload Failed',
            description: 'We could not read that image from your device.',
            variant: 'destructive',
          });
          return;
        }

        const currentHtml = currentHtmlContent;
        const fallbackAlt = file.name.replace(/\.[^.]+$/, '') || 'Article image';
        const imgTag = `<img src="${imageSrc}" alt="${fallbackAlt}" />`;
        const updatedHtml = currentHtml + '\n' + imgTag;

        setEditedHtmlContent(updatedHtml);
        if (isEditMode) {
          handleHtmlEditorChange(updatedHtml);
        }

        toast({
          title: 'Image Added',
          description: 'The image has been added. Click Save to persist changes.',
        });
      };

      reader.onerror = () => {
        toast({
          title: 'Image Upload Failed',
          description: 'We could not read that image from your device.',
          variant: 'destructive',
        });
      };

      reader.readAsDataURL(file);
      event.target.value = '';
    },
    [currentHtmlContent, handleHtmlEditorChange, isEditMode, publishResult, toast]
  );

  const closeTextTooltip = useCallback(() => {
    if (textSelectionIntervalRef.current) {
      clearInterval(textSelectionIntervalRef.current);
      textSelectionIntervalRef.current = null;
    }
    textTooltipInstanceRef.current?.hide();
    setSelectedText('');
    setSelectedRange(null);
    setTextEditNote('');
    if (typeof window !== 'undefined') {
      window.getSelection()?.removeAllRanges();
    }
    if (tooltipAnchorRef.current) {
      tooltipAnchorRef.current.style.display = 'none';
    }
  }, []);

  const closeImageTooltip = useCallback(() => {
    imageTooltipInstanceRef.current?.hide();
    setSelectedImage('');
    setSelectedImageAlt('');
    setImageEditNote('');
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedText) closeTextTooltip();
        if (selectedImage) closeImageTooltip();
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (selectedText && textEditNote.trim() && !textEditing) {
          handleTextEdit();
        } else if (selectedImage && imageEditNote.trim() && !imageEditing) {
          handleImageEdit();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    selectedText,
    selectedImage,
    textEditNote,
    imageEditNote,
    textEditing,
    imageEditing,
    closeTextTooltip,
    closeImageTooltip,
    handleTextEdit,
    handleImageEdit,
  ]);

  return (
    <>

      {showPreviewStage && (
          // Render preview content directly without overlay wrapper (for embedded use)
          // Parent overlay provides absolute inset-0 — we just fill it with a
          // flex column. Heights are flex-driven so the embedded preview
          // adapts to any container size (viewport, modal, content area).
          <div className="absolute inset-0 flex flex-col bg-white">
          <div className="z-20 bg-white/95 backdrop-blur-xl border-b border-gray-100 shadow-sm shrink-0">
            <div className="min-w-7xl mx-2 px-6 py-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                    {/* No back button in embedded mode - parent overlay handles closing */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
  {onBack && (
    <button
      onClick={onBack}
      className="flex items-center gap-2 py-1  text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all group"
    >
      <ChevronLeft className="h-4 w-4 text-gray-400 group-hover:text-gray-900 transition-colors" />
    </button>
  )}
  <p className="text-xs uppercase tracking-[0.3em] text-gray-500">
    {isEditMode ? 'Edit Mode' : 'Draft Preview'}
  </p>
</div>
                    <div className="flex items-center gap-2 mb-1">
                      {publishLoading && !publishResult && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-[10px] font-medium text-blue-700 uppercase tracking-[0.2em]">
                          <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4A8 8 0 104 12z" />
                          </svg>
                          Generating
                        </span>
                      )}
                    </div>
                    <h3 className="text-2xl font-light text-gray-900 tracking-tight truncate">
                      {publishResult?.title || publishForm.primaryKeyword || 'Untitled article'}
                    </h3>
                    {publishResult?.metaDescription && (
                      <p className="text-sm text-gray-600 mt-1 truncate">{publishResult.metaDescription}</p>
                    )}
                    {publishLoading && !publishResult && (
                      <p className="text-sm text-gray-500 mt-1">Creating your content...</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 justify-end flex-shrink-0">
                  {publishResult && (
                   <button
  onClick={handleToggleEditMode}
  title={isEditMode ? "Switch to Preview" : "Switch to Edit"}
  className={`px-5 py-2.5 rounded-md border text-sm font-medium transition-colors ${
    isEditMode
      ? 'border-gray-900 bg-gray-900 text-white hover:bg-gray-800'
      : 'border-gray-200 bg-white text-gray-900 hover:bg-gray-50'
  }`}
>
  <span className="flex items-center gap-2">
    {isEditMode ? <Eye className="h-4 w-4" /> : <Edit className="h-4 w-4" />}
  </span>
</button>
                  )}
                  <button
                    onClick={handleSaveDraft}
                    
  title={"Save Draft" + (hasUnsavedChanges ? " • Unsaved changes" : "")}
                    disabled={saving || !publishResult || !hasUnsavedChanges}
                    className={`px-5 py-2.5 rounded-md border text-sm font-medium transition-colors ${
                      hasUnsavedChanges 
                        ? 'border-orange-300 text-orange-50 text-orange-700 hover:bg-orange-100' 
                        : 'border-gray-200 bg-white text-gray-900 hover:bg-gray-50'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <Save className='h-5 w-5' />
                    {/* {saving ? 'Saving…' : hasUnsavedChanges ? 'Save Draft • Unsaved' : 'Save Draft'} */}
                  </button>
                  {/* Regenerate intentionally hidden in embedded mode.
                      The worksheet's Generate flow uses a different (universal)
                      n8n webhook tied to topic + keywords; calling
                      handleGenerateContent here would route to the legacy
                      single-keyword review webhook and clobber the topic's
                      draft with mismatched content. Regenerate from the
                      worksheet row instead. */}
                    <button
                      type="button"
                      onClick={() => addImageInputRef.current?.click()}
                      title='Add Image'
                      disabled={publishLoading || !publishResult}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-md border border-[#2D4059] bg-white text-sm font-medium text-[#2D4059] hover:bg-gray-100 disabled:opacity-60 transition-colors"
                    ><ImagePlus className='h-4 w-4'/>Add Image
                    </button>
                    <input
                      ref={addImageInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleDeviceImageSelect}
                      className="hidden"
                    />
                  {renderPublishActions('compact')}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* Left Sidebar - Article Stats */}
            {publishResult && (
              <div className="w-80 border-r border-gray-200 bg-gray-50/50 overflow-y-auto">
                <div className="p-6 space-y-6">
                  <div>
                    <h4 className="text-xs uppercase tracking-[0.3em] text-gray-500 mb-3">Article Stats</h4>
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-gray-200 bg-white p-4">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs text-gray-500">Total Words</p>
                          {hasUnsavedChanges && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                              Unsaved
                            </span>
                          )}
                        </div>
                        <p className="text-2xl font-light text-gray-900">{wordCount.toLocaleString()}</p>
                        {isEditMode && (
                          <p className="text-[10px] text-gray-400 mt-1">Updates as you type</p>
                        )}
                      </div>
                      
                      <div className="rounded-2xl border border-gray-200 bg-white p-4">
                        <p className="text-xs text-gray-500 mb-2">Primary Keyword</p>
                        <p className="text-sm font-medium text-gray-900">
                          {publishResult.primaryKeyword || publishForm.primaryKeyword || 'Not set'}
                        </p>
                      </div>

                      {renderMetadataEditor()}
                      {renderFeaturedImageEditor()}
                      
                      <div className="rounded-2xl border border-gray-200 bg-white p-4">
                        <p className="text-xs text-gray-500 mb-2">Secondary Keywords</p>
                        {secondaryKeywords.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {secondaryKeywords.map((keyword, index) => (
                              <span
                                key={index}
                                className="inline-flex items-center px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 text-xs font-medium"
                              >
                                {keyword}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400 italic">No secondary keywords set</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Image Management Panel - Below Article Stats */}
                  {isEditMode && (
                    <div>
                      <h4 className="text-xs uppercase tracking-[0.3em] text-gray-500 mb-3">Image Management</h4>
                      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden flex flex-col max-h-[calc(100vh-400px)]">
                        <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 flex items-center justify-between flex-shrink-0">
                          <p className="text-xs text-gray-500">Manage images in your article</p>
                          <button
                            onClick={() => setShowAddImageModal(true)}
                            className="inline-flex w-auto items-center justify-center rounded-xl border border-[#2D4059]/20  px-3 py-2.5 text-sm font-semibold text-white transition bg-[#2D4059] hover:bg-[#2D4059]/90"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Add
                          </button>
                        </div>
                        <div className="p-4 overflow-y-auto flex-1">
                          {publishImages.length === 0 ? (
                            <div className="text-center py-8 text-sm text-gray-500">
                              <ImageIcon className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                              <p>No images in this article</p>
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 gap-4">
                              {publishImages.map((image, index) => (
                                <div key={index} className="relative group rounded-xl border border-gray-200 overflow-hidden bg-gray-50">
                                  <img
                                    src={image.src}
                                    alt={image.alt}
                                    className="w-full h-32 object-cover"
                                  />
                                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                                    <button
                                      onClick={() => handleImageSelect(image.src)}
                                      className="px-3 py-1.5 rounded-full bg-white text-gray-900 text-xs font-medium hover:bg-gray-100"
                                    >
                                      <Edit className="h-3 w-3 inline mr-1" />
                                      Edit
                                    </button>
                                    <button
                                      onClick={() => handleRemoveImage(image.src)}
                                      className="px-3 py-1.5 rounded-full bg-red-600 text-white text-xs font-medium hover:bg-red-700"
                                    >
                                      <Trash2 className="h-3 w-3 inline mr-1" />
                                      Remove
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-8xl mx-auto px-6 py-8">
              {publishLoading && !publishResult ? (
                <div className="space-y-8">
                  {/* Hero section skeleton */}
                  <div className="space-y-4">
                    <div className="h-12 bg-gradient-to-r from-gray-100 via-gray-50 to-gray-100 rounded-2xl w-3/4 animate-pulse" />
                    <div className="space-y-2">
                      <div className="h-4 bg-gray-100 rounded-full w-full animate-pulse" />
                      <div className="h-4 bg-gray-100 rounded-full w-11/12 animate-pulse" />
                      <div className="h-4 bg-gray-100 rounded-full w-5/6 animate-pulse" />
                    </div>
                  </div>
                  
                  {/* Image skeleton */}
                  <div className="h-64 bg-gradient-to-br from-gray-100 to-gray-50 rounded-2xl animate-pulse" />
                  
                  {/* Content skeleton */}
                  <div className="space-y-6">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="space-y-3">
                        <div className="h-8 bg-gray-100 rounded-xl w-1/2 animate-pulse" />
                        <div className="space-y-2">
                          <div className="h-4 bg-gray-50 rounded-full w-full animate-pulse" />
                          <div className="h-4 bg-gray-50 rounded-full w-11/12 animate-pulse" />
                          <div className="h-4 bg-gray-50 rounded-full w-10/12 animate-pulse" />
                          <div className="h-4 bg-gray-50 rounded-full w-full animate-pulse" />
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {/* Loading indicator */}
                  <div className="flex items-center justify-center py-8">
                    <div className="flex flex-col items-center gap-3">
                      <svg className="h-8 w-8 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4A8 8 0 104 12z" />
                      </svg>
                      <p className="text-sm font-light text-gray-500">Crafting your content...</p>
                    </div>
                  </div>
                </div>
              ) : publishResult ? (
                <>
                  {isEditMode ? (
                    <div className="rounded-2xl border border-gray-200 bg-white">
                        <div className="bg-white">
                          <style>{`
                            /* ReactQuill wrapper styles */
                            .ql-snow {
                              border: none;
                            }
                            .ql-container {
                              font-family: SF Pro Display;
                              font-size: 16px;
                              min-height: calc(100vh - 450px);
                              height: auto;
                              border: none;
                            }
                            .ql-editor {
                              min-height: calc(100vh - 450px);
                              padding: 24px;
                            }
                            .ql-editor.ql-blank::before {
                              font-style: normal;
                              color: #9ca3af;
                            }
                            /* Make toolbar sticky at the very top */
                            .ql-toolbar,
                            .ql-toolbar.ql-snow,
                            .ql-snow .ql-toolbar,
                            div.ql-toolbar,
                            [class*="ql-toolbar"] {
                              position: sticky !important;
                              top: 0 !important;
                              z-index: 30 !important;
                              background: white !important;
                              backdrop-filter: blur(10px);
                              -webkit-backdrop-filter: blur(10px);
                              border-top: none !important;
                              border-left: none !important;
                              border-right: none !important;
                              border-bottom: 1px solid #e5e7eb !important;
                              padding: 12px !important;
                              box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08) !important;
                              margin: 0 !important;
                            }
                            .ql-editor.has-edits {
                              position: relative;
                            }
                            .ql-editor.has-edits::before {
                              content: '';
                              position: absolute;
                              top: 0;
                              left: 0;
                              right: 0;
                              bottom: 0;
                              background: linear-gradient(90deg, 
                                transparent 0%, 
                                rgba(59, 130, 246, 0.03) 50%, 
                                transparent 100%);
                              pointer-events: none;
                              z-index: 0;
                            }
                            .ql-editor.has-edits {
                              background-color: rgba(59, 130, 246, 0.02);
                            }
                            .ql-editor.has-edits p,
                            .ql-editor.has-edits h1,
                            .ql-editor.has-edits h2,
                            .ql-editor.has-edits h3,
                            .ql-editor.has-edits h4,
                            .ql-editor.has-edits h5,
                            .ql-editor.has-edits h6 {
                              position: relative;
                              z-index: 1;
                            }
                          `}</style>
                          <ReactQuill
                            ref={quillRef}
                            theme="snow"
                            value={editedHtmlContent}
                            onChange={(content) => {
                              handleHtmlEditorChange(content);
                            }}
                            modules={{
                              toolbar: [
                                [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
                                ['bold', 'italic', 'underline', 'strike'],
                                [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                                [{ 'script': 'sub'}, { 'script': 'super' }],
                                [{ 'indent': '-1'}, { 'indent': '+1' }],
                                [{ 'direction': 'rtl' }],
                                [{ 'size': ['small', false, 'large', 'huge'] }],
                                [{ 'color': [] }, { 'background': [] }],
                                [{ 'font': [] }],
                                [{ 'align': [] }],
                                ['clean'],
                                ['link', 'image', 'video'],
                                ['code-block']
                              ],
                            }}
                            formats={[
                              'header', 'font', 'size',
                              'bold', 'italic', 'underline', 'strike',
                              'list', 'bullet', 'indent',
                              'script', 'direction',
                              'color', 'background',
                              'align', 'link', 'image', 'video', 'code-block'
                            ]}
                          />
                      </div>
                    </div>
                  ) : (
                    <>
                      <style>{`
                        ::selection {
                          background-color: rgba(59, 130, 246, 0.4) !important;
                          color: inherit;
                        }
                        .prose ::selection {
                          background-color: rgba(59, 130, 246, 0.45) !important;
                        }
                        .prose *::selection {
                          background-color: rgba(59, 130, 246, 0.45) !important;
                        }
                        [data-selection-active="true"] ::selection {
                          background-color: rgba(59, 130, 246, 0.5) !important;
                        }
                        .selection-highlight {
                          background-color: rgba(59, 130, 246, 0.2) !important;
                          border-radius: 2px;
                          padding: 0 2px;
                          position: relative;
                        }
                        .selection-highlight::before {
                          content: '';
                          position: absolute;
                          inset: -2px;
                          border: 2px solid rgba(59, 130, 246, 0.4);
                          border-radius: 4px;
                          pointer-events: none;
                        }
                        /* Quill size classes so preview matches editor */
                        .ql-size-small { font-size: 0.75em; }
                        .ql-size-large { font-size: 1.5em; }
                        .ql-size-huge { font-size: 2.5em; }
                      `}</style>
                      <div
                        ref={previewRef}
                        data-selection-active={selectedText ? 'true' : 'false'}
                        onMouseUp={(e) => {
                          handlePreviewMouseUp(e.nativeEvent);
                        }}
                        onDoubleClick={(e) => {
                          const target = e.target as HTMLElement;
                          if (target.tagName === 'P' || target.closest('p')) {
                            const paragraph = target.tagName === 'P' ? target : target.closest('p');
                            if (paragraph) {
                              const range = document.createRange();
                              range.selectNodeContents(paragraph);
                              const selection = window.getSelection();
                              if (selection) {
                                selection.removeAllRanges();
                                selection.addRange(range);
                                setSelectedRange(range.cloneRange());
                                setSelectedText(selection.toString().trim());
                                setTimeout(() => {
                                  handlePreviewMouseUp(e.nativeEvent);
                                }, 10);
                              }
                            }
                          }
                        }}
                        onMouseDown={(e) => {
                          const target = e.target as HTMLElement;
                          if (target.closest('.tippy-box') || target.closest('[data-tippy-root]')) {
                            e.preventDefault();
                            return;
                          }
                          if (previewRef.current?.contains(target)) {
                            return;
                          }
                        }}
                        className="prose prose-lg prose-gray max-w-none prose-headings:font-semibold prose-img:rounded-2xl prose-img:shadow-sm selection:bg-blue-100 selection:text-gray-900"
                        style={{
                          userSelect: 'text',
                          WebkitUserSelect: 'text',
                        }}
                      >
                        {parse(currentHtmlContent || '')}
                      </div>
                      <p className="text-xs text-gray-500 text-center mt-8 pt-6 border-t border-gray-100">
                        Highlight text or tap any image to open the inline AI palette.
                      </p>
                    </>
                  )}
                </>
              ) : (
                <div className="py-16 text-center text-sm text-gray-500">
                  <p>Generate a draft to see the immersive preview.</p>
                </div>
              )}
              </div>
                        </div>
                      </div>

          {!isEditMode && publishResult && publishImages.length > 0 && (
            <div className="fixed bottom-6 right-6 z-40">
              <div className="bg-white/95 backdrop-blur-xl rounded-2xl border border-gray-200 shadow-2xl p-4 max-w-xs">
                <h4 className="text-sm font-medium text-gray-900 mb-3">Images</h4>
                <div className="grid grid-cols-2 gap-2">
                  {publishImages.map((image) => (
                    <Tippy
                      key={image.src}
                      onCreate={(instance) => {
                        if (selectedImage === image.src) {
                          imageTooltipInstanceRef.current = instance;
                        }
                      }}
                      content={
                        selectedImage === image.src ? (
                            <div className="w-[360px] rounded-[14px] border border-gray-200/70 bg-white p-5 shadow-2xl backdrop-blur-2xl space-y-3">
                            <div className="flex items-center justify-between">
                          <div>
                                <p className="text-md uppercase text-gray-800 font-medium">
                                  AI Assistance
                                </p>
                                <p className="text-[10px] text-gray-400 mt-0.5">
                                </p>
                          </div>
                              <button
                                onClick={closeImageTooltip}
                                className="text-xs text-gray-400 hover:text-gray-900 transition-colors p-1 rounded-full hover:bg-gray-100"
                                aria-label="Close tooltip"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                          </button>
                        </div>
                            <div className="relative rounded-xl overflow-hidden border border-gray-200/50">
                              <img src={selectedImage} alt="Selected for editing" className="w-full h-24 object-cover" />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                            </div>
                            <div className="space-y-2">
                              <label className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium">
                                Alt text
                              </label>
                              <input
                                type="text"
                                value={selectedImageAlt}
                                onChange={(e) => setSelectedImageAlt(e.target.value)}
                                placeholder="Describe this image"
                                className="w-full px-3 py-2.5 text-sm rounded-2xl border border-gray-200/80 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                              />
                              <button
                                onClick={updateImageAltText}
                                disabled={!selectedImage || selectedImageAlt === (selectedImageDetails?.alt || '')}
                                className="w-full px-4 py-2.5 rounded-full border border-gray-200 bg-white text-sm font-semibold hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                              >
                                Save Alt Text
                              </button>
                            </div>
                            <textarea
                              ref={imageEditTextareaRef}
                              value={imageEditNote}
                              onChange={(e) => setImageEditNote(e.target.value)}
                              onKeyDown={(e) => {
                                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                                  e.preventDefault();
                                  if (selectedImage && imageEditNote.trim() && !imageEditing) {
                                    handleImageEdit();
                                  }
                                }
                              }}
                              placeholder="Describe how this image should feel, what mood, style, or elements to include..."
                              rows={3}
                              className="w-full px-3 py-2.5 text-sm rounded-2xl border border-gray-200/80 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all resize-none"
                            />
                            <button
                              onClick={handleImageEdit}
                              disabled={!selectedImage || !imageEditNote.trim() || imageEditing}
                              className="w-full px-4 py-2.5 rounded-full border-2 border-gray-200 bg-white text-sm font-semibold hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md"
                            >
                              {imageEditing ? (
                                <span className="flex items-center justify-center gap-2">
                                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                                  </svg>
                                  Regenerating…
                                </span>
                              ) : (
                                'Regenerate Image'
                              )}
                            </button>
                          </div>
                        ) : null
                      }
                      visible={selectedImage === image.src}
                      interactive
                      placement="left"
                      theme="light"
                      className="publish-tippy"
                      arrow={false}
                      maxWidth="none"
                      animation="fade"
                      duration={200}
                      offset={[0, 12]}
                      hideOnClick={false}
                      trigger="manual"
                      appendTo={() => document.body}
                    >
                      <button
                        type="button"
                        onClick={() => handleImageSelect(image.src)}
                        className={`relative rounded-xl border-2 overflow-hidden transition-all aspect-square ${
                          selectedImage === image.src
                            ? 'border-black shadow-lg ring-2 ring-black/20'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <img src={image.src} alt={image.alt} className="w-full h-full object-cover" />
                        {selectedImage === image.src && (
                          <div className="absolute inset-0 bg-black/10 border-2 border-white rounded-xl" />
                        )}
                      </button>
                    </Tippy>
                  ))}
                </div>
              </div>
            </div>
          )}
          </div>
      )}

      {/* Add Image Modal - rendered outside preview overlay */}
      {showAddImageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-md mx-4">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Add Image</h3>
                <button
                  onClick={() => {
                    setShowAddImageModal(false);
                    setNewImageUrl('');
                    setNewImageAlt('');
                  }}
                  className="text-gray-400 hover:text-gray-900 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Image URL *
                  </label>
                  <input
                    type="url"
                    value={newImageUrl}
                    onChange={(e) => setNewImageUrl(e.target.value)}
                    placeholder="https://example.com/image.jpg"
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Alt Text
                  </label>
                  <input
                    type="text"
                    value={newImageAlt}
                    onChange={(e) => setNewImageAlt(e.target.value)}
                    placeholder="Description of the image"
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => {
                      setShowAddImageModal(false);
                      setNewImageUrl('');
                      setNewImageAlt('');
                    }}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-900 text-sm font-medium hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddImage}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800"
                  >
                    Add Image
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showPreviewStage && selectedText && (
        <Tippy
          onCreate={(instance) => {
            textTooltipInstanceRef.current = instance;
          }}
          getReferenceClientRect={() => {
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
              const range = selection.getRangeAt(0);
              const rect = range.getBoundingClientRect();
              return new DOMRect(rect.left + rect.width / 2, rect.top, 0, 0);
            }
            if (selectedRange) {
              try {
                const rect = selectedRange.getBoundingClientRect();
                return new DOMRect(rect.left + rect.width / 2, rect.top, 0, 0);
              } catch (e) {
                // ignore
              }
            }
            return new DOMRect(0, 0, 0, 0);
          }}
          content={
            <div className="w-[360px] rounded-[14px] border border-gray-200/70 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.15)] backdrop-blur-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className='flex justify-between w-full'>
                  <div className="w-full py-1  mb-1">
                  <p className="text-md uppercase text-gray-800 font-medium">
                    AI Assistance
                  </p>
                  </div>
                <button
                  onClick={closeTextTooltip}
                  className="text-xs text-gray-400 hover:text-gray-900 transition-colors p-1.5 rounded-full hover:bg-gray-100"
                  aria-label="Close tooltip"
                  >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                  </div>
              </div>
              <div className="rounded-xl border border-gray-200/50 bg-[#F3FFF3] p-3">
                <p className="text-md text-[#12A717] font-medium  line-clamp-6">
                  {selectedText}
                </p>
              </div>
              <textarea
                ref={textEditTextareaRef}
                value={textEditNote}
                onChange={(e) => setTextEditNote(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    if (selectedText && textEditNote.trim() && !textEditing) {
                      handleTextEdit();
                    }
                  } else if (e.key === 'Escape') {
                    closeTextTooltip();
                  }
                }}
                placeholder="Describe how this text should be rewritten..."
                rows={3}
                className="w-full px-4 py-3 text-sm rounded-2xl border border-gray-200/80 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all resize-none placeholder:text-gray-400 font-light"
                autoFocus
              />
              <button
                onClick={handleTextEdit}
                disabled={!selectedText || !textEditNote.trim() || textEditing}
                className="w-full px-4 py-3 rounded-2xl border-2 border-gray-200 bg-white text-sm font-semibold hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md active:scale-[0.98] text-gray-900"
              >
                {textEditing ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                    </svg>
                    Regenerating…
                  </span>
                ) : (
                  'Regenerate Text'
                )}
              </button>
            </div>
          }
          visible={selectedText ? true : false}
            interactive
            placement="top"
            theme="light"
            className="publish-tippy"
            arrow={false}
            maxWidth="none"
            animation="scale"
          duration={[150, 100]}
          offset={[0, 10]}
          hideOnClick={false}
          trigger="manual"
          appendTo={() => document.body}
          onShow={() => {
            if (selectedRange) {
              const selection = window.getSelection();
              if (selection) {
                try {
                  selection.removeAllRanges();
                  selection.addRange(selectedRange);
                  
                  // Remove any existing highlight overlays
                  const existingOverlays = document.querySelectorAll('[data-selection-overlay]');
                  existingOverlays.forEach(overlay => overlay.remove());
                  
                  // Add visual highlight overlay
                  const highlightOverlay = document.createElement('span');
                  highlightOverlay.setAttribute('data-selection-overlay', 'true');
                  highlightOverlay.style.cssText = `
                    position: fixed;
                    pointer-events: none;
                    z-index: 9998;
                    background-color: rgba(59, 130, 246, 0.2);
                    border-radius: 4px;
                    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.4), inset 0 0 0 1px rgba(59, 130, 246, 0.2);
                    transition: all 0.15s ease-out;
                  `;
                  
                  const updateOverlayPosition = () => {
                    try {
                      const rect = selectedRange.getBoundingClientRect();
                      highlightOverlay.style.top = `${rect.top - 2}px`;
                      highlightOverlay.style.left = `${rect.left - 2}px`;
                      highlightOverlay.style.width = `${rect.width + 4}px`;
                      highlightOverlay.style.height = `${rect.height + 4}px`;
                    } catch (e) {
                      // Range might be invalid, ignore
                    }
                  };
                  
                  updateOverlayPosition();
                  document.body.appendChild(highlightOverlay);
                  
                  // Update overlay position on scroll
                  const handleScroll = () => updateOverlayPosition();
                  window.addEventListener('scroll', handleScroll, true);
                  
                  const maintainSelection = window.setInterval(() => {
                    if (selectedRange && selection.rangeCount === 0) {
                      try {
                        selection.addRange(selectedRange);
                        updateOverlayPosition();
                      } catch (e) {
                        if (textSelectionIntervalRef.current) {
                          clearInterval(textSelectionIntervalRef.current);
                          textSelectionIntervalRef.current = null;
                        }
                      }
                    }
                  }, 100);
                  textSelectionIntervalRef.current = maintainSelection;
                  
                  // Store cleanup function
                  (highlightOverlay as HTMLElement & { __cleanup?: () => void }).__cleanup = () => {
                    window.removeEventListener('scroll', handleScroll, true);
                  };
                } catch (e) {
                  // ignore
                }
              }
            }
          }}
          onHide={() => {
            if (textSelectionIntervalRef.current) {
              clearInterval(textSelectionIntervalRef.current);
              textSelectionIntervalRef.current = null;
            }
            
            // Remove highlight overlay and cleanup listeners
            const overlays = document.querySelectorAll<HTMLElement & { __cleanup?: () => void }>('[data-selection-overlay]');
            overlays.forEach(overlay => {
              const cleanup = overlay.__cleanup;
              if (cleanup) cleanup();
              overlay.remove();
            });
            
            setSelectedText('');
            setSelectedRange(null);
          }}
          onClickOutside={(instance, event) => {
            const target = event.target as HTMLElement;
            if (previewRef.current?.contains(target)) {
              const selection = window.getSelection();
              if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
                instance.hide();
              }
              return;
            }
            instance.hide();
          }}
        >
          <span
            ref={tooltipAnchorRef}
            style={{
              position: 'absolute',
              width: '1px',
              height: '1px',
              pointerEvents: 'none',
              opacity: 0,
            }}
          />
        </Tippy>
      )}
    </>
  );
};

export default PublishExperience;
