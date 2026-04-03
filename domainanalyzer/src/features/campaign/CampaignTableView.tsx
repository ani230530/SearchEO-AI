import React, { useEffect, useMemo, useState } from 'react';
import type { CampaignStructure, GenerationPageStatus, Keyword, Topic } from '../../types';
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Eye,
  FileText,
  FolderOpen,
  Layers,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Target,
  Trash2,
  Wand2,
  Zap,
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

type DraftStatusMap = Map<number, { isPublished: boolean; isFailed?: boolean; publishedUrl?: string; draftId?: number; error?: string }>;
type StatusFilter = 'all' | 'generating' | 'draft' | 'published' | 'failed' | 'idle';
type PageTypeFilter = 'all' | 'pillar' | 'subpage';
type PageType = 'pillar' | 'subpage';

interface PageRow {
  id: number;
  title: string;
  type: PageType;
  topicId: number;
  topicTitle: string;
  keywords: Keyword[];
  publishStatus?: string;
  liveUrl?: string;
  topic: Topic;
}

interface TopicMetrics {
  totalPages: number;
  totalKeywords: number;
  generating: number;
  draft: number;
  published: number;
  failed: number;
}

interface DerivedPageState {
  key: StatusFilter;
  label: string;
  message: string;
  updatedAt: string | null;
  isDelayed: boolean;
  liveUrl: string | null;
  draftId?: number;
  hasProgress: boolean;
  progress: number;
  phase?: string | null;
}

interface CampaignTableViewProps {
  campaignStructure: CampaignStructure;
  selectedTopicId: number | null;
  onSelectTopic: (topicId: number) => void;
  renderStatusPill: (pageId?: number) => React.ReactNode;
  generationJobs: Map<number, GenerationPageStatus>;
  draftStatuses: DraftStatusMap;
  onGenerateTopic: (topic: Topic) => void;
  onUpdatePageTitle: (pageId: number, title: string) => Promise<void>;
  onDeleteSubPage: (subPageId: number) => void;
  onDeletePillarPage: (topicId: number) => void;
  onDeleteTopic: (topicId: number, topicTitle: string) => void;
  onCreatePillar: (topicId: number) => void;
  onGenerateAiPillar: (topicId: number) => void;
  onAddSubPage: (topicId: number) => void;
  onGenerateAiSubPage: (topicId: number) => void;
  onAddKeyword: (type: PageType, topicId: number, pageId: number, isAI: boolean, keywordType?: 'primary' | 'longtail') => void;
  onDeleteKeyword: (context: { type: PageType; topicId: number; pageId: number }, keywordId: number) => void;
  onSelectPrimaryKeyword: (keywordId: number) => Promise<void>;
  onSelectLongtailKeyword: (keywordId: number) => Promise<void>;
  onDeselectKeyword: (keywordId: number) => Promise<void>;
  aiLoading: string | null;
}

const sortKeywords = (keywords: Keyword[]) =>
  [...keywords].sort((a, b) => {
    if (a.aiMetadata?.isPrimary) return -1;
    if (b.aiMetadata?.isPrimary) return 1;
    if (a.aiMetadata?.isLongtail) return -1;
    if (b.aiMetadata?.isLongtail) return 1;
    return 0;
  });

const getKeywordTone = (keyword: Keyword) => {
  if (keyword.aiMetadata?.isPrimary) return 'bg-black text-white border-black';
  if (keyword.aiMetadata?.isLongtail) return 'bg-blue-50 text-blue-700 border-blue-100';
  return 'bg-white text-gray-600 border-gray-200';
};

