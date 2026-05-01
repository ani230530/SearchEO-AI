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
