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
};

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
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
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
  payload: { title: string; description?: string | null }
): Promise<WorksheetTopic[]> {
  const res = await fetch(`${API_BASE_URL}/api/campaigns/${campaignId}/topics`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      title: payload.title,
      description: payload.description ?? null,
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
  options?: { count?: number }
): Promise<WorksheetTopic[]> {
  const res = await fetch(
    `${API_BASE_URL}/api/campaigns/topics/${topicId}/keywords/ai`,
    {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ count: options?.count ?? 5 }),
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

export async function deleteKeyword(keywordId: number): Promise<WorksheetTopic[]> {
  const res = await fetch(`${API_BASE_URL}/api/campaigns/keywords/${keywordId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  const data = await handle<StructureResponse>(res);
  return data.structure.topics.map(normalizeTopic);
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

export interface GenerateTopicResult {
  topics: WorksheetTopic[];
  draftId: number;
  content: {
    title?: string;
    htmlContent: string;
    metaDescription?: string;
    slug?: string;
    primaryKeyword?: string;
    longtailKeywords?: string;
    featuredImageUrl?: string | null;
    featuredImageEnabled?: boolean;
    wordpressUrl?: string;
    wordpressPostId?: number | null;
    status?: string;
  };
}

export async function generateTopic(
  topicId: number,
  payload: GenerateTopicPayload
): Promise<GenerateTopicResult> {
  const res = await fetch(`${API_BASE_URL}/api/campaigns/topics/${topicId}/generate`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await handle<{
    success: boolean;
    structure: { topics: SerializedTopic[] };
    draftId: number;
    content: GenerateTopicResult['content'];
  }>(res);
  return {
    topics: data.structure.topics.map(normalizeTopic),
    draftId: data.draftId,
    content: data.content,
  };
}

/* ---------- Status helper ---------- */

export type WorksheetStatus =
  | 'Not Started'
  | 'In Progress'
  | 'Ready'
  | 'Generating'
  | 'Published'
  | 'Failed';

export function deriveWorksheetStatus(topic: WorksheetTopic): WorksheetStatus {
  const ps = topic.publishStatus?.toLowerCase();
  if (ps === 'generating' || ps === 'pending') return 'Generating';
  if (ps === 'published') return 'Published';
  if (ps === 'failed') return 'Failed';

  const hasTopic = Boolean(topic.title.trim());
  const hasKeywords = topic.keywords.length > 0;
  const hasPrimary = topic.keywords.some((k) => k.isPrimary);

  if (hasTopic && hasPrimary) return 'Ready';
  if (hasTopic || hasKeywords) return 'In Progress';
  return 'Not Started';
}
