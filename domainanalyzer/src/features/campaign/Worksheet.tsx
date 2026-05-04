import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowUpDown,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  Command,
  Download,
  Feather,
  Filter,
  FolderOpen,
  Loader2,
  Plus,
  Radio,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  WorksheetTopic,
  WorksheetKeyword,
  GenerationJob,
  fetchCampaignTopics,
  createTopic,
  aiSuggestTopic,
  aiSuggestTopicTitle,
  aiSuggestTopicKeywords,
  updateTopicTitle,
  deleteTopic,
  addTopicKeyword,
  selectPrimaryKeyword,
  selectLongtailKeyword,
  deleteKeyword,
  updateKeywordTerm,
  publishDraft,
  resolveRowState,
  subscribeGenerationUpdates,
} from './api';
import WorksheetGenerateDrawer from './WorksheetGenerateDrawer';
import InlineEditable from './InlineEditable';
import { RowStatus, RowAction } from './WorksheetRowState';

type WorksheetColumnKey = 'topic' | 'keywords' | 'status' | 'action' | 'more';

interface WorksheetProps {
  campaignId: number;
  /** Bubbled to the dashboard so the click on a row's "Draft Blog" action
   *  opens the dashboard-level draft overlay with the draft preloaded. The
   *  worksheet "Publish" button doesn't route through here — it fires the
   *  publish action directly without the overlay. */
  onOpenDraftInPublish?: (draftId: number) => void;
  /** SSE-driven map of draftId → publish status. The dashboard already
   *  tracks this for the embedded PublishExperience; we forward it so
   *  the worksheet row can flip into a `publishing` state in lockstep
   *  with the actual server-side publish. */
  sharedPublishStatuses?: Map<
    number,
    {
      status: 'generating' | 'published' | 'failed';
      publishedUrl?: string;
      error?: string;
      updatedAt?: string;
    }
  >;
}

