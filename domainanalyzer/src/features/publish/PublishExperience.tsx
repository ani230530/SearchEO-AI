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
  X,
  ArrowUpDown,
} from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/use-toast';
import PublishOverviewCard from './PublishOverviewCard';
import PublishHistoryTable from './PublishHistoryTable';
import Tippy from '@tippyjs/react';
import 'tippy.js/dist/tippy.css';
import 'tippy.js/themes/light.css';
import { KeywordTableItem } from '@/types/keywords';
import {
  WordpressIntegration,
  GeneratedArticleContent,
  PublishHistoryEntry,
} from '@/types/publish';
import type { Instance } from 'tippy.js';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002';

interface PublishExperienceProps {
  companyDomain: string;
  domainContext: string;
  keywordsTableData: KeywordTableItem[];
  hasWordpressIntegration: boolean;
  wpIntegration: WordpressIntegration | null;
  onConfigureWordpress: () => void;
  onRefreshWordpressIntegration: () => void;
  isActive: boolean;
}

interface PublishFormState {
  primaryKeyword: string;
  longtailKeywords: string;
  brandName: string;
  brandDescription: string;
  images: number;
  wordCount: number;
  featuredImage: boolean;
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

const PublishExperience: React.FC<PublishExperienceProps> = ({
  companyDomain,
  domainContext,
  keywordsTableData,
  hasWordpressIntegration,
  wpIntegration,
  onConfigureWordpress,
  onRefreshWordpressIntegration,
  isActive,
}) => {
  const { toast } = useToast();
  const [publishForm, setPublishForm] = useState<PublishFormState>({
    primaryKeyword: '',
    longtailKeywords: '',
    brandName: '',
    brandDescription: '',
    images: 2,
    wordCount: 800,
    featuredImage: true,
  });
  const [publishLoading, setPublishLoading] = useState(false);
  const [publishResult, setPublishResult] = useState<GeneratedArticleContent | null>(null);
  const [publishStage, setPublishStage] = useState<'compose' | 'preview'>('compose');
  const [publishHistory, setPublishHistory] = useState<PublishHistoryEntry[]>([]);
  const [publishDrawerOpen, setPublishDrawerOpen] = useState(false);
  const [drawerStep, setDrawerStep] = useState(1);
  const totalDrawerSteps = 4;
  const [savingDraft, setSavingDraft] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [textEditNote, setTextEditNote] = useState('');
  const [textEditing, setTextEditing] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string>('');
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

  const showPreviewStage = publishStage === 'preview';

  const publishImages = useMemo(() => {
    if (typeof window === 'undefined' || !publishResult?.htmlContent) {
      return [];
    }

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(publishResult.htmlContent, 'text/html');
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
  }, [publishResult?.htmlContent]);

  const filteredPublishKeywords = useMemo(() => {
    if (!publishKeywordQuery) {
      return keywordsTableData;
    }
    return keywordsTableData.filter((keyword) =>
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

  const fetchPublishHistory = useCallback(async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/publish/history`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        throw new Error('Failed to fetch publish history');
      }
      const data = await response.json();
      if (data.success) {
        setPublishHistory(data.logs || []);
      }
    } catch (error) {
      console.error('Error fetching publish history:', error);
    }
  }, []);

  useEffect(() => {
    if (isActive) {
      fetchPublishHistory();
    }
  }, [isActive, fetchPublishHistory]);

  useEffect(() => {
    if (!publishResult && !publishLoading && publishStage !== 'compose') {
      setPublishStage('compose');
    }
  }, [publishResult, publishLoading, publishStage]);

  useEffect(() => {
    if (publishStage === 'compose') {
      textTooltipInstanceRef.current?.hide();
      imageTooltipInstanceRef.current?.hide();
      if (tooltipAnchorRef.current) {
        tooltipAnchorRef.current.style.display = 'none';
      }
    }
  }, [publishStage]);

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

  useEffect(() => {
    if (publishResult) {
      setSelectedText('');
      setTextEditNote('');
      setSelectedImage('');
      setImageEditNote('');
    }
  }, [publishResult]);

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
    setPublishDrawerOpen(true);
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

  const handleSaveDraft = useCallback(async () => {
    if (!publishResult) {
      toast({
        title: 'No Draft',
        description: 'Generate content before saving a draft.',
        variant: 'destructive',
      });
      return;
    }

    setSavingDraft(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/publish/drafts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          primaryKeyword: publishResult.primaryKeyword,
          htmlContent: publishResult.htmlContent,
          featuredImage: publishResult.featuredImage,
          title: publishResult.title,
          metaDescription: publishResult.metaDescription,
          slug: publishResult.slug,
          longtailKeywords: publishResult.longtailKeywords,
          wordpressUrl: publishResult.wordpressUrl,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to save draft');
      }
      toast({
        title: 'Draft Saved',
        description: 'You can resume it anytime from the drafts table.',
      });
      fetchPublishHistory();
    } catch (error) {
      console.error('Error saving draft:', error);
      toast({
        title: 'Unable to Save Draft',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSavingDraft(false);
    }
  }, [publishResult, toast, fetchPublishHistory]);

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
        featuredImage:
          (payload.featuredImage as string) ??
          (payload['Featured Image'] as string | undefined) ??
          publishResult?.featuredImage,
        title:
          (payload.title as string) ??
          (payload['Title'] as string | undefined) ??
          entry.title ??
          'Draft article',
        metaDescription:
          (payload.metaDescription as string) ??
          (payload['Meta Description'] as string | undefined) ??
          publishResult?.metaDescription,
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

      setPublishResult(nextResult);
      setPublishForm((prev) => ({
        ...prev,
        primaryKeyword: nextResult.primaryKeyword || prev.primaryKeyword,
        longtailKeywords: payloadLongtail || prev.longtailKeywords,
      }));
      setSelectedLongtailKeywords(normalizedLongtail);
      setPublishStage('preview');
      setPublishDrawerOpen(false);
      setSelectedText('');
      setSelectedRange(null);
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
      featuredImage: publishForm.featuredImage,
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
        featuredImage: data.content?.featuredImage,
        title: data.content?.title,
        metaDescription: data.content?.metaDescription,
        slug: data.content?.slug,
        wordpressUrl: data.content?.wordpressUrl,
        longtailKeywords: data.content?.longtailKeywords,
      };

      if (!normalized.htmlContent) {
        throw new Error('Automation service did not return HTML content');
      }

      setPublishResult(normalized);
      setPublishStage('preview');
      // Close drawer when generation completes successfully
      setPublishDrawerOpen(false);
      
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
              featuredImage: normalized.featuredImage,
              longtailKeywords: normalized.longtailKeywords,
              wordpressUrl: normalized.wordpressUrl,
            }),
          });
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

      let updatedHtml = publishResult.htmlContent;
      if (selectedRange && previewRef.current) {
        try {
          const workingRange = selectedRange.cloneRange();
          workingRange.deleteContents();
          workingRange.insertNode(document.createTextNode(updatedText));
          previewRef.current.normalize();
          updatedHtml = previewRef.current.innerHTML;
        } catch (error) {
          console.warn('DOM range replacement failed, falling back to string replace:', error);
          updatedHtml = publishResult.htmlContent.replace(selectedText, updatedText);
        }
      } else {
        updatedHtml = publishResult.htmlContent.replace(selectedText, updatedText);
      }

      setPublishResult((prev) => (prev ? { ...prev, htmlContent: updatedHtml } : prev));
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
  }, [publishResult, selectedText, textEditNote, toast, selectedRange, extractEditedText]);

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
        throw new Error('Automation service did not return an updated image');
      }

      const updatedHtml = publishResult.htmlContent.replace(selectedImage, updatedImage);
      setPublishResult((prev) =>
        prev
          ? {
              ...prev,
              htmlContent: updatedHtml,
              featuredImage: prev.featuredImage === selectedImage ? updatedImage : prev.featuredImage,
            }
          : prev
      );
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
  }, [publishResult, selectedImage, imageEditNote, toast, extractEditedImage]);

  const handlePublishToWordpress = async () => {
    if (!publishResult || !publishResult.htmlContent) {
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
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/publish/publish`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          primaryKeyword: publishResult.primaryKeyword || publishForm.primaryKeyword,
          htmlContent: publishResult.htmlContent,
          featuredImage: publishResult.featuredImage,
          title: publishResult.title,
          metaDescription: publishResult.metaDescription,
          slug: publishResult.slug,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Publish request failed');
      }

      toast({
        title: 'Published',
        description: 'Content sent to WordPress',
      });
      fetchPublishHistory();
      onRefreshWordpressIntegration();
    } catch (error) {
      console.error('Error publishing to WordPress:', error);
      toast({
        title: 'Publish Failed',
        description: error instanceof Error ? error.message : 'Unable to publish content',
        variant: 'destructive',
      });
    } finally {
      setPublishLoading(false);
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
      setImageEditNote((prev) => (selectedImage === imageSrc ? prev : ''));
      imageTooltipInstanceRef.current?.show();
      setTimeout(() => {
        imageEditTextareaRef.current?.focus();
      }, 100);
    },
    [selectedImage]
  );

  const handleResetDraft = useCallback(() => {
    setPublishResult(null);
    setSelectedText('');
    setSelectedImage('');
    setTextEditNote('');
    setImageEditNote('');
    setPublishStage('compose');
    textTooltipInstanceRef.current?.hide();
    imageTooltipInstanceRef.current?.hide();
    if (tooltipAnchorRef.current) {
      tooltipAnchorRef.current.style.display = 'none';
    }
    setSelectedRange(null);
  }, []);

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
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-thin text-black tracking-tight mb-2">Publish</h2>
          <p className="text-base font-light text-gray-600">
            Generate, refine, and push articles directly to WordPress
          </p>
        </div>
        {hasWordpressIntegration ? (
          <div className="px-4 py-2 rounded-full bg-green-50 text-green-700 text-sm font-medium">
            Connected to {wpIntegration?.siteUrl?.replace(/^https?:\/\//, '') || 'WordPress'}
          </div>
        ) : (
          <button
            onClick={onConfigureWordpress}
            className="px-5 py-2.5 border border-gray-200 rounded-full text-sm font-medium hover:bg-gray-50"
          >
            Configure WordPress
          </button>
        )}
      </div>

      <PublishOverviewCard
        hasWordpressIntegration={hasWordpressIntegration}
        wpIntegration={wpIntegration}
        publishHistoryCount={publishHistory.length}
        publishWordCount={publishForm.wordCount}
        publishImageCount={publishForm.images}
        publishStage={publishStage}
        onOpenComposeDrawer={handleOpenComposeDrawer}
        onExitPreview={handleExitPreview}
      />

      {publishError && (
        <div className="rounded-2xl border border-red-100 bg-red-50/80 px-4 py-3 text-sm text-red-700">
          {publishError}
        </div>
      )}

      <Sheet
        open={publishDrawerOpen && (publishStage === 'compose' || (publishStage === 'preview' && publishLoading && !publishResult))}
        onOpenChange={(open) => {
          setPublishDrawerOpen(open);
          if (open && !publishLoading) {
            setPublishStage('compose');
          }
        }}
      >
        <SheetContent
          side="right"
          className="w-full sm:max-w-3xl border-l border-[#e2e4ea] bg-[#f5f6fa] px-10 py-12 overflow-y-auto font-light"
        >
          <div className="space-y-10">
            <div className="rounded-[32px] border border-white/80 bg-white/90 px-6 py-6 shadow-[0_30px_80px_rgba(15,23,42,0.10)] backdrop-blur">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-3">
                  <div className="inline-flex items-center gap-2 rounded-full border border-black/10 px-4 py-1 text-[10px] tracking-[0.35em] uppercase text-gray-500">
                    Launch prep
                  </div>
                  <div>
                    <h3 className="text-[28px] font-light text-gray-900 tracking-tight">
                      {publishLoading && !publishResult ? (
                        <span className="flex items-center gap-2">
                          Generating content...
                          <svg className="h-5 w-5 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4A8 8 0 104 12z" />
                          </svg>
                        </span>
                      ) : (
                        `Step ${drawerStep} of ${totalDrawerSteps}`
                      )}
                    </h3>
                    {publishLoading && !publishResult && (
                      <p className="text-sm text-gray-500 mt-1">Your content is being created. You can continue editing or check back shortly.</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-1">
                    {drawerSteps.map((step) => (
                      <span
                        key={`progress-${step.id}`}
                        className={`h-1.5 w-12 rounded-full transition-all ${
                          step.id <= drawerStep ? 'bg-black/80' : 'bg-black/10'
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-xs uppercase tracking-[0.3em] text-gray-400">
                    Compose flow
                  </p>
                </div>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-4">
                
              </div>
            </div>

            {drawerStep === 1 && (
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
                      <span className="text-2xl font-light">{publishForm.wordCount}</span>
                      <span className="text-xs uppercase tracking-[0.25em] text-gray-500">words</span>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] uppercase tracking-[0.3em] text-gray-400 mb-2">
                      <span>Brief</span>
                      <span>Feature</span>
                      <span>Chronicle</span>
                    </div>
                    <input
                      type="range"
                      min={500}
                      max={2000}
                      step={50}
                      value={publishForm.wordCount}
                      onChange={(e) =>
                        setPublishForm((prev) => ({ ...prev, wordCount: Number(e.target.value) }))
                      }
                      className="w-full h-2 rounded-full bg-gradient-to-r from-gray-200 via-gray-300 to-gray-400 accent-black"
                    />
                    <div className="mt-2 flex justify-between text-xs text-gray-500">
                      <span>Snackable insight</span>
                      <span>Premium editorial</span>
                      <span>Marquee deep dive</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-gray-600">
                  {['Product deep dive', 'Interview format', 'Thought leadership', 'Point-of-view essay'].map(
                    (chip) => (
                      <span
                        key={chip}
                        className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-3 py-1"
                      >
                        {chip}
                      </span>
                    )
                  )}
                </div>
              </section>
            )}

            {drawerStep === 2 && (
              <section className="rounded-[36px] border border-white/70 bg-white p-8 shadow-[0_30px_80px_rgba(15,23,42,0.08)] space-y-8">
                <div className="space-y-2">
                  <span className="text-[11px] uppercase tracking-[0.35em] text-gray-400">Imagery</span>
                  <h4 className="text-2xl font-light text-gray-900">Compose a modern visual cadence.</h4>
                  <p className="text-sm text-gray-500 max-w-2xl">
                    Control how often imagery appears and whether a cinematic banner crowns the experience.
                  </p>
                </div>
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="rounded-3xl border border-gray-100 bg-gray-50/80 p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">Inline images</p>
                        <p className="text-xs text-gray-500">Slide to fine-tune the visual tempo.</p>
                      </div>
                      <span className="text-lg font-semibold text-gray-900">{publishForm.images}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() =>
                          setPublishForm((prev) => ({ ...prev, images: Math.max(0, prev.images - 1) }))
                        }
                        className="w-12 h-12 rounded-full border border-gray-200 text-2xl leading-none flex items-center justify-center hover:border-gray-300"
                      >
                        −
                      </button>
                      <div className="flex-1 h-2 rounded-full bg-gray-100">
                        <div
                          className="h-full rounded-full bg-gray-900 transition-all"
                          style={{ width: `${(publishForm.images / 4) * 100}%` }}
                        />
                      </div>
                      <button
                        onClick={() =>
                          setPublishForm((prev) => ({ ...prev, images: Math.min(4, prev.images + 1) }))
                        }
                        className="w-12 h-12 rounded-full border border-gray-200 text-2xl leading-none flex items-center justify-center hover:border-gray-300"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="rounded-3xl border border-gray-100 bg-gray-50/80 p-5 space-y-3">
                    <p className="text-sm font-semibold text-gray-800">Hero banner</p>
                    <p className="text-xs text-gray-500">
                      Perfect for featured cards, WordPress previews, and shareable link thumbnails.
                    </p>
                    <button
                      onClick={() =>
                        setPublishForm((prev) => ({ ...prev, featuredImage: !prev.featuredImage }))
                      }
                      className={`w-full px-4 py-3 rounded-[30px] border text-sm font-medium transition-all ${
                        publishForm.featuredImage
                          ? 'bg-black text-white border-black shadow-lg'
                          : 'border-gray-200 text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      {publishForm.featuredImage ? 'Use banner imagery' : 'Skip banner imagery'}
                    </button>
                  </div>
                </div>
              </section>
            )}

            {drawerStep === 3 && (
              <section className="rounded-[36px] bg-white border border-white/70 shadow-[0_30px_80px_rgba(15,23,42,0.08)] p-8 space-y-6">
                <div>
                  <p className="text-xs uppercase tracking-[0.35em] text-gray-500">Primary keyword</p>
                  <p className="text-sm text-gray-500">Select the hero query or type your own</p>
                </div>
                <input
                  type="text"
                  value={primaryKeywordInput}
                  onChange={(e) => handlePrimaryInputChange(e.target.value)}
                  placeholder="Finance expert witness"
                  className="w-full px-5 py-4 rounded-[28px] border border-gray-200 bg-gradient-to-br from-white via-white to-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-base shadow-inner"
                />
                <div className="rounded-[28px] border border-gray-200 bg-gray-50/60 p-4 space-y-3">
                  <div className="relative">
                    <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={publishKeywordQuery}
                      onChange={(e) => setPublishKeywordQuery(e.target.value)}
                      placeholder="Search domain keywords..."
                      className="w-full pl-9 pr-3 py-2.5 rounded-2xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                    {sortedKeywords.length === 0 ? (
                      <p className="p-4 text-sm text-gray-500">No keywords available for this search.</p>
                    ) : (
                      <>
                        <div className="bg-gray-50/50 border-b border-gray-200">
                          <div className="grid grid-cols-[auto,1fr,100px,90px] gap-6 px-5 py-3.5">
                            <div className="w-8" />
                            <div 
                              className="flex items-center space-x-1.5 cursor-pointer hover:text-gray-900 transition-colors text-xs font-semibold text-gray-600 uppercase tracking-wider"
                              onClick={() => handleSort('keyword')}
                            >
                              <span>Keyword</span>
                              {getSortIcon('keyword')}
                            </div>
                            <div 
                              className="flex items-center space-x-1.5 cursor-pointer hover:text-gray-900 transition-colors justify-end text-xs font-semibold text-gray-600 uppercase tracking-wider"
                              onClick={() => handleSort('volume')}
                            >
                              <span>Volume</span>
                              {getSortIcon('volume')}
                            </div>
                            <div 
                              className="flex items-center space-x-1.5 cursor-pointer hover:text-gray-900 transition-colors justify-center text-xs font-semibold text-gray-600 uppercase tracking-wider"
                              onClick={() => handleSort('intent')}
                            >
                              <span>Intent</span>
                              {getSortIcon('intent')}
                            </div>
                          </div>
                        </div>
                        <div className="divide-y divide-gray-100/80 max-h-72 overflow-y-auto">
                          {sortedKeywords.slice(0, 25).map((keyword) => {
                            const isActive = publishForm.primaryKeyword === keyword.keyword;
                            return (
                              <button
                                key={keyword.id}
                                onClick={() => handlePrimaryKeywordSelect(keyword.keyword)}
                                className={`w-full grid grid-cols-[auto,1fr,100px,90px] items-center gap-6 px-5 py-3.5 hover:bg-gray-50/50 transition-all duration-150 cursor-pointer ${
                                  isActive ? 'bg-blue-50/30' : ''
                                }`}
                              >
                                <div className="flex items-center justify-center w-8">
                                  <div className={`w-5 h-5 rounded-full border-2 transition-all duration-150 flex items-center justify-center ${
                                    isActive 
                                      ? 'bg-gray-900 border-gray-900' 
                                      : 'border-gray-300 hover:border-gray-400'
                                  }`}>
                                    {isActive && (
                                      <CheckCircle className="w-4 h-4 text-white -ml-0.5 -mt-0.5" fill="currentColor" />
                                    )}
                                  </div>
                                </div>
                                <div className="text-left min-w-0">
                                  <span className="font-medium text-gray-900 text-sm block truncate">
                                    {keyword.keyword}
                                  </span>
                                </div>
                                <div className="text-right">
                                  <span className="font-medium text-gray-700 text-sm">
                                    {keyword.volume >= 1000 ? `${(keyword.volume/1000).toFixed(1)}K` : keyword.volume.toLocaleString()}
                                  </span>
                                </div>
                                <div className="flex items-center justify-center">
                                  <span className={`px-2.5 py-1 rounded-md text-[10px] font-medium ${
                                    keyword.intent === 'Commercial' ? 'bg-blue-50 text-blue-700' :
                                    keyword.intent === 'Transactional' ? 'bg-green-50 text-green-700' :
                                    'bg-gray-50 text-gray-700'
                                  }`}>
                                    {keyword.intent}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </section>
            )}

            {drawerStep === 4 && (
              <section className="rounded-[36px] bg-white border border-white/70 shadow-[0_30px_80px_rgba(15,23,42,0.08)] p-8 space-y-6">
                <div>
                  <p className="text-xs uppercase tracking-[0.35em] text-gray-500">Long-tail notes</p>
                  <p className="text-sm text-gray-500">
                    Select supporting angles or add your own prompts.
                  </p>
                </div>
                <div className="rounded-[28px] border border-gray-200 bg-gray-50/60 p-4 space-y-3">
                  <div className="relative">
                    <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={publishKeywordQuery}
                      onChange={(e) => setPublishKeywordQuery(e.target.value)}
                      placeholder="Search support keywords..."
                      className="w-full pl-9 pr-3 py-2.5 rounded-2xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                    {sortedKeywords.length === 0 ? (
                      <p className="p-4 text-sm text-gray-500">No keywords available for this search.</p>
                    ) : (
                      <>
                        <div className="bg-gray-50/50 border-b border-gray-200">
                          <div className="grid grid-cols-[auto,1fr,100px,90px] gap-6 px-5 py-3.5">
                            <div className="w-8" />
                            <div 
                              className="flex items-center space-x-1.5 cursor-pointer hover:text-gray-900 transition-colors text-xs font-semibold text-gray-600 uppercase tracking-wider"
                              onClick={() => handleSort('keyword')}
                            >
                              <span>Keyword</span>
                              {getSortIcon('keyword')}
                            </div>
                            <div 
                              className="flex items-center space-x-1.5 cursor-pointer hover:text-gray-900 transition-colors justify-end text-xs font-semibold text-gray-600 uppercase tracking-wider"
                              onClick={() => handleSort('volume')}
                            >
                              <span>Volume</span>
                              {getSortIcon('volume')}
                            </div>
                            <div 
                              className="flex items-center space-x-1.5 cursor-pointer hover:text-gray-900 transition-colors justify-center text-xs font-semibold text-gray-600 uppercase tracking-wider"
                              onClick={() => handleSort('intent')}
                            >
                              <span>Intent</span>
                              {getSortIcon('intent')}
                            </div>
                          </div>
                        </div>
                        <div className="divide-y divide-gray-100/80 max-h-60 overflow-y-auto">
                          {sortedKeywords.slice(0, 25).map((keyword) => {
                            const isSelected = selectedLongtailKeywords.includes(keyword.keyword);
                            return (
                              <button
                                key={`${keyword.id}-longtail`}
                                type="button"
                                onClick={() => toggleLongtailKeyword(keyword.keyword)}
                                className={`w-full grid grid-cols-[auto,1fr,100px,90px] items-center gap-6 px-5 py-3.5 hover:bg-gray-50/50 transition-all duration-150 cursor-pointer ${
                                  isSelected ? 'bg-blue-50/30' : ''
                                }`}
                              >
                                <div className="flex items-center justify-center w-8">
                                  <div className={`w-5 h-5 rounded-full border-2 transition-all duration-150 flex items-center justify-center ${
                                    isSelected 
                                      ? 'bg-gray-900 border-gray-900' 
                                      : 'border-gray-300 hover:border-gray-400'
                                  }`}>
                                    {isSelected && (
                                      <CheckCircle className="w-4 h-4 text-white -ml-0.5 -mt-0.5" fill="currentColor" />
                                    )}
                                  </div>
                                </div>
                                <div className="text-left min-w-0">
                                  <span className="font-medium text-gray-900 text-sm block truncate">
                                    {keyword.keyword}
                                  </span>
                                </div>
                                <div className="text-right">
                                  <span className="font-medium text-gray-700 text-sm">
                                    {keyword.volume >= 1000 ? `${(keyword.volume/1000).toFixed(1)}K` : keyword.volume.toLocaleString()}
                                  </span>
                                </div>
                                <div className="flex items-center justify-center">
                                  <span className={`px-2.5 py-1 rounded-md text-[10px] font-medium ${
                                    keyword.intent === 'Commercial' ? 'bg-blue-50 text-blue-700' :
                                    keyword.intent === 'Transactional' ? 'bg-green-50 text-green-700' :
                                    'bg-gray-50 text-gray-700'
                                  }`}>
                                    {keyword.intent}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-[0.35em] text-gray-500">
                    Add custom direction
                  </label>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="text"
                      value={longtailInput}
                      onChange={(e) => setLongtailInput(e.target.value)}
                      placeholder="Add tone, CTA, or example..."
                      className="flex-1 px-4 py-3 text-sm rounded-2xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                    <button
                      onClick={handleAddLongtailInput}
                      className="px-5 py-3 rounded-2xl bg-black text-white text-sm font-medium hover:bg-black/90 transition-colors"
                    >
                      Add
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedLongtailKeywords.length === 0 ? (
                    <p className="text-xs text-gray-400">
                      Selected notes will appear here. Use them to guide tone, voice, or structure.
                    </p>
                  ) : (
                    selectedLongtailKeywords.map((keyword) => (
                      <span
                        key={`chip-${keyword}`}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-900 text-white text-xs font-medium"
                      >
                        {keyword}
                        <button
                          onClick={() => handleRemoveLongtailKeyword(keyword)}
                          className="hover:text-gray-200"
                          aria-label={`Remove ${keyword}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </section>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-gray-200">
              <button
                onClick={handleDrawerBack}
                disabled={drawerStep === 1}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </button>
              <div className="flex items-center gap-3">
                {drawerStep < totalDrawerSteps && (
                  <button
                    onClick={handleDrawerNext}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gray-900 text-white text-sm font-semibold hover:bg-black/90"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </button>
                )}
                {drawerStep === totalDrawerSteps && (
                  <button
                    onClick={handleGenerateContent}
                    disabled={publishLoading || !publishForm.primaryKeyword.trim()}
                    className="px-6 py-2.5 rounded-full bg-black text-white text-sm font-semibold shadow-lg hover:bg-black/90 disabled:opacity-60 transition-colors"
                  >
                    {publishLoading ? 'Generating…' : 'Generate & Preview'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {showPreviewStage && (
        <div className="fixed inset-0 z-50 bg-white">
          <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-xl border-b border-gray-100 shadow-sm">
            <div className="max-w-7xl mx-auto px-6 py-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    onClick={handleOpenComposeDrawer}
                    className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Draft Preview</p>
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
                  <button
                    onClick={handlePublishToWordpress}
                    disabled={publishLoading || !publishResult}
                    className="px-6 py-2.5 rounded-full bg-black text-white text-sm font-semibold shadow-lg hover:bg-black/90 disabled:opacity-60 transition-colors"
                  >
                    {publishLoading ? 'Working…' : 'Publish to WordPress'}
                  </button>
                  <button
                    onClick={handleSaveDraft}
                    disabled={savingDraft || !publishResult}
                    className="px-5 py-2.5 rounded-full border border-gray-200 bg-white text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  >
                    {savingDraft ? 'Saving…' : 'Save Draft'}
                  </button>
                  <button
                    onClick={handleGenerateContent}
                    disabled={publishLoading}
                    className="px-5 py-2.5 rounded-full border border-gray-200 bg-white text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60 transition-colors"
                  >
                    {publishLoading ? 'Generating…' : publishResult ? 'Regenerate' : 'Generate'}
                  </button>
                  <button
                    onClick={handleResetDraft}
                    className="px-4 py-2 rounded-full text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
                  >
                    Reset Draft
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="h-[calc(100vh-80px)] overflow-y-auto">
            <div className="max-w-4xl mx-auto px-6 py-8">
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
                    dangerouslySetInnerHTML={{ __html: publishResult.htmlContent }}
                  />
                  <p className="text-xs text-gray-500 text-center mt-8 pt-6 border-t border-gray-100">
                    Highlight text or tap any image to open the inline AI palette.
                  </p>
                </>
              ) : (
                <div className="py-16 text-center text-sm text-gray-500">
                  <p>Generate a draft to see the immersive preview.</p>
                </div>
              )}
            </div>
          </div>

          {publishResult && publishImages.length > 0 && (
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
                          <div className="w-[360px] rounded-[24px] border border-gray-200/70 bg-white/98 p-5 shadow-2xl backdrop-blur-2xl space-y-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-xs uppercase tracking-[0.3em] text-gray-500 font-medium">
                                  Image direction
                                </p>
                                <p className="text-[10px] text-gray-400 mt-0.5">
                                  ⌘+Enter to submit • Esc to close
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
                      animation="fade"
                      duration={200}
                      offset={[0, 12]}
                      hideOnClick={false}
                      trigger="manual"
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

      <PublishHistoryTable
        entries={publishHistory}
        onRefresh={fetchPublishHistory}
        onNewDraft={handleOpenComposeDrawer}
        onResumeDraft={handleResumeDraft}
      />

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
            <div className="w-[360px] rounded-[24px] border border-gray-200/70 bg-white/98 shadow-[0_20px_60px_rgba(15,23,42,0.15)] backdrop-blur-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-gray-500 font-medium">
                    Text direction
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    ⌘+Enter to submit • Esc to close
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
              <div className="rounded-xl border border-gray-200/50 bg-gray-50/50 p-3">
                <p className="text-xs text-gray-500 mb-1.5">Selected text:</p>
                <p className="text-sm text-gray-900 font-light leading-relaxed line-clamp-2">
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
    </div>
  );
};

export default PublishExperience;


