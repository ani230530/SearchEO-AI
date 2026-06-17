/**
 * Worksheet API client.
 *
 * Talks to the campaign endpoints in `domainanalyzerBackend/src/routes/campaigns.ts`.
 * Each topic in the worksheet maps 1:1 to a `CampaignTopic`. The backend keeps an
 * internal `CampaignPage` row per topic for legacy compatibility — the worksheet
 * never surfaces that detail.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002';

export type WorksheetKeyword = {
  id: number;
  term: string;
  volume: number | null;
  difficulty: string | null;
  intent: string | null;
  isPrimary: boolean;
  isLongtail: boolean;
};

export type WorksheetTopic = {
  id: number;
  title: string;
  description: string | null;
  keywords: WorksheetKeyword[];
  /** Latest draft / publish status, derived from the topic's `latestDraft` on the server. */
  publishStatus: string | null;
  liveUrl: string | null;
  draftId: number | null;
  /** Latest GenerationJob snapshot for this topic, if any. */
  job: GenerationJob | null;
};

export type GenerationJobStatus = 'pending' | 'generating' | 'completed' | 'failed';

export interface GenerationJob {
  jobId: string;
  topicId: number;
  status: GenerationJobStatus;
  progress: number;
  phase: string | null;
  error: string | null;
  draftId: number | null;
  startedAt: string;
  updatedAt: string;
}

type SerializedKeyword = {
  id: number;
  term: string;
  volume?: number | null;
  difficulty?: string | null;
  intent?: string | null;
  aiMetadata?: { isPrimary?: boolean; isLongtail?: boolean } | null;
};

type SerializedTopic = {
  id: number;
  title: string;
  description: string | null;
  summary: string | null;
  status: string;
  source: string;
  keywords: SerializedKeyword[];
  publishStatus: string | null;
  liveUrl: string | null;
  draftId: number | null;
  job: GenerationJob | null;
};

type StructureResponse = {
  success: boolean;
  structure: { topics: SerializedTopic[] };
  error?: string;
};

const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('authToken');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

const handle = async <T>(res: Response): Promise<T> => {
  const text = await res.text();
  let json: { success?: boolean; error?: string } | null = null;
  try {
    json = text ? (JSON.parse(text) as { success?: boolean; error?: string }) : null;
  } catch {
    /* non-json response */
  }
  if (!res.ok || (json && json.success === false)) {
    const message = json?.error || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return json as T;
};

const normalizeKeyword = (kw: SerializedKeyword): WorksheetKeyword => ({
  id: kw.id,
  term: kw.term,
  volume: kw.volume ?? null,
  difficulty: kw.difficulty ?? null,
  intent: kw.intent ?? null,
  isPrimary: Boolean(kw.aiMetadata?.isPrimary),
  isLongtail: Boolean(kw.aiMetadata?.isLongtail),
});

const normalizeTopic = (topic: SerializedTopic): WorksheetTopic => ({
  id: topic.id,
  title: topic.title,
  description: topic.description,
  keywords: topic.keywords.map(normalizeKeyword),
  publishStatus: topic.publishStatus,
  liveUrl: topic.liveUrl,
  draftId: topic.draftId,
  job: topic.job,
});

/* ---------- Reads ---------- */

export async function fetchCampaignTopics(campaignId: number): Promise<WorksheetTopic[]> {
  const res = await fetch(`${API_BASE_URL}/api/campaigns/${campaignId}/structure`, {
    headers: authHeaders(),
  });
  const data = await handle<StructureResponse>(res);
  return data.structure.topics.map(normalizeTopic);
}

/* ---------- Topic mutations ---------- */

export async function createTopic(
  campaignId: number,
  payload: {
    title: string;
    description?: string | null;
    /** Optional seed keywords — the AI Checker import flow passes the
     *  source keyword here so the worksheet doesn't regenerate one
     *  from the prompt phrase. The first entry becomes primary. */
    keywords?: Array<{
      term: string;
      isPrimary?: boolean;
      intent?: string | null;
      volume?: number | null;
      difficulty?: string | null;
    }>;
    /** Origin marker — 'AI' when the topic was imported from AI Checker. */
    source?: 'AI' | 'MANUAL';
  }
): Promise<WorksheetTopic[]> {
  const res = await fetch(`${API_BASE_URL}/api/campaigns/${campaignId}/topics`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      title: payload.title,
      description: payload.description ?? null,
      keywords: payload.keywords,
      source: payload.source,
    }),
  });
  const data = await handle<StructureResponse>(res);
  return data.structure.topics.map(normalizeTopic);
}