export default function Worksheet({
  campaignId,
  onOpenDraftInPublish,
  sharedPublishStatuses,
}: WorksheetProps) {
  const [topics, setTopics] = useState<WorksheetTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyTopicId, setBusyTopicId] = useState<number | null>(null);
  const [aiSuggestingTopicForRow, setAiSuggestingTopicForRow] = useState<number | null>(null);
  const [aiSuggestingKeywordsForRow, setAiSuggestingKeywordsForRow] = useState<number | null>(null);
  const [aiSuggestingNewTopic, setAiSuggestingNewTopic] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [topicForGenerate, setTopicForGenerate] = useState<WorksheetTopic | null>(null);
  /** Set briefly between an "Open draft" click and the dashboard switching
   *  tabs, so the row's action button shows its own loading state. */
  const [openingDraftRowId, setOpeningDraftRowId] = useState<number | null>(null);
  /** Topics whose Publish button has been clicked. The row stays in the
   *  `publishing` row-state until either:
   *    - the SSE layer confirms a terminal status for that draft
   *      (sharedPublishStatuses → 'published' | 'failed'), or
   *    - a structure refetch surfaces topic.publishStatus = 'published'.
   *  Optimistic for instant feedback; SSE for accuracy. */
  const [optimisticPublishingTopicIds, setOptimisticPublishingTopicIds] = useState<
    Set<number>
  >(new Set());

  const [search, setSearch] = useState('');
  const [openColumnMenu, setOpenColumnMenu] = useState<WorksheetColumnKey | null>(null);
  const [columnLabels, setColumnLabels] = useState<Record<WorksheetColumnKey, string>>({
    topic: 'Topic',
    keywords: 'Keywords',
    status: 'Status',
    action: 'Action',
    more: 'More',
  });
  const [columnVisibility, setColumnVisibility] = useState<Record<WorksheetColumnKey, boolean>>({
    topic: true,
    keywords: true,
    status: true,
    action: true,
    more: true,
  });
  const [renameColumnKey, setRenameColumnKey] = useState<WorksheetColumnKey | null>(null);
  const [renameColumnValue, setRenameColumnValue] = useState('');

  // Modal state
  // Topic title is edited inline via <InlineEditable>; no modal state needed.
  const [keywordEditor, setKeywordEditor] = useState<{
    topicId: number;
    value: string;
    /** Worksheet invariant: every keyword is either primary or longtail. */
    keywordType: 'primary' | 'longtail';
  } | null>(null);
  const [deleteRowId, setDeleteRowId] = useState<number | null>(null);
  const [keywordPopover, setKeywordPopover] = useState<{ topicId: number; keywordId: number } | null>(null);

  const importInputRef = useRef<HTMLInputElement | null>(null);

  /* ---------- Load ---------- */

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fetched = await fetchCampaignTopics(campaignId);
      setTopics(fetched);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load worksheet');
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    reload();
  }, [reload]);

  /* ---------- SSE: live job updates ---------- */

  // Merge an incoming job update into the right topic with three robustness
  // guards:
  //   1. Status-downgrade guard: never replace a terminal local state
  //      (completed | failed) with a non-terminal incoming update. Heartbeat
  //      ticks can race past terminal broadcasts; this drops them.
  //   2. Monotonicity guard: ignore updates with an older `updatedAt` than
  //      what we already have. Defensive against any reordering.
  //   3. Failure toast: when a job transitions into `failed` while the user
  //      has the worksheet open, surface it visibly — don't rely on the
  //      user noticing a row turn red.
  // Reconnect handling: if the EventSource silently drops + auto-reconnects,
  // events fired during the gap are lost. On reconnect we refetch the
  // structure (which carries the latest `job` snapshot per topic) so state
  // converges back to truth.
  useEffect(() => {
    let alive = true;
    const failureToastedJobs = new Set<string>();

    const applyJob = (job: GenerationJob) => {
      if (!alive) return;
      setTopics((prev) =>
        prev.map((t) => {
          if (t.id !== job.topicId) return t;

          const existing = t.job;
          const localTerminal =
            existing?.status === 'completed' || existing?.status === 'failed';
          const incomingTerminal =
            job.status === 'completed' || job.status === 'failed';

          // (1) downgrade guard
          if (localTerminal && !incomingTerminal) return t;

          // (2) monotonicity guard — only relevant when comparing same job.
          if (
            existing &&
            existing.jobId === job.jobId &&
            existing.updatedAt > job.updatedAt
          ) {
            return t;
          }

          return { ...t, job };
        })
      );

      // (3) toast on a freshly observed failure for this jobId.
      if (job.status === 'failed' && !failureToastedJobs.has(job.jobId)) {
        failureToastedJobs.add(job.jobId);
        setError(job.error || 'Generation failed.');
      }

      // Terminal states need a structure refetch so the row reflects the
      // newly persisted draft (latestDraft / publishStatus / draftId).
      if (job.status === 'completed' || job.status === 'failed') {
        reload();
      }
    };

    const teardown = subscribeGenerationUpdates({
      onUpdate: applyJob,
      onReconnect: () => {
        if (!alive) return;
        // Events during the disconnect window are unrecoverable from SSE;
        // refetch the structure so per-topic `job` snapshots converge.
        reload();
      },
      onError: (err) => {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[worksheet] SSE error', err);
        }
        // Don't tear down — the browser auto-reconnects. onReconnect will
        // refetch when the connection comes back up.
      },
    });

    return () => {
      alive = false;
      teardown();
    };
  }, [reload]);

  /* ---------- Publishing state reconciliation ---------- */
  // When SSE pushes a terminal publish status (or a structure refetch already
  // shows the topic as published), drop the optimistic flag so the row exits
  // the `publishing` state cleanly. Also call reload() once a terminal SSE
  // arrives so topic.publishStatus / liveUrl catch up from the DB — the live
  // SSE snapshot in `sharedPublishStatuses` covers the gap until then.
  const reloadedDraftsRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    let needsReload = false;
    setOptimisticPublishingTopicIds((prev) => {
      let next = prev;
      for (const topic of topics) {
        const draftId = topic.draftId;
        const live = draftId ? sharedPublishStatuses?.get(draftId) : undefined;
        const sseTerminal = live?.status === 'published' || live?.status === 'failed';
        const dataPublished = topic.publishStatus?.toLowerCase() === 'published';

        if (prev.has(topic.id) && (sseTerminal || dataPublished)) {
          if (next === prev) next = new Set(prev);
          next.delete(topic.id);
        }

        // Only trigger reload once per draft per terminal event so the worksheet
        // doesn't refetch in a tight loop while the SSE snapshot stays around.
        if (sseTerminal && draftId && !reloadedDraftsRef.current.has(draftId)) {
          reloadedDraftsRef.current.add(draftId);
          needsReload = true;
        }
      }
      return next === prev ? prev : next;
    });

    if (needsReload) {
      reload();
    }
  }, [topics, sharedPublishStatuses, reload]);

  /* ---------- Filtering ---------- */

  const filteredTopics = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return topics;
    return topics.filter((t) => {
      if (t.title.toLowerCase().includes(query)) return true;
      return t.keywords.some((k) => k.term.toLowerCase().includes(query));
    });
  }, [topics, search]);

  /* ---------- Mutations ---------- */

  const withBusy = async (topicId: number | null, op: () => Promise<WorksheetTopic[]>) => {
    setBusyTopicId(topicId);
    setError(null);
    try {
      const next = await op();
      setTopics(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operation failed');
    } finally {
      setBusyTopicId(null);
    }
  };

  const handleAddBlankRow = async () => {
    await withBusy(null, () => createTopic(campaignId, { title: 'Untitled topic' }));
  };

  const handleAiSuggestNewTopic = async () => {
    setAiSuggestingNewTopic(true);
    try {
      await withBusy(null, () => aiSuggestTopic(campaignId, { count: 1 }));
    } finally {
      setAiSuggestingNewTopic(false);
    }
  };

  const handleAiSuggestTopicForRow = async (topic: WorksheetTopic) => {
    setAiSuggestingTopicForRow(topic.id);
    try {
      await withBusy(topic.id, () => aiSuggestTopicTitle(topic.id));
    } finally {
      setAiSuggestingTopicForRow(null);
    }
  };

  const handleSubmitKeywordEditor = async () => {
    if (!keywordEditor) return;
    const terms = keywordEditor.value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!terms.length) return;
    const { topicId, keywordType } = keywordEditor;
    setKeywordEditor(null);

    setBusyTopicId(topicId);
    setError(null);
    try {
      let latest: WorksheetTopic[] = topics;
      for (const term of terms) {
        latest = await addTopicKeyword(topicId, { term, keywordType });
      }
      setTopics(latest);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add keyword');
    } finally {
      setBusyTopicId(null);
    }
  };

  const handleAiSuggestKeywords = async (topic: WorksheetTopic) => {
    setAiSuggestingKeywordsForRow(topic.id);
    try {
      await withBusy(topic.id, () => aiSuggestTopicKeywords(topic.id, { count: 5 }));
    } finally {
      setAiSuggestingKeywordsForRow(null);
    }
  };

  const handleSetPrimary = async (keywordId: number, topicId: number) => {
    setKeywordPopover(null);
    await withBusy(topicId, () => selectPrimaryKeyword(keywordId));
  };

  const handleSetLongtail = async (keywordId: number, topicId: number) => {
    setKeywordPopover(null);
    await withBusy(topicId, () => selectLongtailKeyword(keywordId));
  };

  const handleRemoveKeyword = async (keywordId: number, topicId: number) => {
    setKeywordPopover(null);
    await withBusy(topicId, () => deleteKeyword(keywordId));
  };

  const handleConfirmDeleteRow = async () => {
    if (deleteRowId === null) return;
    const id = deleteRowId;
    setDeleteRowId(null);
    await withBusy(id, () => deleteTopic(id));
  };

  /* ---------- Import / Export ---------- */

  const handleImportClick = () => importInputRef.current?.click();

  const handleImportFileChange: React.ChangeEventHandler<HTMLInputElement> = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setNotice('Importing...');
    setError(null);

    try {
      const text = await file.text();
      const trimmed = text.trim();
      if (!trimmed) return;

      type ImportedRow = { topic?: string; keywords?: string[] };
      let imported: ImportedRow[] = [];

      if (file.name.toLowerCase().endsWith('.json')) {
        const parsed = JSON.parse(trimmed) as ImportedRow[] | { rows?: ImportedRow[] };
        imported = Array.isArray(parsed) ? parsed : parsed.rows || [];
      } else {
        const lines = trimmed.split(/\r?\n/).filter(Boolean);
        const dataLines = lines[0]?.toLowerCase().includes('topic') ? lines.slice(1) : lines;
        imported = dataLines.map((line) => {
          const [topicPart = '', keywordsPart = ''] = line.split(',');
          return {
            topic: topicPart.trim(),
            keywords: keywordsPart.split('|').map((k) => k.trim()).filter(Boolean),
          };
        });
      }

      const valid = imported.filter((r) => r.topic && r.topic.trim());
      if (!valid.length) {
        setError('No valid rows found in import file.');
        return;
      }

      let latest: WorksheetTopic[] = topics;
      for (const row of valid) {
        latest = await createTopic(campaignId, { title: row.topic!.trim() });
        const newTopic = latest.find((t) => t.title === row.topic!.trim());
        if (newTopic && row.keywords?.length) {
          for (const kw of row.keywords) {
            latest = await addTopicKeyword(newTopic.id, { term: kw });
          }
        }
      }
      setTopics(latest);
      setNotice(`Imported ${valid.length} topic(s).`);
    } catch (err) {
      console.error('Import failed:', err);
      setError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      event.target.value = '';
    }
  };

  const handleExportData = () => {
    const payload = topics.map((t) => ({
      topic: t.title,
      keywords: t.keywords.map((k) => k.term),
      primary: t.keywords.find((k) => k.isPrimary)?.term ?? null,
      longtails: t.keywords.filter((k) => k.isLongtail).map((k) => k.term),
      status: resolveRowState(t).kind,
    }));

    const blob = new Blob([JSON.stringify({ rows: payload }, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `worksheet-export-${Date.now()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setNotice('Worksheet exported.');
  };

  /* ---------- Column UI ---------- */

  const handleOpenRenameColumn = (columnKey: WorksheetColumnKey) => {
    setRenameColumnKey(columnKey);
    setRenameColumnValue(columnLabels[columnKey]);
    setOpenColumnMenu(null);
  };

  const handleSubmitRenameColumn = () => {
    if (!renameColumnKey) return;
    const value = renameColumnValue.trim();
    if (!value) return;
    setColumnLabels((prev) => ({ ...prev, [renameColumnKey]: value }));
    setRenameColumnKey(null);
    setRenameColumnValue('');
  };

  const handleHideColumn = (columnKey: WorksheetColumnKey) => {
    const visibleCount = Object.values(columnVisibility).filter(Boolean).length;
    if (visibleCount <= 1) {
      setNotice('At least one column must remain visible.');
      setOpenColumnMenu(null);
      return;
    }
    setColumnVisibility((prev) => ({ ...prev, [columnKey]: false }));
    setOpenColumnMenu(null);
  };

  /* ---------- Render ---------- */

  return (
    <>
      <div className="w-full rounded-xl">
        <div className="px-3 sm:px-4 pt-4 pb-3 border-b border-[#d8dce4]">
          <div className="flex items-center gap-3 leading-none">
            <h2 className="text-[32px] font-medium tracking-tight text-gray-800">Worksheet</h2>
            {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
          </div>

          <div className="mt-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="flex items-center gap-5">
              <div className="relative w-full min-w-[360px]">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#818a9a]" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search topics or keywords..."
                  className="h-9 w-full rounded-md border border-[#bfc6d2] pl-9 pr-3 text-sm text-[#374252] placeholder:text-[#9aa3b2] focus:outline-none focus:ring-1 focus:ring-[#9cb0d9]"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button type="button" title="Filter" aria-label="Filter" className="inline-flex items-center gap-2 text-[#4a5568] text-sm font-medium">
                <Filter className="h-4 w-4" />
              </button>
              <button type="button" title="Sort" aria-label="Sort" className="inline-flex items-center gap-2 text-[#4a5568] text-sm font-medium">
                <ArrowUpDown className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleAiSuggestNewTopic}
                disabled={aiSuggestingNewTopic}
                className="h-9 px-3 rounded-md border border-[#909bb0] text-[#495668] text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {aiSuggestingNewTopic ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                AI Suggest Topic
              </button>
              <button
                type="button"
                onClick={handleImportClick}
                className="h-9 px-3 rounded-md border border-[#909bb0] text-[#495668] text-xs font-medium inline-flex items-center gap-1.5"
              >
                <Upload className="h-3.5 w-3.5" />
                Import
              </button>
              <button
                type="button"
                onClick={handleExportData}
                className="h-9 px-3 rounded-md border border-[#909bb0] text-[#495668] text-xs font-medium inline-flex items-center gap-1.5"
              >
                <Download className="h-4 w-4" />
                Export
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept=".json,.csv,application/json,text/csv"
                className="hidden"
                onChange={handleImportFileChange}
              />
            </div>
          </div>

          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          {!error && notice && <p className="mt-2 text-xs text-[#58667d]">{notice}</p>}
        </div>

        <div className="p-3 sm:p-4">
          <div className="overflow-auto border border-[#c8cfdb]">
            <table className="min-w-[980px] w-full">
              <thead className="bg-[#e6e8eb] border-b border-[#c8cfdb]">
                <tr className="h-10">
                  <th className="w-10 border-r border-[#c8cfdb] px-3 text-left">
                    <input type="checkbox" className="h-3.5 w-3.5 rounded border-[#8e99ad]" />
                  </th>
                  {(['topic', 'keywords', 'status', 'action', 'more'] as WorksheetColumnKey[])
                    .filter((k) => columnVisibility[k])
                    .map((k) => (
                      <th
                        key={k}
                        className={`relative border-r border-[#c8cfdb] px-4 text-left ${
                          k === 'topic' ? 'w-[240px]' : k === 'keywords' ? 'w-[460px]' : k === 'status' ? 'w-[200px]' : k === 'action' ? 'w-[220px]' : 'w-[100px] border-l border-r-0'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[#3f4f69] text-sm tracking-wide">
                          <span className="inline-flex items-center gap-1.5">
                            {columnIcon(k)}
                            {columnLabels[k]}
                          </span>
                          <button
                            type="button"
                            onClick={() => setOpenColumnMenu(openColumnMenu === k ? null : k)}
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {openColumnMenu === k && (
                          <div className="absolute right-2 top-10 z-20 w-40 rounded-md border border-gray-200 bg-white shadow-lg">
                            <button type="button" onClick={() => handleOpenRenameColumn(k)} className="block w-full px-3 py-2 text-left text-xs hover:bg-gray-50">Rename</button>
                            <button type="button" onClick={() => handleHideColumn(k)} className="block w-full px-3 py-2 text-left text-xs text-red-600 hover:bg-gray-50">Hide column</button>
                          </div>
                        )}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {!loading && filteredTopics.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-10 text-center text-sm text-gray-500">
                      No topics yet. Click <span className="font-medium">+ Add Row</span> below or <span className="font-medium">AI Suggest Topic</span> above to get started.
                    </td>
                  </tr>
                )}
                {filteredTopics.map((topic, idx) => {
                  const liveSnapshot = topic.draftId
                    ? sharedPublishStatuses?.get(topic.draftId)
                    : undefined;
                  const liveStatus = liveSnapshot?.status;
                  const isPublishing =
                    optimisticPublishingTopicIds.has(topic.id) ||
                    liveStatus === 'generating';
                  const rowState = resolveRowState(topic, {
                    isPublishing,
                    livePublishStatus: liveStatus,
                    livePublishedUrl: liveSnapshot?.publishedUrl,
                  });
                  const isBusy = busyTopicId === topic.id;

                  return (
                    <tr
                      key={topic.id}
                      className={`min-h-[86px] border-b border-[#c8cfdb] ${idx % 2 ? 'bg-[#dde3ef]' : 'bg-[#f5f6f8]'} ${isBusy ? 'opacity-70' : ''}`}
                    >
                      <td className="border-r border-[#c8cfdb] px-3 align-middle">
                        <input type="checkbox" className="h-3.5 w-3.5 rounded border-[#8e99ad]" />
                      </td>

                      {columnVisibility.topic && (
                        <td className="border-r border-[#c8cfdb] px-4 py-3 align-middle">
                          <div className="flex flex-col gap-2">
                            <InlineEditable
                              value={topic.title}
                              placeholder="+ Add topic name"
                              onCommit={(next) =>
                                withBusy(topic.id, () => updateTopicTitle(topic.id, next))
                              }
                              className="block text-left text-[15px] leading-[1.3] text-[#2b3548] hover:text-[#1e2f4f] cursor-text whitespace-pre-wrap break-words rounded-sm focus:outline-none focus:ring-2 focus:ring-[#9cb0d9]"
                              inputClassName="w-full rounded-md border border-[#9cb0d9] bg-white px-2 py-1 text-[15px] leading-[1.3] text-[#2b3548] focus:outline-none focus:ring-2 focus:ring-[#4E76C7]"
                            >
                              {(display) =>
                                topic.title ? (
                                  display
                                ) : (
                                  <span className="text-[#9aa3b2] italic">{display}</span>
                                )
                              }
                            </InlineEditable>
                            <button
                              type="button"
                              onClick={() => handleAiSuggestTopicForRow(topic)}
                              disabled={aiSuggestingTopicForRow === topic.id}
                              className="self-start inline-flex items-center gap-1 text-xs text-[#4c6fae] hover:text-[#34558e] font-medium disabled:opacity-50"
                            >
                              {aiSuggestingTopicForRow === topic.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Sparkles className="h-3 w-3" />
                              )}
                              AI Suggest
                            </button>
                          </div>
                        </td>
                      )}

                      {columnVisibility.keywords && (
                        <td className="border-r border-[#c8cfdb] px-4 py-3 align-middle">
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-3 text-xs">
                              <button
                                type="button"
                                onClick={() =>
                                  setKeywordEditor({
                                    topicId: topic.id,
                                    value: '',
                                    keywordType: topic.keywords.some((k) => k.isPrimary)
                                      ? 'longtail'
                                      : 'primary',
                                  })
                                }
                                className="text-[#354b73] hover:text-[#1e2f4f] font-medium"
                              >
                                + Add
                              </button>
                              <button
                                type="button"
                                onClick={() => handleAiSuggestKeywords(topic)}
                                disabled={aiSuggestingKeywordsForRow === topic.id}
                                className="inline-flex items-center gap-1 text-[#4c6fae] hover:text-[#34558e] font-medium disabled:opacity-50"
                              >
                                {aiSuggestingKeywordsForRow === topic.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Sparkles className="h-3 w-3" />
                                )}
                                AI Suggest
                              </button>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {topic.keywords.map((kw) => (
                                <KeywordChip
                                  key={kw.id}
                                  keyword={kw}
                                  isPopoverOpen={
                                    keywordPopover?.topicId === topic.id &&
                                    keywordPopover?.keywordId === kw.id
                                  }
                                  onTogglePopover={() =>
                                    setKeywordPopover((prev) =>
                                      prev?.keywordId === kw.id
                                        ? null
                                        : { topicId: topic.id, keywordId: kw.id }
                                    )
                                  }
                                  onSetPrimary={() => handleSetPrimary(kw.id, topic.id)}
                                  onSetLongtail={() => handleSetLongtail(kw.id, topic.id)}
                                  onRemove={() => handleRemoveKeyword(kw.id, topic.id)}
                                  onRename={(next) =>
                                    withBusy(topic.id, () => updateKeywordTerm(kw.id, next))
                                  }
                                />
                              ))}
                            </div>
                          </div>
                        </td>
                      )}

                      {columnVisibility.status && (
                        <td className="border-r border-[#c8cfdb] px-4 py-3 align-middle">
                          <RowStatus state={rowState} />
                        </td>
                      )}

                      {columnVisibility.action && (
                        <td className="border-r border-[#c8cfdb] px-4 align-middle text-center">
                          <RowAction
                            state={rowState}
                            isOpeningDraft={openingDraftRowId === topic.id}
                            handlers={{
                              onGenerate: () => setTopicForGenerate(topic),
                              onRetry: () => setTopicForGenerate(topic),
                              onOpenDraft: (draftId) => {
                                if (!onOpenDraftInPublish) {
                                  setNotice('Draft viewer not wired up at this level.');
                                  return;
                                }
                                setOpeningDraftRowId(topic.id);
                                onOpenDraftInPublish(draftId);
                                setTimeout(() => setOpeningDraftRowId(null), 350);
                              },
                              onPublishDirectly: async (draftId) => {
                                // Optimistic: flip the row into `publishing`
                                // immediately. The reconciliation effect
                                // clears it on SSE / structure terminal.
                                setOptimisticPublishingTopicIds((prev) => {
                                  if (prev.has(topic.id)) return prev;
                                  const next = new Set(prev);
                                  next.add(topic.id);
                                  return next;
                                });
                                // Direct fire — no overlay, all state lives
                                // on the row. The publish endpoint accepts
                                // just { draftId } and pulls metadata from
                                // the persisted draft. Status converges
                                // back via SSE to sharedPublishStatuses.
                                try {
                                  const result = await publishDraft(draftId);
                                  if (result.status === 'failed') {
                                    setOptimisticPublishingTopicIds((prev) => {
                                      if (!prev.has(topic.id)) return prev;
                                      const next = new Set(prev);
                                      next.delete(topic.id);
                                      return next;
                                    });
                                    setError(result.error || 'Publish failed.');
                                  }
                                } catch (err) {
                                  setOptimisticPublishingTopicIds((prev) => {
                                    if (!prev.has(topic.id)) return prev;
                                    const next = new Set(prev);
                                    next.delete(topic.id);
                                    return next;
                                  });
                                  setError(
                                    err instanceof Error
                                      ? err.message
                                      : 'Publish failed.'
                                  );
                                }
                              },
                            }}
                          />
                        </td>
                      )}

                      {columnVisibility.more && (
                        <td className="px-4 align-middle text-center">
                          <button
                            type="button"
                            onClick={() => setDeleteRowId(topic.id)}
                            className="inline-flex items-center justify-center h-8 w-8 rounded-md text-[#d14f4f] hover:bg-[#ffecec]"
                            aria-label="Delete row"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end pt-3 gap-2">
            <button
              type="button"
              onClick={handleAddBlankRow}
              className="inline-flex items-center gap-2 rounded-md border border-[#8fa1bf] px-3 py-2 text-xs font-medium text-[#2f4f89] hover:bg-[#ecf3ff]"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Row
            </button>
          </div>
        </div>
      </div>

      {/* Keyword editor modal */}
      {keywordEditor && (
        <Modal
          title={
            keywordEditor.keywordType === 'primary'
              ? 'Add primary keyword'
              : 'Add longtail keywords'
          }
          onClose={() => setKeywordEditor(null)}
        >
          <p className="text-sm text-gray-600 -mt-4 mb-4">
            Enter one or multiple keywords separated by commas.
          </p>
          <textarea
            value={keywordEditor.value}
            onChange={(e) =>
              setKeywordEditor((prev) => (prev ? { ...prev, value: e.target.value } : prev))
            }
            placeholder="e.g. seo audit tool, website seo checker, technical seo report"
            className="w-full min-h-[120px] px-4 py-3 rounded-2xl border border-gray-200 bg-gray-50 focus:ring-2 focus:ring-black focus:outline-none"
            autoFocus
          />
          <div className="flex items-center gap-3 mt-4 text-xs">
            <KeywordTypeChip
              active={keywordEditor.keywordType === 'primary'}
              onClick={() =>
                setKeywordEditor((prev) => (prev ? { ...prev, keywordType: 'primary' } : prev))
              }
              label="Primary"
            />
            <KeywordTypeChip
              active={keywordEditor.keywordType === 'longtail'}
              onClick={() =>
                setKeywordEditor((prev) => (prev ? { ...prev, keywordType: 'longtail' } : prev))
              }
              label="Longtail"
            />
          </div>
          <ModalActions
            onCancel={() => setKeywordEditor(null)}
            onConfirm={handleSubmitKeywordEditor}
            confirmLabel="Add"
          />
        </Modal>
      )}

      {/* Rename column modal */}
      {renameColumnKey !== null && (
        <Modal
          title="Rename column"
          onClose={() => {
            setRenameColumnKey(null);
            setRenameColumnValue('');
          }}
        >
          <input
            type="text"
            value={renameColumnValue}
            onChange={(e) => setRenameColumnValue(e.target.value)}
            className="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-gray-50 focus:ring-2 focus:ring-black focus:outline-none"
            placeholder="Column title"
            autoFocus
          />
          <ModalActions
            onCancel={() => {
              setRenameColumnKey(null);
              setRenameColumnValue('');
            }}
            onConfirm={handleSubmitRenameColumn}
            confirmLabel="Save"
          />
        </Modal>
      )}

      {/* Delete row confirm modal */}
      {deleteRowId !== null && (
        <Modal title="Delete topic" onClose={() => setDeleteRowId(null)}>
          <p className="text-sm text-gray-600 -mt-4 mb-4">
            This will remove the topic and its keywords. This action cannot be undone.
          </p>
          <div className="flex items-center justify-end gap-4 mt-2">
            <button
              type="button"
              onClick={() => setDeleteRowId(null)}
              className="px-6 py-3 rounded-md border border-gray-200 text-gray-700 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmDeleteRow}
              className="px-6 py-3 bg-red-600 text-white rounded-md hover:bg-red-700"
            >
              Delete
            </button>
          </div>
        </Modal>
      )}

      {/* Generate drawer */}
      <WorksheetGenerateDrawer
        topic={topicForGenerate}
        open={topicForGenerate !== null}
        onClose={() => setTopicForGenerate(null)}
        onSuccess={(job) => {
          // The job is now in flight on the server. Optimistically merge the
          // initial snapshot into the topic; SSE updates take over from here.
          setTopics((prev) =>
            prev.map((t) => (t.id === job.topicId ? { ...t, job } : t))
          );
          setNotice('Generation started. Status updates will appear inline.');
          setTopicForGenerate(null);
        }}
      />

    </>
  );
}

/* ---------- Subcomponents ---------- */

function columnIcon(key: WorksheetColumnKey) {
  switch (key) {
    case 'topic':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 20 20" fill="none">
          <path d="M10.69 1.82L17.85 5.07a.75.75 0 010 1.36L10.69 9.85a1.66 1.66 0 01-1.38 0L2.16 6.43a.75.75 0 010-1.36L9.31 1.82a1.66 1.66 0 011.38 0z" stroke="#2D4059" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M1.67 10a.75.75 0 00.48.7l7.16 3.42a1.66 1.66 0 001.38 0L17.84 10.7a.75.75 0 00.49-.7" stroke="#2D4059" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M1.67 14.17a.75.75 0 00.48.71l7.16 3.42a1.66 1.66 0 001.38 0l7.15-3.42a.75.75 0 00.49-.71" stroke="#2D4059" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'keywords':
      return <Command className="h-4 w-4 text-[#2D4059]" />;
    case 'status':
      return <Radio className="h-4 w-4 text-[#2D4059]" />;
    case 'action':
      return <Feather className="h-4 w-4 text-[#2D4059]" />;
    case 'more':
      return <FolderOpen className="h-4 w-4 text-[#2D4059]" />;
  }
}

function KeywordChip({
  keyword,
  isPopoverOpen,
  onTogglePopover,
  onSetPrimary,
  onSetLongtail,
  onRemove,
  onRename,
}: {
  keyword: WorksheetKeyword;
  isPopoverOpen: boolean;
  onTogglePopover: () => void;
  onSetPrimary: () => void;
  onSetLongtail: () => void;
  onRemove: () => void;
  /** Commit a renamed term. */
  onRename: (next: string) => void | Promise<void>;
}) {
  // Worksheet invariant: every keyword is Primary or Longtail.
  // Primary uses a saturated lavender; Longtail uses a soft tint of the same
  // hue. The chevron is the affordance for the actions popover; the term
  // itself is click-to-edit via <InlineEditable>.
  const variantClass = keyword.isPrimary
    ? 'bg-[#7281c4] border-[#7281c4] text-white hover:bg-[#6573ba]'
    : 'bg-[#dde2f5] border-[#cdd5ed] text-[#4c5a8c] hover:bg-[#d3daf0]';

  return (
    <span
      className={`relative inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors ${variantClass}`}
    >
      <InlineEditable
        value={keyword.term}
        onCommit={onRename}
        placeholder="keyword"
        className="cursor-text whitespace-nowrap focus:outline-none"
        inputClassName={`min-w-[60px] max-w-[260px] rounded-sm bg-transparent text-[12px] font-medium focus:outline-none ${
          keyword.isPrimary ? 'placeholder:text-white/50' : 'placeholder:text-[#7d87a7]'
        }`}
      />
      <button
        type="button"
        onClick={onTogglePopover}
        aria-label="Keyword actions"
        aria-haspopup="menu"
        aria-expanded={isPopoverOpen}
        className="inline-flex h-4 w-4 items-center justify-center rounded-sm hover:bg-black/10 focus:outline-none focus:ring-1 focus:ring-current"
      >
        <ChevronLeft className="h-3 w-3 shrink-0" />
      </button>

      {isPopoverOpen && (
        <span
          className="absolute left-0 top-full mt-1 z-30 min-w-[160px] rounded-md border border-gray-200 bg-white shadow-lg text-left"
          onClick={(e) => e.stopPropagation()}
        >
          {!keyword.isPrimary && (
            <button
              type="button"
              onClick={onSetPrimary}
              className="block w-full px-3 py-2 text-xs text-left hover:bg-gray-50"
            >
              Set as primary
            </button>
          )}
          {!keyword.isLongtail && (
            <button
              type="button"
              onClick={onSetLongtail}
              className="block w-full px-3 py-2 text-xs text-left hover:bg-gray-50"
            >
              Set as longtail
            </button>
          )}
          <button
            type="button"
            onClick={onRemove}
            className="block w-full px-3 py-2 text-xs text-left text-red-600 hover:bg-red-50"
          >
            Remove keyword
          </button>
        </span>
      )}
    </span>
  );
}

function KeywordTypeChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1 rounded-full border ${active ? 'bg-black text-white border-black' : 'bg-white text-gray-700 border-gray-300 hover:border-gray-500'}`}
    >
      {label}
    </button>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl mx-4 bg-white rounded-xl p-8 border border-gray-100 shadow-xl">
        <h3 className="text-xl font-light text-black tracking-tight mb-6">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function ModalActions({
  onCancel,
  onConfirm,
  confirmLabel,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel: string;
}) {
  return (
    <div className="flex items-center justify-end gap-4 mt-6">
      <button
        type="button"
        onClick={onCancel}
        className="px-6 py-3 rounded-md border border-gray-200 text-gray-700 hover:bg-gray-100"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onConfirm}
        className="px-6 py-3 bg-black text-white rounded-md hover:opacity-90"
        style={{ background: 'linear-gradient(90deg, #2D4059 0%, #4E76C7 100%)' }}
      >
        {confirmLabel}
      </button>
    </div>
  );
}
