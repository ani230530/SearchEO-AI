import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowUpDown,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  Command,
  Download,
  Eye,
  Filter,
  FolderOpen,
  Loader2,
  Plus,
  Radio,
  RefreshCw,
  RotateCw,
  Search,
  Send,
  SquarePen,
  Sparkles,
  Trash2,
  Upload,
  X,
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
import { Skeleton } from '@/components/ui/skeleton';
import {
  clearWorksheetHandoff,
  readWorksheetImportPayload,
} from '@/features/ai-results/components/WorksheetPickerModals';

type WorksheetColumnKey = 'topic' | 'keywords' | 'status' | 'action' | 'more';

type KeywordSettingsSnapshot = {
  model: string;
  maxKeywordsPerCell: string;
  language: string;
  keywordLogic: string;
};

const KEYWORD_SETTINGS_CACHE_KEY = 'worksheet-keyword-settings/v1';

const DEFAULT_KEYWORD_SETTINGS: KeywordSettingsSnapshot = {
  model: 'SearchEO.AI (Recommended)',
  maxKeywordsPerCell: '5',
  language: 'English (Widely used)',
  keywordLogic: '',
};

const loadKeywordSettings = (): KeywordSettingsSnapshot => {
  try {
    const raw = localStorage.getItem(KEYWORD_SETTINGS_CACHE_KEY);
    if (!raw) return DEFAULT_KEYWORD_SETTINGS;
    return { ...DEFAULT_KEYWORD_SETTINGS, ...(JSON.parse(raw) as Partial<KeywordSettingsSnapshot>) };
  } catch {
    return DEFAULT_KEYWORD_SETTINGS;
  }
};

const saveKeywordSettings = (snapshot: KeywordSettingsSnapshot) => {
  try {
    localStorage.setItem(KEYWORD_SETTINGS_CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    /* ignore persistence failures */
  }
};

const parseKeywordLimit = (value: string) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(1, parsed) : 5;
};

interface WorksheetProps {
  campaignId: number;
  /** Bubbled to the dashboard so the click on a row's "Draft Blog" action
   *  can open the dashboard-based draft preview in a new tab with the draft
   *  preloaded. The worksheet "Publish" button doesn't route through here —
   *  it fires the publish action directly without the overlay. */
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

  // ── Row selection (the table's checkboxes) ────────────────────────────
  //
  // Selected topic ids power the batch-action bar (Generate(N) / Publish(M)).
  // We keep the set keyed on topic.id (number) — the same identifier used
  // by every per-row handler and by SSE updates, so eligibility queries
  // are stable across structure refetches.
  const [selectedTopicIds, setSelectedTopicIds] = useState<Set<number>>(new Set());