export async function aiSuggestTopic(
  campaignId: number,
  options?: { focus?: string; count?: number }
): Promise<WorksheetTopic[]> {
  const res = await fetch(`${API_BASE_URL}/api/campaigns/${campaignId}/topics/ai`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      count: options?.count ?? 1,
      focus: options?.focus ?? undefined,
    }),
  });
  const data = await handle<StructureResponse>(res);
  return data.structure.topics.map(normalizeTopic);
}

/**
 * In-place AI suggestion for an existing topic — generates a title + summary
 * from the topic's current keywords and writes them onto the row. Does not
 * create a new topic.
 */
export async function aiSuggestTopicTitle(topicId: number): Promise<WorksheetTopic[]> {
  const res = await fetch(
    `${API_BASE_URL}/api/campaigns/topics/${topicId}/title/ai`,
    { method: 'POST', headers: authHeaders() }
  );
  const data = await handle<StructureResponse>(res);
  return data.structure.topics.map(normalizeTopic);
}

export async function updateTopicTitle(
  topicId: number,
  title: string
): Promise<WorksheetTopic[]> {
  const res = await fetch(`${API_BASE_URL}/api/campaigns/topics/${topicId}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ title }),
  });
  const data = await handle<StructureResponse>(res);
  return data.structure.topics.map(normalizeTopic);
}

export async function deleteTopic(topicId: number): Promise<WorksheetTopic[]> {
  const res = await fetch(`${API_BASE_URL}/api/campaigns/topics/${topicId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  const data = await handle<StructureResponse>(res);
  return data.structure.topics.map(normalizeTopic);
}

/* ---------- Keyword mutations ---------- */

/**
 * Worksheet keywords are always either Primary or Longtail. The caller can
 * omit `keywordType` and the server resolves it (Primary if the topic has
 * none yet, otherwise Longtail).
 */
export async function addTopicKeyword(
  topicId: number,
  payload: {
    term: string;
    keywordType?: 'primary' | 'longtail';
    volume?: number;
    difficulty?: string;
    intent?: string;
  }
): Promise<WorksheetTopic[]> {
  const res = await fetch(`${API_BASE_URL}/api/campaigns/topics/${topicId}/keywords`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await handle<StructureResponse>(res);
  return data.structure.topics.map(normalizeTopic);
}

/**
 * AI keyword suggestion for an existing topic. Server pulls the topic's
 * existing keywords, campaign context, and domain context to inform the
 * prompt; resulting keywords are tagged Primary (first, if none exists yet)
 * or Longtail.
 */
export async function aiSuggestTopicKeywords(
  topicId: number,
  options?: {
    count?: number;
    keywordLogic?: string;
    language?: string;
    model?: string;
  }
): Promise<WorksheetTopic[]> {
  const res = await fetch(
    `${API_BASE_URL}/api/campaigns/topics/${topicId}/keywords/ai`,
    {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        count: options?.count ?? 5,
        maxKeywordsPerCell: options?.count ?? 5,
        keywordLogic: options?.keywordLogic ?? undefined,
        keyword_logic: options?.keywordLogic ?? undefined,
        language: options?.language ?? undefined,
        model: options?.model ?? undefined,
      }),
    }
  );
  const data = await handle<StructureResponse>(res);
  return data.structure.topics.map(normalizeTopic);
}

export async function selectPrimaryKeyword(keywordId: number): Promise<WorksheetTopic[]> {
  const res = await fetch(
    `${API_BASE_URL}/api/campaigns/keywords/${keywordId}/select-primary`,
    { method: 'POST', headers: authHeaders() }
  );
  const data = await handle<StructureResponse>(res);
  return data.structure.topics.map(normalizeTopic);
}

export async function selectLongtailKeyword(keywordId: number): Promise<WorksheetTopic[]> {
  const res = await fetch(
    `${API_BASE_URL}/api/campaigns/keywords/${keywordId}/select-longtail`,
    { method: 'POST', headers: authHeaders() }
  );
  const data = await handle<StructureResponse>(res);
  return data.structure.topics.map(normalizeTopic);
}

export async function deselectKeyword(keywordId: number): Promise<WorksheetTopic[]> {
  const res = await fetch(`${API_BASE_URL}/api/campaigns/keywords/${keywordId}/deselect`, {
    method: 'POST',
    headers: authHeaders(),
  });
  const data = await handle<StructureResponse>(res);
  return data.structure.topics.map(normalizeTopic);
}

export async function updateKeywordTerm(
  keywordId: number,
  term: string
): Promise<WorksheetTopic[]> {
  const res = await fetch(`${API_BASE_URL}/api/campaigns/keywords/${keywordId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ term }),
  });
  const data = await handle<StructureResponse>(res);
  return data.structure.topics.map(normalizeTopic);
}

export async function deleteKeyword(keywordId: number): Promise<WorksheetTopic[]> {
  const res = await fetch(`${API_BASE_URL}/api/campaigns/keywords/${keywordId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  const data = await handle<StructureResponse>(res);
  return data.structure.topics.map(normalizeTopic);
}

/* ---------- Direct publish from worksheet ---------- */

/**
 * Publish a previously-generated draft straight to WordPress without
 * routing through the editor overlay.
 *
 * The backend's POST /api/publish/publish accepts a body of just
 * `{ draftId }` — it pulls primaryKeyword / htmlContent / title /
 * metaDescription / slug / featuredImage* from the persisted
 * WordpressPublishLog row when those fields are missing. The same
 * endpoint serves the overlay (which sends explicit overrides for
 * unsaved edits) and the worksheet (which sends only draftId).
 *
 * Response is the standard publish-flow shape:
 *   { status: 'published' | 'generating' | ..., draftId, publishedUrl?, ... }
 */
export interface PublishDraftResult {
  success: boolean;
  status?: 'published' | 'generating' | 'failed';
  draftId?: number;
  publishedUrl?: string;
  wordpressPostId?: number | null;
  error?: string;
}

export async function publishDraft(draftId: number): Promise<PublishDraftResult> {
  const res = await fetch(`${API_BASE_URL}/api/publish/publish`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ draftId }),
  });
  return handle<PublishDraftResult>(res);
}