export const CampaignTableView: React.FC<CampaignTableViewProps> = ({
  campaignStructure,
  selectedTopicId,
  onSelectTopic,
  renderStatusPill,
  generationJobs,
  draftStatuses,
  onGenerateTopic,
  onUpdatePageTitle,
  onDeleteSubPage,
  onDeletePillarPage,
  onDeleteTopic,
  onCreatePillar,
  onGenerateAiPillar,
  onAddSubPage,
  onGenerateAiSubPage,
  onAddKeyword,
  onDeleteKeyword,
  onSelectPrimaryKeyword,
  onSelectLongtailKeyword,
  onDeselectKeyword,
  aiLoading,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<PageTypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [expandedTopics, setExpandedTopics] = useState<Set<number>>(new Set());
  const [expandedKeywordRows, setExpandedKeywordRows] = useState<Set<number>>(new Set());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (campaignStructure.topics.length === 0) {
      setExpandedTopics(new Set());
      return;
    }

    const firstTopicId = selectedTopicId && campaignStructure.topics.some((topic) => topic.id === selectedTopicId)
      ? selectedTopicId
      : campaignStructure.topics[0].id;

    setExpandedTopics(new Set([firstTopicId]));
  }, [campaignStructure.topics, selectedTopicId]);

  const topicOrder = useMemo(() => {
    const topics = [...campaignStructure.topics];
    if (!selectedTopicId) return topics;
    return topics.sort((a, b) => {
      if (a.id === selectedTopicId) return -1;
      if (b.id === selectedTopicId) return 1;
      return a.title.localeCompare(b.title);
    });
  }, [campaignStructure.topics, selectedTopicId]);

  const pageStateFor = (row: PageRow): DerivedPageState => {
    const draftStatus = draftStatuses.get(row.id);
    const jobStatus = generationJobs.get(row.id);
    const updatedAt = draftStatus?.isPublished ? jobStatus?.updatedAt ?? null : jobStatus?.updatedAt ?? null;
    const lastUpdatedAt = updatedAt ? new Date(updatedAt).getTime() : null;
    const isDelayed = (jobStatus?.status === 'generating' || jobStatus?.status === 'pending') && lastUpdatedAt !== null && now - lastUpdatedAt >= 7 * 60 * 1000;
    const liveUrl =
      draftStatus?.publishedUrl ||
      (jobStatus?.status === 'published' ? jobStatus.wordpressUrl || null : null) ||
      (row.publishStatus === 'published' ? row.liveUrl || null : null);

    if ((draftStatus?.isPublished || jobStatus?.status === 'published' || row.publishStatus === 'published') && liveUrl) {
      return {
        key: 'published',
        label: 'Published',
        message: 'Live page is available.',
        updatedAt,
        isDelayed: false,
        liveUrl,
        draftId: draftStatus?.draftId || jobStatus?.draftId,
        hasProgress: false,
        progress: 100,
        phase: jobStatus?.phase ?? null,
      };
    }

    if (draftStatus?.isFailed || jobStatus?.status === 'failed') {
      return {
        key: 'failed',
        label: 'Failed',
        message: jobStatus?.error || draftStatus?.error || 'Generation stopped before content was returned.',
        updatedAt,
        isDelayed: false,
        liveUrl: null,
        draftId: draftStatus?.draftId || jobStatus?.draftId,
        hasProgress: false,
        progress: Math.max(jobStatus?.progress || 0, 10),
        phase: jobStatus?.phase ?? null,
      };
    }

    if (jobStatus?.status === 'completed' || jobStatus?.hasHtml) {
      return {
        key: 'draft',
        label: 'Draft ready',
        message: 'Draft ready for review.',
        updatedAt,
        isDelayed: false,
        liveUrl: null,
        draftId: draftStatus?.draftId || jobStatus?.draftId,
        hasProgress: false,
        progress: 100,
        phase: jobStatus?.phase ?? null,
      };
    }

    if (jobStatus?.status === 'generating' || jobStatus?.status === 'pending') {
      return {
        key: 'generating',
        label: isDelayed ? 'Delayed' : jobStatus.status === 'pending' ? 'Queued' : 'Generating',
        message: isDelayed
          ? 'Still working. Updates are taking longer than usual.'
          : jobStatus.error || (jobStatus.status === 'pending' ? 'Queued for generation.' : 'Preparing your content generation...'),
        updatedAt,
        isDelayed,
        liveUrl: null,
        draftId: draftStatus?.draftId || jobStatus?.draftId,
        hasProgress: true,
        progress: Math.max(jobStatus?.progress || 0, 6),
        phase: jobStatus?.phase ?? null,
      };
    }

    return {
      key: 'idle',
      label: row.type === 'pillar' ? 'Ready for setup' : 'Ready',
      message: row.keywords.length > 0 ? 'Ready for generation.' : 'Add keywords to prepare this page.',
      updatedAt: null,
      isDelayed: false,
      liveUrl: null,
      hasProgress: false,
      progress: 0,
      phase: null,
    };
  };

  const groupedTopics = useMemo(() => {
    return topicOrder
      .map((topic) => {
        const rows: PageRow[] = [
          ...(topic.pillarPage
            ? [{
                id: topic.pillarPage.id,
                title: topic.pillarPage.title,
                type: 'pillar' as const,
                topicId: topic.id,
                topicTitle: topic.title,
                keywords: topic.pillarPage.keywords || [],
                publishStatus: topic.pillarPage.publishStatus,
                liveUrl: topic.pillarPage.liveUrl,
                topic,
              }]
            : []),
          ...topic.subPages.map((subPage) => ({
            id: subPage.id,
            title: subPage.title,
            type: 'subpage' as const,
            topicId: topic.id,
            topicTitle: topic.title,
            keywords: subPage.keywords || [],
            publishStatus: subPage.publishStatus,
            liveUrl: subPage.liveUrl,
            topic,
          })),
        ];

        const filteredRows = rows.filter((row) => {
          const matchesQuery =
            !searchQuery ||
            row.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            topic.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            row.keywords.some((keyword) => keyword.term.toLowerCase().includes(searchQuery.toLowerCase()));
          const matchesType = filterType === 'all' || row.type === filterType;
          const state = pageStateFor(row);
          const matchesStatus = statusFilter === 'all' || state.key === statusFilter;
          return matchesQuery && matchesType && matchesStatus;
        });

        const hasTopicMatch = !searchQuery || topic.title.toLowerCase().includes(searchQuery.toLowerCase());
        const shouldRender = hasTopicMatch || filteredRows.length > 0 || (!topic.pillarPage && filterType !== 'subpage' && statusFilter === 'all');

        if (!shouldRender) return null;

        const allRows = rows.map((row) => ({ row, state: pageStateFor(row) }));
        const metrics = allRows.reduce<TopicMetrics>(
          (acc, item) => {
            acc.totalPages += 1;
            acc.totalKeywords += item.row.keywords.length;
            acc[item.state.key] += 1;
            return acc;
          },
          { totalPages: 0, totalKeywords: 0, generating: 0, draft: 0, published: 0, failed: 0, idle: 0 }
        );

        return {
          topic,
          filteredRows,
          metrics,
        };
      })
      .filter(Boolean) as Array<{ topic: Topic; filteredRows: PageRow[]; metrics: TopicMetrics }>;
  }, [topicOrder, searchQuery, filterType, statusFilter, generationJobs, draftStatuses, now]);

  const summary = useMemo(() => {
    return groupedTopics.reduce(
      (acc, group) => {
        acc.topics += 1;
        acc.pages += group.metrics.totalPages;
        acc.draft += group.metrics.draft;
        acc.failed += group.metrics.failed;
        return acc;
      },
      { topics: 0, pages: 0, draft: 0, failed: 0 }
    );
  }, [groupedTopics]);

  const toggleTopic = (topicId: number) => {
    setExpandedTopics((prev) => {
      const next = new Set(prev);
      if (next.has(topicId)) next.delete(topicId);
      else next.add(topicId);
      return next;
    });
  };

  const toggleKeywordRow = (pageId: number) => {
    setExpandedKeywordRows((prev) => {
      const next = new Set(prev);
      if (next.has(pageId)) next.delete(pageId);
      else next.add(pageId);
      return next;
    });
  };

  const handleStartEdit = (row: PageRow) => {
    setEditingId(row.id);
    setEditValue(row.title);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editValue.trim() || isUpdating) return;
    setIsUpdating(true);
    try {
      await onUpdatePageTitle(editingId, editValue.trim());
      setEditingId(null);
      setEditValue('');
    } finally {
      setIsUpdating(false);
    }
  };

  const renderKeywordChip = (row: PageRow, keyword: Keyword) => (
    <DropdownMenu key={keyword.id}>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
            getKeywordTone(keyword)
          )}
        >
          {keyword.term}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44 rounded-2xl border-gray-200 shadow-xl">
        {!keyword.aiMetadata?.isPrimary && (
          <DropdownMenuItem onClick={() => onSelectPrimaryKeyword(keyword.id)} className="text-xs">
            Set as Primary
          </DropdownMenuItem>
        )}
        {!keyword.aiMetadata?.isLongtail && (
          <DropdownMenuItem onClick={() => onSelectLongtailKeyword(keyword.id)} className="text-xs">
            Set as Longtail
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => onDeselectKeyword(keyword.id)} className="text-xs">
          Reset Role
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onDeleteKeyword({ type: row.type, topicId: row.topicId, pageId: row.id }, keyword.id)}
          className="text-xs text-red-600 focus:text-red-600"
        >
          Delete Keyword
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="h-full overflow-y-auto bg-[#fbfbfc]">
      <div className="sticky top-0 z-20 border-b border-gray-200/80 bg-white/95 backdrop-blur-xl">
        <div className="mx-auto max-w-[1440px] px-8 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-light tracking-tight text-gray-900">Campaign Table</h2>
              <p className="mt-1 text-sm text-gray-500">Topic-grouped workspace for pages, keywords, progress, and actions.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-gray-600">{summary.topics} topics</span>
              <span className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-gray-600">{summary.pages} pages</span>
              <span className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-gray-600">{summary.draft} drafts ready</span>
              <span className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-gray-600">{summary.failed} failed</span>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search topics, pages, or keywords..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="w-80 rounded-2xl border border-gray-200 bg-gray-50 pl-10 pr-4 py-2.5 text-sm outline-none transition focus:border-gray-300 focus:bg-white"
                />
              </div>
              <div className="flex rounded-2xl border border-gray-200 bg-white p-1">
                {(['all', 'pillar', 'subpage'] as PageTypeFilter[]).map((value) => (
                  <button
                    key={value}
                    onClick={() => setFilterType(value)}
                    className={cn(
                      'rounded-xl px-3 py-1.5 text-xs font-medium transition-colors',
                      filterType === value ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900'
                    )}
                  >
                    {value === 'all' ? 'All pages' : value === 'pillar' ? 'Pillars' : 'Sub-pages'}
                  </button>
                ))}
              </div>
              <div className="flex rounded-2xl border border-gray-200 bg-white p-1">
                {(['all', 'generating', 'draft', 'published', 'failed'] as StatusFilter[]).map((value) => (
                  <button
                    key={value}
                    onClick={() => setStatusFilter(value)}
                    className={cn(
                      'rounded-xl px-3 py-1.5 text-xs font-medium transition-colors',
                      statusFilter === value ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900'
                    )}
                  >
                    {value === 'all' ? 'All status' : value}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setExpandedTopics(new Set(campaignStructure.topics.map((topic) => topic.id)))}
                className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                Expand all
              </button>
              <button
                onClick={() => setExpandedTopics(new Set())}
                className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                Collapse all
              </button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-[minmax(320px,1.6fr)_minmax(280px,1.2fr)_180px_220px] gap-4 px-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400">
            <div>Structure</div>
            <div>Keywords</div>
            <div>Status</div>
            <div className="text-right">Actions</div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1440px] px-8 py-6">
        <div className="space-y-4">
          {groupedTopics.map(({ topic, filteredRows, metrics }) => {
            const isExpanded = expandedTopics.has(topic.id);

            return (
              <section key={topic.id} className="overflow-hidden rounded-[28px] border border-gray-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                <div className="grid grid-cols-[minmax(320px,1.6fr)_minmax(280px,1.2fr)_180px_220px] items-center gap-4 px-5 py-4">
                  <button onClick={() => toggleTopic(topic.id)} className="flex min-w-0 items-center gap-3 text-left">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-gray-500">
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-[15px] font-medium text-gray-900">{topic.title}</p>
                        <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-gray-500">
                          Topic
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                        <span>{topic.pillarPage ? 'Pillar ready' : 'Pillar missing'}</span>
                        <span className="h-1 w-1 rounded-full bg-gray-300" />
                        <span>{topic.subPages.length} sub-pages</span>
                        <span className="h-1 w-1 rounded-full bg-gray-300" />
                        <span>{metrics.totalKeywords} keywords mapped</span>
                      </div>
                    </div>
                  </button>

                  <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                    <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1">{metrics.generating} generating</span>
                    <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1">{metrics.draft} drafts</span>
                    <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1">{metrics.published} published</span>
                    <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1">{metrics.failed} failed</span>
                  </div>

                  <div className="text-sm text-gray-500">{metrics.totalPages} pages</div>

                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => onGenerateTopic(topic)}
                      className="inline-flex items-center gap-2 rounded-full bg-black px-3.5 py-2 text-xs font-medium text-white hover:bg-black/90"
                    >
                      <Zap className="h-3.5 w-3.5" />
                      Generate
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="rounded-full border border-gray-200 p-2 text-gray-500 hover:bg-gray-50">
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52 rounded-2xl border-gray-200 shadow-xl">
                        <DropdownMenuItem onClick={() => onSelectTopic(topic.id)} className="text-xs">
                          <FolderOpen className="mr-2 h-3.5 w-3.5" />
                          Open in detail view
                        </DropdownMenuItem>
                        {!topic.pillarPage && (
                          <>
                            <DropdownMenuItem onClick={() => onCreatePillar(topic.id)} className="text-xs">
                              <Plus className="mr-2 h-3.5 w-3.5" />
                              Add pillar manually
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onGenerateAiPillar(topic.id)} className="text-xs text-blue-600 focus:text-blue-600">
                              <Sparkles className="mr-2 h-3.5 w-3.5" />
                              Generate pillar with AI
                            </DropdownMenuItem>
                          </>
                        )}
                        {topic.pillarPage && (
                          <>
                            <DropdownMenuItem onClick={() => onAddSubPage(topic.id)} className="text-xs">
                              <Plus className="mr-2 h-3.5 w-3.5" />
                              Add sub-page
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onGenerateAiSubPage(topic.id)} className="text-xs text-blue-600 focus:text-blue-600">
                              <Sparkles className="mr-2 h-3.5 w-3.5" />
                              Generate sub-page with AI
                            </DropdownMenuItem>
                          </>
                        )}
                        <DropdownMenuItem onClick={() => onDeleteTopic(topic.id, topic.title)} className="text-xs text-red-600 focus:text-red-600">
                          <Trash2 className="mr-2 h-3.5 w-3.5" />
                          Delete topic
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-100 bg-[#fcfcfd]">
                    {!topic.pillarPage && (
                      <div className="grid grid-cols-[minmax(320px,1.6fr)_minmax(280px,1.2fr)_180px_220px] items-center gap-4 px-5 py-4">
                        <div className="pl-12">
                          <p className="text-sm font-medium text-gray-900">No pillar page yet</p>
                          <p className="mt-1 text-xs text-gray-500">Create the main page before building out sub-pages.</p>
                        </div>
                        <div />
                        <div className="text-xs text-gray-400">Setup required</div>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => onCreatePillar(topic.id)}
                            className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                          >
                            Add Pillar Manually
                          </button>
                          <button
                            onClick={() => onGenerateAiPillar(topic.id)}
                            className="inline-flex items-center gap-2 rounded-full bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-black/90"
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            Generate Pillar with AI
                          </button>
                        </div>
                      </div>
                    )}

                    {filteredRows.map((row) => {
                      const state = pageStateFor(row);
                      const isKeywordsExpanded = expandedKeywordRows.has(row.id);
                      const sorted = sortKeywords(row.keywords);
                      const previewKeywords = sorted.slice(0, 3);
                      const remainingKeywords = Math.max(0, sorted.length - previewKeywords.length);

                      return (
                        <React.Fragment key={`${row.type}-${row.id}`}>
                          <div className="grid grid-cols-[minmax(320px,1.6fr)_minmax(280px,1.2fr)_180px_220px] items-center gap-4 border-t border-gray-100 px-5 py-4">
                            <div className="pl-12">
                              <div className="flex items-center gap-3">
                                <span className={cn(
                                  'flex h-9 w-9 items-center justify-center rounded-2xl',
                                  row.type === 'pillar' ? 'bg-black text-white' : 'bg-gray-100 text-gray-500'
                                )}>
                                  {row.type === 'pillar' ? <Layers className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                                </span>
                                <div className="min-w-0 flex-1">
                                  {editingId === row.id ? (
                                    <div className="flex items-center gap-2">
                                      <input
                                        autoFocus
                                        value={editValue}
                                        onChange={(event) => setEditValue(event.target.value)}
                                        onKeyDown={(event) => {
                                          if (event.key === 'Enter') handleSaveEdit();
                                          if (event.key === 'Escape') {
                                            setEditingId(null);
                                            setEditValue('');
                                          }
                                        }}
                                        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-300"
                                      />
                                      <button onClick={handleSaveEdit} disabled={isUpdating} className="rounded-full border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50">
                                        Save
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <p className="truncate text-sm font-medium text-gray-900">{row.title}</p>
                                      <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-gray-500">
                                        {row.type === 'pillar' ? 'Pillar' : 'Sub-page'}
                                      </span>
                                      <button onClick={() => handleStartEdit(row)} className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                                        <Pencil className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  )}
                                  <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                                    <span>{state.label}</span>
                                    {state.phase ? (
                                      <>
                                        <span className="h-1 w-1 rounded-full bg-gray-300" />
                                        <span>{state.phase}</span>
                                      </>
                                    ) : null}
                                    {state.updatedAt ? (
                                      <>
                                        <span className="h-1 w-1 rounded-full bg-gray-300" />
                                        <span>{new Date(state.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                                      </>
                                    ) : null}
                                  </div>
                                  <p className="mt-1 text-xs text-gray-500">{state.message}</p>
                                  {state.hasProgress && (
                                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-gray-200">
                                      <div
                                        className={cn('h-full rounded-full bg-black transition-all duration-500', state.key === 'generating' ? 'animate-pulse' : '')}
                                        style={{ width: `${Math.min(100, state.progress)}%` }}
                                      />
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div>
                              <div className="flex flex-wrap gap-2">
                                {previewKeywords.map((keyword) => renderKeywordChip(row, keyword))}
                                {remainingKeywords > 0 && (
                                  <button
                                    onClick={() => toggleKeywordRow(row.id)}
                                    className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-500 hover:bg-gray-50"
                                  >
                                    +{remainingKeywords} more
                                  </button>
                                )}
                                {!row.keywords.length && <span className="text-xs text-gray-400">No keywords yet</span>}
                              </div>
                              <div className="mt-2 flex items-center gap-2">
                                <button
                                  onClick={() => toggleKeywordRow(row.id)}
                                  className="text-xs font-medium text-gray-500 hover:text-gray-900"
                                >
                                  {isKeywordsExpanded ? 'Hide keyword actions' : 'Manage keywords'}
                                </button>
                                <span className="h-1 w-1 rounded-full bg-gray-300" />
                                <button
                                  onClick={() => onAddKeyword(row.type, row.topicId, row.id, true, 'longtail')}
                                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                                >
                                  <Sparkles className="h-3.5 w-3.5" />
                                  {aiLoading === `keyword-${row.id}` ? 'Suggesting...' : 'AI suggest'}
                                </button>
                              </div>
                            </div>

                            <div className="flex flex-col items-start gap-2">
                              {renderStatusPill(row.id)}
                              {state.draftId ? (
                                <span className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] text-gray-500">
                                  Draft #{state.draftId}
                                </span>
                              ) : null}
                            </div>

                            <div className="flex items-center justify-end gap-2">
                              {state.liveUrl ? (
                                <a
                                  href={state.liveUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                  Live
                                </a>
                              ) : state.key === 'failed' ? (
                                <button
                                  onClick={() => onGenerateTopic(row.topic)}
                                  className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                                >
                                  <AlertCircle className="h-3.5 w-3.5" />
                                  Retry
                                </button>
                              ) : (
                                <button
                                  onClick={() => onSelectTopic(row.topicId)}
                                  className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                  View
                                </button>
                              )}

                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button className="rounded-full border border-gray-200 p-2 text-gray-500 hover:bg-gray-50">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-52 rounded-2xl border-gray-200 shadow-xl">
                                  <DropdownMenuItem onClick={() => onSelectTopic(row.topicId)} className="text-xs">
                                    <FolderOpen className="mr-2 h-3.5 w-3.5" />
                                    Open in detail view
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => onGenerateTopic(row.topic)} className="text-xs">
                                    <Zap className="mr-2 h-3.5 w-3.5" />
                                    Generate topic content
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleStartEdit(row)} className="text-xs">
                                    <Pencil className="mr-2 h-3.5 w-3.5" />
                                    Edit title
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => {
                                      if (row.type === 'pillar') onDeletePillarPage(row.topicId);
                                      else onDeleteSubPage(row.id);
                                    }}
                                    className="text-xs text-red-600 focus:text-red-600"
                                  >
                                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                                    Delete page
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>

                          {isKeywordsExpanded && (
                            <div className="grid grid-cols-[minmax(320px,1.6fr)_minmax(280px,1.2fr)_180px_220px] gap-4 border-t border-gray-100 bg-white px-5 py-4">
                              <div className="pl-12 text-xs text-gray-500">
                                Keyword actions
                              </div>
                              <div className="col-span-3 flex flex-wrap items-center gap-2">
                                {sorted.map((keyword) => renderKeywordChip(row, keyword))}
                                <button
                                  onClick={() => onAddKeyword(row.type, row.topicId, row.id, false, 'primary')}
                                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                  Add keyword
                                </button>
                                <button
                                  onClick={() => onAddKeyword(row.type, row.topicId, row.id, true, 'longtail')}
                                  className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50"
                                >
                                  <Wand2 className="h-3.5 w-3.5" />
                                  {aiLoading === `keyword-${row.id}` ? 'Suggesting...' : 'AI suggest'}
                                </button>
                                {!sorted.length && (
                                  <span className="text-xs text-gray-400">No keywords assigned yet.</span>
                                )}
                              </div>
                            </div>
                          )}
                        </React.Fragment>
                      );
                    })}

                    {topic.pillarPage && (
                      <div className="grid grid-cols-[minmax(320px,1.6fr)_minmax(280px,1.2fr)_180px_220px] items-center gap-4 border-t border-gray-100 px-5 py-4">
                        <div className="pl-12">
                          <p className="text-sm font-medium text-gray-900">Add the next sub-page</p>
                          <p className="mt-1 text-xs text-gray-500">Keep building out the topic cluster from this table.</p>
                        </div>
                        <div />
                        <div className="text-xs text-gray-400">Sub-page actions</div>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => onAddSubPage(topic.id)}
                            className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                          >
                            Add Sub-page
                          </button>
                          <button
                            onClick={() => onGenerateAiSubPage(topic.id)}
                            className="inline-flex items-center gap-2 rounded-full bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-black/90"
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            Generate Sub-page with AI
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })}

          {groupedTopics.length === 0 && (
            <div className="rounded-[28px] border border-gray-200 bg-white px-6 py-16 text-center shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-gray-400">
                <Search className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-medium text-gray-900">No matching topics or pages</h3>
              <p className="mt-2 text-sm text-gray-500">Try clearing filters or searching for a different keyword or topic title.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CampaignTableView;