  // ── Batch operation state ─────────────────────────────────────────────
  //
  // Single batch can be in flight at a time (running Generate AND Publish
  // concurrently would confuse the UI and double-tax the SSE channel).
  // `batchOp` discriminates which one's running so the bar can render the
  // right label. `batchProgress` drives the progress UI; `batchErrors`
  // collects failures we surface in the summary toast at the end.
  // `batchCancelRef` is a ref (not state) so the running loop can check
  // it on every iteration without being stale-closure'd.
  type BatchOp = 'generate' | 'publish';
  const [batchOp, setBatchOp] = useState<BatchOp | null>(null);
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
    label: string;
  } | null>(null);
  const [batchErrors, setBatchErrors] = useState<Array<{ topicId: number; title: string; error: string }>>([]);
  const batchCancelRef = useRef(false);
  /** Set when the user clicks Generate(N) in the batch bar. The
   *  WorksheetGenerateDrawer opens in batch mode: same form fields,
   *  but on submit the payload is fanned out across every topic in
   *  this array via runBatchGenerate. */
  const [batchTopicsForGenerate, setBatchTopicsForGenerate] = useState<
    WorksheetTopic[] | null
  >(null);

  const [search, setSearch] = useState('');
  const [sortOrder, setSortOrder] = useState<'latest' | 'oldest'>('latest');
  const [statusFilter, setStatusFilter] = useState<
    | 'all'
    | 'not-started'
    | 'in-progress'
    | 'ready'
    | 'generating'
    | 'completed'
    | 'publishing'
    | 'published'
    | 'failed'
  >('all');
  const [openColumnMenu, setOpenColumnMenu] = useState<WorksheetColumnKey | null>(null);
  const [columnLabels, setColumnLabels] = useState<Record<WorksheetColumnKey, string>>({
    topic: 'Prompt',
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
  const [columnSettingsKey, setColumnSettingsKey] = useState<WorksheetColumnKey | null>(null);
  const [promptSettings, setPromptSettings] = useState({
    model: 'SearchEO.AI (Recommended)',
    language: 'English (Widely used)',
    imageOutputPerBlog: '1',
    wordCountPerBlog: '500 - 800 words',
    promptLogic: '',
    userPromptTemplate: '',
  });
  const [keywordSettings, setKeywordSettings] = useState<KeywordSettingsSnapshot>(loadKeywordSettings);
  const selectShellClass =
    'relative rounded-md border border-[#c5ccd9] bg-white';
  const selectClass =
    'h-10 w-full appearance-none rounded-md bg-white px-3 pr-9 text-sm text-[#2f3d55] focus:outline-none focus:ring-2 focus:ring-[#8fa1bf]';

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
  const importSignatureRef = useRef<string | null>(null);

  const importInputRef = useRef<HTMLInputElement | null>(null);

  /* ---------- Load ---------- */

  const reload = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = Boolean(options?.silent);
      if (!silent) {
        setLoading(true);
      }
      setError(null);
      try {
        const fetched = await fetchCampaignTopics(campaignId);
        setTopics(fetched);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load worksheet');
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [campaignId]
  );

  useEffect(() => {
    reload({ silent: false });
  }, [reload]);

  useEffect(() => {
    if (loading) return;

    const payload = readWorksheetImportPayload();
    if (!payload) return;

    if (payload.activeWorksheetId !== String(campaignId)) {
      return;
    }

    // A stale/foreign payload (e.g. one written by a flow that doesn't
    // include selectedRows[] — like the AI Results "add opportunity to
    // worksheet" handoff before we stopped writing this key) would crash
    // here on .map(). Drop anything that doesn't look like the table-row
    // import shape and clear it so subsequent renders don't re-trip.
    if (!Array.isArray(payload.selectedRows) || payload.selectedRows.length === 0) {
      clearWorksheetHandoff();
      return;
    }

    const signature = `${payload.activeWorksheetId}:${payload.selectedRows
      .map((row) => row.id)
      .join(',')}`;
    if (importSignatureRef.current === signature) {
      return;
    }
    importSignatureRef.current = signature;

    const runImport = async () => {
      setLoading(true);
      setError(null);
      setNotice('Adding selected prompts and keywords to worksheet...');
      try {
        const rows = [...payload.selectedRows].reverse();
        const failures: string[] = [];
        let finalTopicsSnapshot: WorksheetTopic[] | null = null;

        const settled = await Promise.allSettled(
          rows.map(async (row) => {
            const seedTerm = row.primaryKeyword?.trim();
            const seedKeywords = seedTerm
              ? [
                  {
                    term: seedTerm,
                    isPrimary: true,
                    intent: row.primaryIntent?.trim() || null,
                  },
                ]
              : undefined;
            const nextTopics = await createTopic(campaignId, {
              title: row.prompt?.trim() || 'Untitled prompt',
              keywords: seedKeywords,
              source: seedKeywords ? 'AI' : 'MANUAL',
            });
            if (
              !finalTopicsSnapshot ||
              nextTopics.length >= finalTopicsSnapshot.length
            ) {
              finalTopicsSnapshot = nextTopics;
            }
          })
        );

        for (const result of settled) {
          if (result.status === 'rejected') {
            failures.push(
              result.reason instanceof Error ? result.reason.message : 'Unknown import error'
            );
          }
        }

        // Apply all imported rows together to avoid one-by-one rendering.
        if (finalTopicsSnapshot) {
          setTopics(finalTopicsSnapshot);
        } else {
          const fallbackTopics = await fetchCampaignTopics(campaignId);
          setTopics(fallbackTopics);
        }
        clearWorksheetHandoff();
        if (failures.length > 0) {
          setError(`Imported with ${failures.length} failure${failures.length === 1 ? '' : 's'}.`);
        }
        setNotice(`${payload.selectedRows.length} row${payload.selectedRows.length === 1 ? '' : 's'} added to the worksheet.`);
      } finally {
        setLoading(false);
      }
    };

    void runImport().catch((err) => {
      console.error('[worksheet] import failed', err);
      setError(err instanceof Error ? err.message : 'Failed to import worksheet rows');
      clearWorksheetHandoff();
    });
  }, [campaignId, loading, topics]);

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
        reload({ silent: true });
      }
    };

    const teardown = subscribeGenerationUpdates({
      onUpdate: applyJob,
      onReconnect: () => {
        if (!alive) return;
        // Events during the disconnect window are unrecoverable from SSE;
        // refetch the structure so per-topic `job` snapshots converge.
        reload({ silent: true });
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
      reload({ silent: true });
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

  const filteredAndSortedTopics = useMemo(() => {
    const withStatus = filteredTopics.filter((topic) => {
      if (statusFilter === 'all') return true;
      const liveSnapshot = topic.draftId
        ? sharedPublishStatuses?.get(topic.draftId)
        : undefined;
      const liveStatus = liveSnapshot?.status;
      const isPublishing =
        optimisticPublishingTopicIds.has(topic.id) || liveStatus === 'generating';
      const state = resolveRowState(topic, {
        isPublishing,
        livePublishStatus: liveStatus,
        livePublishedUrl: liveSnapshot?.publishedUrl,
      });
      return state.kind === statusFilter;
    });

    return [...withStatus].sort((a, b) =>
      sortOrder === 'latest' ? b.id - a.id : a.id - b.id
    );
  }, [
    filteredTopics,
    statusFilter,
    sortOrder,
    sharedPublishStatuses,
    optimisticPublishingTopicIds,
  ]);

  /* ---------- Selection + eligibility ---------- */
  //
  // A topic's eligibility for batch Generate / Publish derives from its
  // resolved RowState. We resolve it here using the same options the
  // per-row UI uses (optimistic publish flag + live SSE status) so the
  // batch counts agree with what the user sees in each row's status
  // column.
  //
  // Eligibility rules:
  //   Generate: row is not-started / failed / in-progress (no draft yet).
  //             generating / completed / published / publishing are skipped.
  //   Publish:  row has a draft AND isn't already publishing or published.
  //             So only kind='completed' qualifies.

  const eligibilityById = useMemo(() => {
    const map = new Map<
      number,
      { canGenerate: boolean; canPublish: boolean; topic: WorksheetTopic }
    >();
    for (const topic of filteredAndSortedTopics) {
      const liveSnapshot = topic.draftId
        ? sharedPublishStatuses?.get(topic.draftId)
        : undefined;
      const liveStatus = liveSnapshot?.status;
      const isPublishing =
        optimisticPublishingTopicIds.has(topic.id) || liveStatus === 'generating';
      const state = resolveRowState(topic, {
        isPublishing,
        livePublishStatus: liveStatus,
        livePublishedUrl: liveSnapshot?.publishedUrl,
      });
      map.set(topic.id, {
        topic,
        canGenerate:
          state.kind === 'not-started' ||
          state.kind === 'in-progress' ||
          state.kind === 'ready' ||
          state.kind === 'failed',
        canPublish: state.kind === 'completed',
      });
    }
    return map;
  }, [filteredAndSortedTopics, sharedPublishStatuses, optimisticPublishingTopicIds]);

  /** All selected topic ids that are currently visible (after filtering)
   *  AND still exist in the topics list. */
  const liveSelectedIds = useMemo(() => {
    return new Set(
      Array.from(selectedTopicIds).filter((id) => eligibilityById.has(id)),
    );
  }, [selectedTopicIds, eligibilityById]);

  const generateCandidates = useMemo(() => {
    return Array.from(liveSelectedIds)
      .map((id) => eligibilityById.get(id))
      .filter((e): e is { canGenerate: boolean; canPublish: boolean; topic: WorksheetTopic } => !!e)
      .filter((e) => e.canGenerate)
      .map((e) => e.topic);
  }, [liveSelectedIds, eligibilityById]);

  const publishCandidates = useMemo(() => {
    return Array.from(liveSelectedIds)
      .map((id) => eligibilityById.get(id))
      .filter((e): e is { canGenerate: boolean; canPublish: boolean; topic: WorksheetTopic } => !!e)
      .filter((e) => e.canPublish)
      .map((e) => e.topic);
  }, [liveSelectedIds, eligibilityById]);

  // Header checkbox: indeterminate when SOME (but not all) filtered rows
  // are selected; checked when all are.
  const allFilteredIds = useMemo(
    () => filteredAndSortedTopics.map((t) => t.id),
    [filteredAndSortedTopics],
  );
  const headerCheckboxState: 'checked' | 'unchecked' | 'indeterminate' = useMemo(() => {
    if (allFilteredIds.length === 0) return 'unchecked';
    const selectedFromFiltered = allFilteredIds.filter((id) => selectedTopicIds.has(id)).length;
    if (selectedFromFiltered === 0) return 'unchecked';
    if (selectedFromFiltered === allFilteredIds.length) return 'checked';
    return 'indeterminate';
  }, [allFilteredIds, selectedTopicIds]);

  const toggleSelectAll = () => {
    setSelectedTopicIds((prev) => {
      const next = new Set(prev);
      if (headerCheckboxState === 'checked') {
        // Clear all visible.
        for (const id of allFilteredIds) next.delete(id);
      } else {
        // Select all visible. Preserves any selections outside the filter.
        for (const id of allFilteredIds) next.add(id);
      }
      return next;
    });
  };

  const toggleRowSelection = (topicId: number) => {
    setSelectedTopicIds((prev) => {
      const next = new Set(prev);
      if (next.has(topicId)) next.delete(topicId);
      else next.add(topicId);
      return next;
    });
  };

  const clearSelection = () => setSelectedTopicIds(new Set());

  /* ---------- Batch operations ---------- */

  // Wait for a topic's generation job to reach a terminal state. Polls
  // `topics` via a ref so the resolver sees the latest SSE-driven updates
  // without re-creating the subscription. Resolves to 'completed' / 'failed'
  // / 'cancelled' (the last when the user hit Cancel mid-queue).
  const topicsRef = useRef<WorksheetTopic[]>(topics);
  useEffect(() => {
    topicsRef.current = topics;
  }, [topics]);

  const waitForGenerationTerminal = useCallback(
    (topicId: number, timeoutMs = 5 * 60_000): Promise<'completed' | 'failed' | 'cancelled' | 'timeout'> => {
      return new Promise((resolve) => {
        const startedAt = Date.now();
        const tick = () => {
          if (batchCancelRef.current) return resolve('cancelled');
          if (Date.now() - startedAt > timeoutMs) return resolve('timeout');
          const t = topicsRef.current.find((x) => x.id === topicId);
          if (!t) return resolve('failed'); // row went away — treat as failed
          const job = t.job;
          if (t.draftId) return resolve('completed');
          if (job?.status === 'completed') return resolve('completed');
          if (job?.status === 'failed') return resolve('failed');
          setTimeout(tick, 1500);
        };
        tick();
      });
    },
    [],
  );

  // Wait for a publish to terminate. Mirrors waitForGenerationTerminal but
  // pivots on sharedPublishStatuses (the SSE-driven publish channel).
  const sharedPublishRef = useRef(sharedPublishStatuses);
  useEffect(() => {
    sharedPublishRef.current = sharedPublishStatuses;
  }, [sharedPublishStatuses]);

  const waitForPublishTerminal = useCallback(
    (draftId: number, timeoutMs = 3 * 60_000): Promise<'published' | 'failed' | 'cancelled' | 'timeout'> => {
      return new Promise((resolve) => {
        const startedAt = Date.now();
        const tick = () => {
          if (batchCancelRef.current) return resolve('cancelled');
          if (Date.now() - startedAt > timeoutMs) return resolve('timeout');
          const snap = sharedPublishRef.current?.get(draftId);
          if (snap?.status === 'published') return resolve('published');
          if (snap?.status === 'failed') return resolve('failed');
          setTimeout(tick, 1500);
        };
        tick();
      });
    },
    [],
  );

  const cancelBatch = () => {
    batchCancelRef.current = true;
  };

  const runBatchPublish = useCallback(async () => {
    const queue = [...publishCandidates];
    if (queue.length === 0) return;
    setError(null);
    setBatchErrors([]);
    setBatchOp('publish');
    batchCancelRef.current = false;
    setBatchProgress({ current: 0, total: queue.length, label: `Publishing 0 of ${queue.length}…` });
    const errors: Array<{ topicId: number; title: string; error: string }> = [];
    for (let i = 0; i < queue.length; i++) {
      if (batchCancelRef.current) break;
      const topic = queue[i];
      setBatchProgress({
        current: i + 1,
        total: queue.length,
        label: `Publishing ${i + 1} of ${queue.length}: ${topic.title}`,
      });
      if (!topic.draftId) {
        errors.push({ topicId: topic.id, title: topic.title, error: 'No draft to publish' });
        continue;
      }
      // Flip the row's optimistic publishing flag so the row UI shows it.
      setOptimisticPublishingTopicIds((prev) => new Set(prev).add(topic.id));
      try {
        const result = await publishDraft(topic.draftId);
        if (result.status === 'failed') {
          errors.push({ topicId: topic.id, title: topic.title, error: result.error || 'Publish failed' });
          setOptimisticPublishingTopicIds((prev) => {
            const next = new Set(prev);
            next.delete(topic.id);
            return next;
          });
          continue;
        }
        // Wait for the publish channel to confirm before moving on, so the
        // user sees rows transition one at a time (graceful).
        const outcome = await waitForPublishTerminal(topic.draftId);
        if (outcome === 'failed' || outcome === 'timeout') {
          errors.push({
            topicId: topic.id,
            title: topic.title,
            error: outcome === 'timeout' ? 'Publish timed out' : 'Publish failed',
          });
        }
        if (outcome === 'cancelled') break;
      } catch (err) {
        errors.push({
          topicId: topic.id,
          title: topic.title,
          error: err instanceof Error ? err.message : 'Publish failed',
        });
        setOptimisticPublishingTopicIds((prev) => {
          const next = new Set(prev);
          next.delete(topic.id);
          return next;
        });
      }
    }
    setBatchProgress(null);
    setBatchOp(null);
    const cancelled = batchCancelRef.current;
    batchCancelRef.current = false;
    setBatchErrors(errors);
    const succeeded = queue.length - errors.length - (cancelled ? Math.max(0, queue.length - 0) : 0);
    if (cancelled) {
      setNotice(`Cancelled — completed ${queue.length - errors.length - (queue.length - 0)} before stop.`);
    } else if (errors.length === 0) {
      setNotice(`Published ${succeeded} ${succeeded === 1 ? 'draft' : 'drafts'}.`);
    } else {
      setNotice(
        `Published ${queue.length - errors.length} of ${queue.length}; ${errors.length} failed. See errors below.`,
      );
    }
    // Force a structure refetch so the rows reflect the new published state
    // even if some SSE events were missed.
    reload({ silent: true });
  }, [publishCandidates, reload, waitForPublishTerminal]);

  /**
   * Batch generate runner. The WorksheetGenerateDrawer collects ONE
   * payload (template_type / project_goal / tone / audience / etc) and
   * we fan that out to every topic in `topics`, sequentially. For each
   * topic we fire generateTopic and wait for it to terminate before
   * starting the next — keeps the UI sane (one row spinning at a time),
   * avoids hammering n8n with parallel jobs, and gives the user a clear
   * "x of N done" progress bar.
   *
   * The drawer closes immediately after calling this; the bar takes
   * over as the foreground UI for the batch.
   */
  const runBatchGenerate = useCallback(
    async (topics: WorksheetTopic[], generateOne: (topic: WorksheetTopic) => Promise<void>) => {
      const queue = [...topics];
      if (queue.length === 0) return;
      setError(null);
      setBatchErrors([]);
      setBatchOp('generate');
      batchCancelRef.current = false;
      setBatchProgress({ current: 0, total: queue.length, label: `Generating 0 of ${queue.length}…` });
      const errors: Array<{ topicId: number; title: string; error: string }> = [];
      for (let i = 0; i < queue.length; i++) {
        if (batchCancelRef.current) break;
        const topic = queue[i];
        setBatchProgress({
          current: i + 1,
          total: queue.length,
          label: `Generating ${i + 1} of ${queue.length}: ${topic.title}`,
        });
        try {
          await generateOne(topic);
        } catch (err) {
          errors.push({
            topicId: topic.id,
            title: topic.title,
            error: err instanceof Error ? err.message : 'Generation start failed',
          });
          continue;
        }
        const outcome = await waitForGenerationTerminal(topic.id);
        if (outcome === 'failed' || outcome === 'timeout') {
          errors.push({
            topicId: topic.id,
            title: topic.title,
            error: outcome === 'timeout' ? 'Generation timed out' : 'Generation failed',
          });
        }
        if (outcome === 'cancelled') break;
      }
      const cancelled = batchCancelRef.current;
      batchCancelRef.current = false;
      setBatchProgress(null);
      setBatchOp(null);
      setBatchErrors(errors);
      if (cancelled) {
        setNotice('Generation cancelled.');
      } else if (errors.length === 0) {
        setNotice(`Generated ${queue.length} draft${queue.length === 1 ? '' : 's'}.`);
      } else {
        setNotice(
          `Generated ${queue.length - errors.length} of ${queue.length}; ${errors.length} failed.`,
        );
      }
      reload({ silent: true });
    },
    [reload, waitForGenerationTerminal],
  );

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
    await withBusy(null, () => createTopic(campaignId, { title: 'Untitled prompt' }));
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

    const maxKeywords = parseKeywordLimit(keywordSettings.maxKeywordsPerCell);
    const currentCount = topics.find((topic) => topic.id === topicId)?.keywords.length ?? 0;
    const remainingSlots = Math.max(0, maxKeywords - currentCount);
    if (remainingSlots === 0) {
      setError(`This row already has the maximum of ${maxKeywords} keywords.`);
      return;
    }

    const allowedTerms = terms.slice(0, remainingSlots);
    if (allowedTerms.length < terms.length) {
      setNotice(`Only added ${allowedTerms.length} keyword${allowedTerms.length === 1 ? '' : 's'} to stay within the ${maxKeywords}-keyword limit.`);
    }

    setBusyTopicId(topicId);
    setError(null);
    try {
      let latest: WorksheetTopic[] = topics;
      for (const term of allowedTerms) {
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
      await withBusy(topic.id, async () => {
        const maxKeywords = parseKeywordLimit(keywordSettings.maxKeywordsPerCell);

        // Treat reruns as a replacement operation so the keyword limit is
        // enforced against the final row, not appended on top of old values.
        for (const keyword of topic.keywords) {
          await deleteKeyword(keyword.id);
        }

        const latest = await aiSuggestTopicKeywords(topic.id, {
          count: maxKeywords,
          keywordLogic: keywordSettings.keywordLogic.trim() || undefined,
          language: keywordSettings.language.trim() || undefined,
          model: keywordSettings.model.trim() || undefined,
        });

        const currentTopic = latest.find((row) => row.id === topic.id);
        if (!currentTopic || currentTopic.keywords.length <= maxKeywords) {
          return latest;
        }

        let trimmed = latest;
        for (const keyword of currentTopic.keywords.slice(maxKeywords)) {
          trimmed = await deleteKeyword(keyword.id);
        }

        return trimmed;
      });
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

  const handlePublishFromMore = async (topicId: number, draftId: number) => {
    setOptimisticPublishingTopicIds((prev) => {
      if (prev.has(topicId)) return prev;
      const next = new Set(prev);
      next.add(topicId);
      return next;
    });
    try {
      const result = await publishDraft(draftId);
      if (result.status === 'failed') {
        setOptimisticPublishingTopicIds((prev) => {
          if (!prev.has(topicId)) return prev;
          const next = new Set(prev);
          next.delete(topicId);
          return next;
        });
        setError(result.error || 'Publish failed.');
      }
    } catch (err) {
      setOptimisticPublishingTopicIds((prev) => {
        if (!prev.has(topicId)) return prev;
        const next = new Set(prev);
        next.delete(topicId);
        return next;
      });
      setError(err instanceof Error ? err.message : 'Publish failed.');
    }
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
          const maxKeywords = parseKeywordLimit(keywordSettings.maxKeywordsPerCell);
          let currentCount = newTopic.keywords.length;
          for (const kw of row.keywords) {
            if (currentCount >= maxKeywords) break;
            latest = await addTopicKeyword(newTopic.id, { term: kw });
            currentCount += 1;
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

  const handleOpenColumnSettings = (columnKey: WorksheetColumnKey) => {
    setOpenColumnMenu(null);
    if (columnKey === 'topic' || columnKey === 'keywords') {
      setColumnSettingsKey(columnKey);
      return;
    }
  };

  const handleCloseKeywordSettings = () => {
    saveKeywordSettings(keywordSettings);
    setColumnSettingsKey(null);
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
              <div className="inline-flex items-center gap-2 rounded-md border border-[#bfc6d2] px-2.5 h-9 bg-white text-[#4a5568] text-sm">
                <Filter className="h-4 w-4" />
                <select
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(
                      e.target.value as
                        | 'all'
                        | 'not-started'
                        | 'in-progress'
                        | 'ready'
                        | 'generating'
                        | 'completed'
                        | 'publishing'
                        | 'published'
                        | 'failed'
                    )
                  }
                  className="bg-transparent text-sm focus:outline-none"
                  aria-label="Filter by status"
                  title="Filter by status"
                >
                  <option value="all">All Status</option>
                  <option value="not-started">Not Started</option>
                  <option value="in-progress">In Progress</option>
                  <option value="ready">Ready</option>
                  <option value="generating">Generating</option>
                  <option value="completed">Completed</option>
                  <option value="publishing">Publishing</option>
                  <option value="published">Published</option>
                  <option value="failed">Failed</option>
                </select>
              </div>
              <div className="inline-flex items-center gap-2 rounded-md border border-[#bfc6d2] px-2.5 h-9 bg-white text-[#4a5568] text-sm">
                <ArrowUpDown className="h-4 w-4" />
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as 'latest' | 'oldest')}
                  className="bg-transparent text-sm focus:outline-none"
                  aria-label="Sort by time"
                  title="Sort by time"
                >
                  <option value="latest">Latest First</option>
                  <option value="oldest">Oldest First</option>
                </select>
              </div>
              <button
                type="button"
                onClick={handleAiSuggestNewTopic}
                disabled={aiSuggestingNewTopic}
                className="h-9 px-3 rounded-md border border-[#909bb0] text-[#495668] text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {aiSuggestingNewTopic ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                AI Suggest Prompt
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
                <img src="https://res.cloudinary.com/dgfzjdi68/image/upload/v1772183203/vscode-icons_file-type-excel_t2sqbh.svg" alt="Export" />
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

        {/* ── Batch action bar ────────────────────────────────────────
             Appears when ≥1 row is selected. Shows two grouped buttons
             reflecting the eligible counts:
               Generate (G)  — selected rows that don't have a draft yet
               Publish (P)   — selected rows with a completed draft
             Disabled when count is 0 (so the user can see the constraint).
             During a batch op, the bar pivots into a progress strip with
             "Generating X of Y…" + a Cancel button.
        ─────────────────────────────────────────────────────────────── */}
        {(liveSelectedIds.size > 0 || batchOp !== null) && (
          <div className="mx-3 sm:mx-4 mb-3 mt-1 rounded-md border border-[#c8cfdb] bg-[#F2F6FF] px-4 py-3">
            {batchOp ? (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Loader2 className="h-4 w-4 animate-spin text-[#2D4059] shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="text-[13px] font-medium text-[#2D4059] truncate">
                      {batchProgress?.label ?? `Running ${batchOp}…`}
                    </span>
                    {batchProgress ? (
                      <div className="mt-1 h-1.5 w-[260px] max-w-full rounded-full bg-[#d6dee9] overflow-hidden">
                        <div
                          className="h-full bg-[#2D4059] transition-all"
                          style={{
                            width: `${Math.round(
                              (batchProgress.current / Math.max(1, batchProgress.total)) * 100,
                            )}%`,
                          }}
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={cancelBatch}
                  disabled={batchCancelRef.current}
                  className="h-8 shrink-0 rounded-md border border-[#909bb0] bg-white px-3 text-[12px] font-medium text-[#3f4f69] transition-colors hover:bg-[#f6f8fb] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {batchCancelRef.current ? 'Stopping…' : 'Cancel'}
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <span className="text-[13px] font-medium text-[#2D4059]">
                    {liveSelectedIds.size} selected
                  </span>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="text-[12px] text-[#5b6878] hover:text-[#2D4059] underline-offset-2 hover:underline"
                  >
                    Clear
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (generateCandidates.length === 0) return;
                      // Single drawer for the whole batch. The drawer's
                      // submit callback fans out to every candidate
                      // sequentially (see WorksheetGenerateDrawer batch
                      // branch below).
                      setBatchTopicsForGenerate(generateCandidates);
                    }}
                    disabled={generateCandidates.length === 0}
                    title={
                      generateCandidates.length === 0
                        ? 'None of the selected rows are ready to generate (they may already have a draft).'
                        : `Generate drafts for ${generateCandidates.length} row${generateCandidates.length === 1 ? '' : 's'}`
                    }
                    className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#2D4059] px-3.5 text-[12px] font-medium text-white shadow-sm transition-all hover:bg-[#243349] disabled:cursor-not-allowed disabled:bg-[#94a3b8] disabled:opacity-60"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Generate ({generateCandidates.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => void runBatchPublish()}
                    disabled={publishCandidates.length === 0}
                    title={
                      publishCandidates.length === 0
                        ? 'None of the selected rows have a completed draft ready to publish.'
                        : `Publish ${publishCandidates.length} draft${publishCandidates.length === 1 ? '' : 's'}`
                    }
                    className="inline-flex h-9 items-center gap-1.5 rounded-md bg-emerald-700 px-3.5 text-[12px] font-medium text-white shadow-sm transition-all hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-[#94a3b8] disabled:opacity-60"
                  >
                    <Radio className="h-3.5 w-3.5" />
                    Publish ({publishCandidates.length})
                  </button>
                </div>
              </div>
            )}
            {/* Error summary surfaced after a batch op finishes. */}
            {batchErrors.length > 0 && batchOp === null && (
              <div className="mt-3 rounded-md bg-white border border-rose-200 px-3 py-2">
                <p className="text-[12px] font-medium text-rose-700 mb-1">
                  {batchErrors.length} row{batchErrors.length === 1 ? '' : 's'} failed:
                </p>
                <ul className="space-y-0.5">
                  {batchErrors.slice(0, 5).map((e) => (
                    <li key={e.topicId} className="text-[11px] text-rose-600 truncate">
                      • {e.title} — {e.error}
                    </li>
                  ))}
                  {batchErrors.length > 5 ? (
                    <li className="text-[11px] text-rose-500">
                      …and {batchErrors.length - 5} more
                    </li>
                  ) : null}
                </ul>
                <button
                  type="button"
                  onClick={() => setBatchErrors([])}
                  className="mt-1.5 text-[11px] text-rose-700 underline-offset-2 hover:underline"
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>
        )}

        <div className="p-3 sm:p-4">
          <div className="overflow-auto border border-[#c8cfdb]">
            <table className="min-w-[980px] w-full">
              <thead className="bg-[#EDEDED] border-b border-[#c8cfdb]">
                <tr className="h-10">
                  <th className="w-10 border-r border-[#c8cfdb] px-3 text-left">
                    <input
                      type="checkbox"
                      aria-label="Select all visible rows"
                      checked={headerCheckboxState === 'checked'}
                      ref={(el) => {
                        if (el) el.indeterminate = headerCheckboxState === 'indeterminate';
                      }}
                      onChange={toggleSelectAll}
                      className="h-3.5 w-3.5 rounded border-[#8e99ad]"
                    />
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
                            {(k === 'topic' || k === 'keywords') && (
                              <button
                                type="button"
                                onClick={() => handleOpenColumnSettings(k)}
                                className="block w-full px-3 py-2 text-left text-xs hover:bg-gray-50"
                              >
                                Column settings
                              </button>
                            )}
                            <button type="button" onClick={() => handleOpenRenameColumn(k)} className="block w-full px-3 py-2 text-left text-xs hover:bg-gray-50">Rename</button>
                            <button type="button" onClick={() => handleHideColumn(k)} className="block w-full px-3 py-2 text-left text-xs text-red-600 hover:bg-gray-50">Hide column</button>
                          </div>
                        )}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {loading && Array.from({ length: 5 }).map((_, idx) => (
                  <tr
                    key={`worksheet-skeleton-${idx}`}
                    className={`min-h-[86px] border-b border-[#c8cfdb] ${idx % 2 ? 'bg-[#F2F6FF]' : 'bg-white'}`}
                  >
                    <td className="border-r border-[#c8cfdb] px-3 py-4 align-middle">
                      <Skeleton className="h-3.5 w-3.5 rounded-sm" />
                    </td>
                    {columnVisibility.topic && (
                      <td className="border-r border-[#c8cfdb] px-4 py-4 align-middle">
                        <div className="flex flex-col gap-2">
                          <Skeleton className="h-4 w-3/4" />
                          <Skeleton className="h-3 w-1/2" />
                        </div>
                      </td>
                    )}
                    {columnVisibility.keywords && (
                      <td className="border-r border-[#c8cfdb] px-4 py-4 align-middle">
                        <div className="flex flex-wrap gap-2">
                          <Skeleton className="h-6 w-20 rounded-full" />
                          <Skeleton className="h-6 w-24 rounded-full" />
                          <Skeleton className="h-6 w-16 rounded-full" />
                          <Skeleton className="h-6 w-20 rounded-full" />
                        </div>
                      </td>
                    )}
                    {columnVisibility.status && (
                      <td className="border-r border-[#c8cfdb] px-4 py-4 align-middle">
                        <Skeleton className="h-6 w-24 rounded-full" />
                      </td>
                    )}
                    {columnVisibility.action && (
                      <td className="border-r border-[#c8cfdb] px-4 py-4 align-middle">
                        <Skeleton className="h-8 w-28 rounded-md" />
                      </td>
                    )}
                    {columnVisibility.more && (
                      <td className="border-l border-[#c8cfdb] px-4 py-4 align-middle">
                        <Skeleton className="h-5 w-5 rounded-sm" />
                      </td>
                    )}
                  </tr>
                ))}
                {!loading && filteredAndSortedTopics.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-10 text-center text-sm text-gray-500">
                      No prompts yet. Click <span className="font-medium">+ Add Row</span> below or <span className="font-medium">AI Suggest Prompt</span> above to get started.
                    </td>
                  </tr>
                )}
                {!loading && filteredAndSortedTopics.map((topic, idx) => {
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
                      className={`min-h-[86px] border-b border-[#c8cfdb] ${idx % 2 ? 'bg-[#F2F6FF]' : 'bg-white'} ${isBusy ? 'opacity-70' : ''}`}
                    >
                      <td className="border-r border-[#c8cfdb] px-3 align-middle">
                        <input
                          type="checkbox"
                          aria-label={`Select ${topic.title}`}
                          checked={selectedTopicIds.has(topic.id)}
                          onChange={() => toggleRowSelection(topic.id)}
                          className="h-3.5 w-3.5 rounded border-[#8e99ad]"
                        />
                      </td>

                      {columnVisibility.topic && (
                        <td className="border-r border-[#c8cfdb] px-4 py-3 align-middle">
                          <div className="flex flex-col gap-2">
                            <InlineEditable
                              value={topic.title}
                              placeholder="+ Add prompt name"
                              onCommit={(next) =>
                                withBusy(topic.id, () => updateTopicTitle(topic.id, next))
                              }
                              className="block text-left text-[14px] font-normal  leading-[150%] tracking-[0px] text-[#2b3548] hover:text-[#1e2f4f] cursor-text whitespace-pre-wrap break-words rounded-sm focus:outline-none focus:ring-2 focus:ring-[#9cb0d9]"
                              inputClassName="w-full rounded-md border border-[#9cb0d9] bg-white px-2 py-1 text-[14px] font-normal italic leading-[150%] tracking-[0px] text-[#2b3548] focus:outline-none focus:ring-2 focus:ring-[#4E76C7]"
                            >
                              {(display) =>
                                topic.title ? (
                                  display
                                ) : (
                                  <span className="text-[#9aa3b2] italic">{display}</span>
                                )
                              }
                            </InlineEditable>
                            {/* <button
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
                            </button> */}
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
                          <div className="inline-flex items-center gap-1.5">
                            {rowState.kind === 'published' && rowState.liveUrl ? (
                              <a
                                href={rowState.liveUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center justify-center h-8 w-8 rounded-md text-[#5b6578] hover:bg-[#eef2f8]"
                                aria-label="View live"
                                title="View live"
                              >
                                <Eye className="h-4 w-4" />
                              </a>
                            ) : null}

                            {(rowState.kind === 'completed' || rowState.kind === 'published') && onOpenDraftInPublish ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setOpeningDraftRowId(topic.id);
                                  onOpenDraftInPublish(rowState.draftId);
                                  setTimeout(() => setOpeningDraftRowId(null), 350);
                                }}
                                className="inline-flex items-center justify-center h-8 w-8 rounded-md text-[#5b6578] hover:bg-[#eef2f8]"
                                aria-label="Edit draft"
                                title="Edit draft"
                              >
                                <SquarePen className="h-4 w-4" />
                              </button>
                            ) : null}

                            {(rowState.kind === 'completed' || rowState.kind === 'published') ? (
                              <button
                                type="button"
                                onClick={() => setTopicForGenerate(topic)}
                                className="inline-flex items-center justify-center h-8 w-8 rounded-md text-[#5b6578] hover:bg-[#eef2f8]"
                                aria-label="Regenerate"
                                title="Regenerate"
                              >
                                <RotateCw className="h-4 w-4" />
                              </button>
                            ) : null}

                            {/* {rowState.kind === 'completed' ? (
                              <button
                                type="button"
                                onClick={() => void handlePublishFromMore(topic.id, rowState.draftId)}
                                className="inline-flex items-center justify-center h-8 w-8 rounded-md text-[#5b6578] hover:bg-[#eef2f8]"
                                aria-label="Publish"
                                title="Publish"
                              >
                                <Send className="h-4 w-4" />
                              </button>
                            ) : null} */}

                            <button
                              type="button"
                              onClick={() => setDeleteRowId(topic.id)}
                              className="inline-flex items-center justify-center h-8 w-8 rounded-md text-[#d14f4f] hover:bg-[#ffecec]"
                              aria-label="Delete row"
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
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

      {columnSettingsKey === 'topic' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={handleCloseKeywordSettings} />
          <div className="relative mx-4 w-full max-w-4xl rounded-xl border border-[#d9dde4] bg-[#f7f7f8] p-6 shadow-2xl">
            <button
              type="button"
              onClick={handleCloseKeywordSettings}
              className="absolute right-4 top-4 text-[#8b93a3] hover:text-[#4f586b]"
              aria-label="Close settings"
            >
              <X className="h-4 w-4" />
            </button>
            <h3 className="text-[30px] font-medium text-[#2f3d55]">Content Settings</h3>
            <p className="mt-1 text-xs text-[#7f8794]">
              To upload it directly to your website, please connect your WordPress account. Once connected,
              we&apos;ll be able to publish your content with the correct formatting, and SEO settings.
              You remain in full control of what goes live.
            </p>

            <div className="mt-4 space-y-3 text-sm text-[#465066]">
              <div>
                <label className="mb-1 block text-xs font-medium">Column Name</label>
                <input
                  value="Prompts"
                  readOnly
                  className="h-10 w-full rounded-md border border-[#c5ccd9] bg-[#f2f4f8] px-3 text-sm text-[#677184]"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium">Select Model</label>
                <div className={selectShellClass}>
                  <select
                    value={promptSettings.model}
                    onChange={(e) => setPromptSettings((prev) => ({ ...prev, model: e.target.value }))}
                    className={selectClass}
                  >
                    <option>SearchEO.AI (Recommended)</option>
                    <option>GPT-4.1</option>
                    <option>Claude 3.7 Sonnet</option>
                    <option>Gemini 2.5 Pro</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7f8794]" />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium">Select Content Language *</label>
                <div className={selectShellClass}>
                  <select
                    value={promptSettings.language}
                    onChange={(e) => setPromptSettings((prev) => ({ ...prev, language: e.target.value }))}
                    className={selectClass}
                  >
                    <option>English (Widely used)</option>
                    <option>Hindi</option>
                    <option>Spanish</option>
                    <option>French</option>
                    <option>German</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7f8794]" />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium">Image Output per blog</label>
                  <div className={selectShellClass}>
                    <select
                      value={promptSettings.imageOutputPerBlog}
                      onChange={(e) => setPromptSettings((prev) => ({ ...prev, imageOutputPerBlog: e.target.value }))}
                      className={selectClass}
                    >
                      {Array.from({ length: 10 }, (_, idx) => String(idx + 1)).map((count) => (
                        <option key={count} value={count}>
                          {count}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7f8794]" />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Word count per blog</label>
                  <div className={selectShellClass}>
                    <select
                      value={promptSettings.wordCountPerBlog}
                      onChange={(e) => setPromptSettings((prev) => ({ ...prev, wordCountPerBlog: e.target.value }))}
                      className={selectClass}
                    >
                      <option>300 - 500 words</option>
                      <option>500 - 800 words</option>
                      <option>800 - 1200 words</option>
                      <option>1200 - 1800 words</option>
                      <option>1800 - 2500 words</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7f8794]" />
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium">Set Prompt Logic *</label>
                <textarea
                  value={promptSettings.promptLogic}
                  onChange={(e) => setPromptSettings((prev) => ({ ...prev, promptLogic: e.target.value }))}
                  placeholder={
                    'You are an SEO & GEO expert and content strategist. Generate compelling, optimized article prompts based on the provided context.\n\nRequirements:\n1. The prompt should be valuable to readers\n2. Include keywords naturally\n3. Keep it concise and focused\n4. Make it specific and actionable\n5. Consider the company context and knowledge base information'
                  }
                  className="min-h-[170px] w-full rounded-md border border-[#c5ccd9] bg-white px-3 py-2 text-xs leading-5 text-[#2f3d55] placeholder:text-[#a5adba]"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium">User Prompt Template *</label>
                <textarea
                  value={promptSettings.userPromptTemplate}
                  onChange={(e) => setPromptSettings((prev) => ({ ...prev, userPromptTemplate: e.target.value }))}
                  placeholder="Generate one SEO-optimized article prompt for this keyword {keyword} and campaign info {campaign_context} that appeals to the target audience and ranks well in search engines."
                  className="min-h-[80px] w-full rounded-md border border-[#c5ccd9] bg-white px-3 py-2 text-xs leading-5 text-[#2f3d55] placeholder:text-[#a5adba]"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={handleCloseKeywordSettings}
                className="rounded-md bg-[#2d4059] px-6 py-2 text-sm font-medium text-white hover:bg-[#27384e]"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {columnSettingsKey === 'keywords' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setColumnSettingsKey(null)} />
          <div className="relative mx-4 w-full max-w-4xl rounded-xl border border-[#d9dde4] bg-[#f7f7f8] p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setColumnSettingsKey(null)}
              className="absolute right-4 top-4 text-[#8b93a3] hover:text-[#4f586b]"
              aria-label="Close settings"
            >
              <X className="h-4 w-4" />
            </button>
            <h3 className="text-[30px] font-medium text-[#2f3d55]">Keywords Settings</h3>
            <p className="mt-1 text-xs text-[#7f8794]">
              To upload it directly to your website, please connect your WordPress account. Once connected,
              we&apos;ll be able to publish your content with the correct formatting, and SEO settings.
              You remain in full control of what goes live.
            </p>

            <div className="mt-4 space-y-3 text-sm text-[#465066]">
              <div>
                <label className="mb-1 block text-xs font-medium">Column Name</label>
                <input
                  value="Keywords"
                  readOnly
                  className="h-10 w-full rounded-md border border-[#c5ccd9] bg-[#f2f4f8] px-3 text-sm text-[#677184]"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium">Select Model</label>
                <div className={selectShellClass}>
                  <select
                    value={keywordSettings.model}
                    onChange={(e) => setKeywordSettings((prev) => ({ ...prev, model: e.target.value }))}
                    className={selectClass}
                  >
                    <option>SearchEO.AI (Recommended)</option>
                    <option>GPT-4.1</option>
                    <option>Claude 3.7 Sonnet</option>
                    <option>Gemini 2.5 Pro</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7f8794]" />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium">Max Keywords per cell *</label>
                <div className={selectShellClass}>
                  <select
                    value={keywordSettings.maxKeywordsPerCell}
                    onChange={(e) => setKeywordSettings((prev) => ({ ...prev, maxKeywordsPerCell: e.target.value }))}
                    className={selectClass}
                  >
                    {Array.from({ length: 10 }, (_, idx) => String(idx + 1)).map((count) => (
                      <option key={count} value={count}>
                        {count}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7f8794]" />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium">Select Content Language *</label>
                <div className={selectShellClass}>
                  <select
                    value={keywordSettings.language}
                    onChange={(e) => setKeywordSettings((prev) => ({ ...prev, language: e.target.value }))}
                    className={selectClass}
                  >
                    <option>English (Widely used)</option>
                    <option>Hindi</option>
                    <option>Spanish</option>
                    <option>French</option>
                    <option>German</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7f8794]" />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium">Set Keyword Logic *</label>
                <textarea
                  value={keywordSettings.keywordLogic}
                  onChange={(e) => setKeywordSettings((prev) => ({ ...prev, keywordLogic: e.target.value }))}
                  placeholder={
                    'You are an SEO & GEO expert and content strategist. Generate compelling, optimized keywords based on the provided context.\n\nRequirements:\n1. Keywords should be relevant\n2. Include terms useful for content generation\n3. Prefer high-intent and semantically related keywords\n4. Avoid duplicates and vague terms'
                  }
                  className="min-h-[170px] w-full rounded-md border border-[#c5ccd9] bg-white px-3 py-2 text-xs leading-5 text-[#2f3d55] placeholder:text-[#a5adba]"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={() => setColumnSettingsKey(null)}
                className="rounded-md bg-[#2d4059] px-6 py-2 text-sm font-medium text-white hover:bg-[#27384e]"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete row confirm modal */}
      {deleteRowId !== null && (
        <Modal title="Delete prompt" onClose={() => setDeleteRowId(null)}>
          <p className="text-sm text-gray-600 -mt-4 mb-4">
            This will remove the prompt and its keywords. This action cannot be undone.
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

      {/* Generate drawer — single-row mode. */}
      <WorksheetGenerateDrawer
        topic={topicForGenerate}
        open={topicForGenerate !== null && batchTopicsForGenerate === null}
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

      {/* Generate drawer — batch mode.
          When the user clicks Generate(N) in the batch bar, we open the
          drawer seeded with the FIRST eligible topic (so the form's
          per-topic context like primary keyword still renders), but on
          submit we re-fire generateTopic for EVERY topic in
          batchTopicsForGenerate using the same payload. The drawer
          closes immediately; the batch bar takes over as the
          foreground UI for the run. */}
      {batchTopicsForGenerate && batchTopicsForGenerate.length > 0 && (
        <WorksheetGenerateDrawer
          topic={batchTopicsForGenerate[0]}
          open={true}
          batchTopics={batchTopicsForGenerate}
          onClose={() => setBatchTopicsForGenerate(null)}
          onBatchSubmit={async (generateOne) => {
            const topics = batchTopicsForGenerate;
            setBatchTopicsForGenerate(null);
            await runBatchGenerate(topics, generateOne);
          }}
          // Required by the drawer's prop contract but never called in
          // batch mode (the drawer takes the onBatchSubmit branch).
          onSuccess={() => {
            /* no-op for batch mode */
          }}
        />
      )}

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
      return <SquarePen className="h-4 w-4 text-[#2D4059]" />;
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
  const chipRef = React.useRef<HTMLSpanElement | null>(null);
  const [menuPos, setMenuPos] = React.useState<{ left: number; top: number } | null>(null);

  React.useEffect(() => {
    if (!isPopoverOpen) return;

    const updatePosition = () => {
      const rect = chipRef.current?.getBoundingClientRect();
      if (!rect) return;

      const menuWidth = 170;
      const viewportPadding = 8;
      const preferredLeft = rect.right + 8;
      const clampedLeft = Math.min(
        preferredLeft,
        window.innerWidth - menuWidth - viewportPadding,
      );
      const clampedTop = Math.max(viewportPadding, rect.top);

      setMenuPos({ left: clampedLeft, top: clampedTop });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isPopoverOpen]);

  // Worksheet invariant: every keyword is Primary or Longtail.
  // Primary uses a saturated lavender; Longtail uses a soft tint of the same
  // hue. The chevron is the affordance for the actions popover; the term
  // itself is click-to-edit via <InlineEditable>.
  const variantClass = keyword.isPrimary
    ? 'bg-[#7E9BD7] border-[#7281c4] text-white hover:bg-[#6573ba]'
    : 'bg-[#F2F6FF] border-[#cdd5ed] text-[#4c5a8c] hover:bg-[#d3daf0]';

  return (
    <span
      ref={chipRef}
      className={`relative inline-flex items-center gap-1 rounded-md border px-3 py-1 text-[12px] font-normal not-italic leading-[22.53px] tracking-[0px] transition-colors ${variantClass}`}
    >
      <InlineEditable
        value={keyword.term}
        onCommit={onRename}
        placeholder="keyword"
        className="cursor-text whitespace-nowrap focus:outline-none"
        inputClassName={`min-w-[60px] max-w-[260px] rounded-sm bg-transparent text-[12px] font-normal not-italic leading-[22.53px] tracking-[0px] focus:outline-none ${
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
          className="fixed z-[120] min-w-[160px] rounded-md border border-gray-200 bg-white shadow-lg text-left"
          style={
            menuPos
              ? { left: `${menuPos.left}px`, top: `${menuPos.top}px` }
              : undefined
          }
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
              className="block w-full text-gray-600 px-3 py-2 text-xs text-left hover:bg-gray-50"
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