/* ---------- Generate (universal n8n template) ---------- */

export type TemplateType =
  | 'blog'
  | 'faq'
  | 'case_study'
  | 'press_release'
  | 'landing_page'
  | 'report'
  | 'custom';

export interface GenerateTopicPayload {
  template_type: TemplateType;
  project_goal: string;
  target_audience: string;
  custom_audience_text?: string;
  tone: string;
  custom_tone_text?: string;
  word_count: number;
  language?: string;
  cta?: string;
  images?: number;
  featured_image?: boolean;
  /** Template-specific fields (e.g. `topic` for blog, `faq_topic_focus` for faq). */
  template_fields?: Record<string, unknown>;
}

/**
 * Kicks off a generation job. Returns immediately with the job snapshot
 * (status: 'pending'). Subsequent updates arrive over the SSE channel
 * `/api/campaigns/events` as `generation:update` events.
 *
 * 409 means a job is already in flight for this topic — the caller should
 * surface a "wait for the current run to finish" message.
 */
export async function generateTopic(
  topicId: number,
  payload: GenerateTopicPayload
): Promise<GenerationJob> {
  const res = await fetch(`${API_BASE_URL}/api/campaigns/topics/${topicId}/generate`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await handle<{ success: boolean; job: GenerationJob }>(res);
  return data.job;
}

export async function getGenerationJob(topicId: number): Promise<GenerationJob | null> {
  const res = await fetch(
    `${API_BASE_URL}/api/campaigns/topics/${topicId}/generation-job`,
    { headers: authHeaders() }
  );
  const data = await handle<{ success: boolean; job: GenerationJob | null }>(res);
  return data.job;
}

/**
 * Subscribe to generation status updates over SSE. The token is passed via
 * query string because EventSource cannot set headers.
 *
 * Robustness contract:
 *   - The browser auto-reconnects on transient drops. We detect reconnects
 *     by counting `onopen` calls and fire `onReconnect` so the consumer
 *     can refetch state — necessary because events that fired during the
 *     disconnect window are lost forever.
 *   - `onError` fires on every transient blip too; the connection itself
 *     is still healing in the background, so don't tear anything down.
 *   - Returns a teardown function that closes the connection cleanly.
 */
export type GenerationUpdateHandler = (job: GenerationJob) => void;

export interface SubscribeOptions {
  onUpdate: GenerationUpdateHandler;
  /** Fired the second (and subsequent) time `onopen` fires — i.e. after a
   *  reconnect. Use it to refetch the structure so any events lost during
   *  the disconnect get reconciled. */
  onReconnect?: () => void;
  onError?: (err: unknown) => void;
}

export function subscribeGenerationUpdates(opts: SubscribeOptions): () => void {
  const token = localStorage.getItem('authToken') ?? '';
  if (!token) {
    opts.onError?.(new Error('Missing auth token'));
    return () => undefined;
  }

  const url = `${API_BASE_URL}/api/campaigns/events?token=${encodeURIComponent(token)}`;
  const es = new EventSource(url);
  let openCount = 0;

  es.onopen = () => {
    openCount += 1;
    if (openCount > 1) {
      opts.onReconnect?.();
    }
  };

  es.onmessage = (ev) => {
    try {
      const parsed = JSON.parse(ev.data);
      if (parsed?.type !== 'generation:update') return;
      const { type: _drop, ...job } = parsed as { type: string } & GenerationJob;
      opts.onUpdate(job);
    } catch (err) {
      opts.onError?.(err);
    }
  };

  es.onerror = (err) => {
    opts.onError?.(err);
  };

  return () => {
    try {
      es.close();
    } catch {
      /* noop */
    }
  };
}

/* ---------- Row state resolver ---------- */
//
// Single source of truth for what a worksheet row should render. The UI
// switches on `kind`; no other branching is allowed in the row markup.

export type RowState =
  | { kind: 'not-started' }
  | { kind: 'in-progress' }
  | { kind: 'ready' }
  | { kind: 'generating'; percent: number; phase: string | null }
  | { kind: 'completed'; percent: 100; draftId: number }
  /** Publish action is in flight (server-side n8n is still working).
   *  Distinct from `generating` — that's content generation, this is the
   *  WordPress publish step. */
  | { kind: 'publishing'; draftId: number }
  | { kind: 'failed'; percent: number; error: string }
  | { kind: 'published'; draftId: number; liveUrl: string | null };

const isJobActive = (job: GenerationJob | null): boolean =>
  !!job && (job.status === 'pending' || job.status === 'generating');

export interface ResolveRowOptions {
  /** True when a publish action is in flight for this topic — set
   *  optimistically by the worksheet on Publish click and confirmed by
   *  SSE while the WordPress publish is processing in the background. */
  isPublishing?: boolean;
  /** Latest publish-channel SSE status for this topic's draft, when one
   *  has arrived. Treated as authoritative over `topic.publishStatus`
   *  (which is only refreshed by structure refetches and so lags the
   *  live event). Lets the row flip to `published` the instant the
   *  webhook fires, instead of waiting for a reload. */
  livePublishStatus?: 'published' | 'failed' | 'generating';
  livePublishedUrl?: string | null;
}

export function resolveRowState(
  topic: WorksheetTopic,
  options: ResolveRowOptions = {}
): RowState {
  const job = topic.job;

  // Publishing wins over everything once we have a draft — it's a foreground
  // user action that the row needs to acknowledge immediately.
  if (topic.draftId && options.isPublishing) {
    return { kind: 'publishing', draftId: topic.draftId };
  }

  // Live SSE publish update wins over stale topic.publishStatus. SSE arrives
  // before the next structure refetch, so without this check the row flickers
  // back to `completed` after the optimistic flag clears.
  if (topic.draftId && options.livePublishStatus === 'published') {
    return {
      kind: 'published',
      draftId: topic.draftId,
      liveUrl: options.livePublishedUrl ?? topic.liveUrl,
    };
  }

  // Live job wins — overrides any stale data inferred from the topic.
  if (isJobActive(job)) {
    return {
      kind: 'generating',
      percent: Math.max(5, Math.min(95, job!.progress)),
      phase: job!.phase,
    };
  }

  // Last attempt failed and there's no draft yet — surface the error.
  if (job?.status === 'failed' && !topic.draftId) {
    return {
      kind: 'failed',
      percent: Math.max(0, Math.min(95, job.progress)),
      error: job.error || 'Generation failed.',
    };
  }

  // Published trumps "completed" — content went live.
  if (topic.publishStatus?.toLowerCase() === 'published' && topic.draftId) {
    return { kind: 'published', draftId: topic.draftId, liveUrl: topic.liveUrl };
  }

  // Draft on disk — ready to review/publish.
  if (topic.draftId) {
    return { kind: 'completed', percent: 100, draftId: topic.draftId };
  }

  // Nothing generated yet — derive from data shape.
  const hasTitle = Boolean(topic.title.trim());
  const hasKeywords = topic.keywords.length > 0;
  const hasPrimary = topic.keywords.some((k) => k.isPrimary);

  if (hasTitle && hasPrimary) return { kind: 'ready' };
  if (hasTitle || hasKeywords) return { kind: 'in-progress' };
  return { kind: 'not-started' };
}
