/**
 * AddDomainModal — single self-contained wizard component.
 *
 * Drives the full add-domain pipeline against `/api/wizard/*`:
 *
 *   Step 1  profile form           — POST /api/wizard/validate, then /api/wizard/domain (SSE)
 *   Step 2  competitor selection   — POST /api/wizard/domain/:id/competitors then …/competitors/select
 *   Step 3  topic selection        — POST /api/wizard/domain/:id/topics, debounced /draft, then /select
 *
 * No SSE for the topics or competitor phases — they're synchronous JSON. SSE is
 * reserved for the long-running crawl + (future) AI-query run phases.
 */

import { fetchEventSource } from '@microsoft/fetch-event-source';
import { Globe, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { maskDomainId } from '@/lib/domainUtils';

type Phase = 'idle' | 'crawl' | 'competitors' | 'topics' | 'done' | 'error';

interface AddDomainModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialUrl?: string;
  lockUrl?: boolean;
  title?: string;
  description?: string;
  ctaLabel?: string;
}

interface CompetitorRow {
  competitorHost: string;
  rank: number | null;
  threatLevel: 'High' | 'Medium' | 'Low' | null;
  reasoning: string | null;
  similarityScore: number | null;
  industry: string | null;
  location: string | null;
  isSelected?: boolean;
}

interface TopicItem {
  id: number;
  type: 'keyword' | 'prompt';
  text: string;
  intent: string | null;
  source: 'ai' | 'custom';
  parentKeywordId?: number;
}

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3002';

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('authToken');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body ?? {}),
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${path}: ${text || res.statusText}`);
  }
  return res.json();
}

async function patchJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${path}: ${text || res.statusText}`);
  }
  return res.json();
}

/** Subscribe to /api/wizard/domain SSE. Resolves with the new domainId. */
function streamCrawl(args: {
  url: string;
  country: string;
  state: string;
  industry: string;
  customSeeds: { keywords: string[]; prompts: string[] };
  signal: AbortSignal;
  onProgress: (pct: number, step: string) => void;
}): Promise<number> {
  return new Promise((resolve, reject) => {
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    args.signal.addEventListener('abort', onAbort);

    let domainId: number | null = null;

    fetchEventSource(`${API_BASE_URL}/api/wizard/domain`, {
      method: 'POST',
      // credentials:'include' matches the rest of the wizard SSE
      // callsites (Step2Crawling, Step5RunQueries) so the wizard
      // cookie round-trips in cross-site deploys. This modal is
      // dashboard-only and Bearer-authed in practice, so the cookie
      // path isn't strictly needed — included for uniformity.
      credentials: 'include',
      headers: authHeaders(),
      body: JSON.stringify({
        url: args.url,
        country: args.country || undefined,
        state: args.state || undefined,
        industry: args.industry || undefined,
        customSeeds: args.customSeeds,
      }),
      signal: ctrl.signal,
      openWhenHidden: true,
      onmessage(ev) {
        try {
          const data = JSON.parse(ev.data ?? '{}') as Record<string, unknown>;
          if (data.type === 'domain_created' && typeof data.domainId === 'number') {
            domainId = data.domainId;
          }
          if (data.type === 'progress') {
            const pct = typeof data.progress === 'number' ? data.progress : 0;
            const step = typeof data.step === 'string' ? data.step : '';
            args.onProgress(pct, step);
          }
          if (data.type === 'complete') {
            args.signal.removeEventListener('abort', onAbort);
            ctrl.abort();
            if (domainId == null) reject(new Error('Crawl finished without a domainId'));
            else resolve(domainId);
          }
          if (data.type === 'error') {
            args.signal.removeEventListener('abort', onAbort);
            ctrl.abort();
            reject(new Error(typeof data.error === 'string' ? data.error : 'Crawl failed'));
          }
        } catch {
          /* ignore malformed event */
        }
      },
      onerror(err) {
        args.signal.removeEventListener('abort', onAbort);
        ctrl.abort();
        reject(err instanceof Error ? err : new Error('Crawl SSE failed'));
        throw err; // stop retrying
      },
    }).catch(() => undefined);
  });
}

export function AddDomainModal({
  open,
  onOpenChange,
  initialUrl,
  lockUrl,
  title = 'Add domain',
  description = 'We crawl your site, find competitors, and build the prompt set we will run against the AI models.',
  ctaLabel = 'Start audit',
}: AddDomainModalProps) {
  const navigate = useNavigate();

  // Step 1 — profile form
  const [url, setUrl] = useState(initialUrl ?? '');
  const [country, setCountry] = useState('');
  const [stateField, setStateField] = useState('');
  const [industry, setIndustry] = useState('');
  const [customKeywords, setCustomKeywords] = useState('');
  const [customPrompts, setCustomPrompts] = useState('');

  // Wizard state
  const [phase, setPhase] = useState<Phase>('idle');
  const [progressPct, setProgressPct] = useState(0);
  const [progressStep, setProgressStep] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [domainId, setDomainId] = useState<number | null>(null);

  const [competitors, setCompetitors] = useState<CompetitorRow[]>([]);
  const [selectedHosts, setSelectedHosts] = useState<Set<string>>(new Set());

  const [topics, setTopics] = useState<TopicItem[]>([]);
  const [selectedKeywordIds, setSelectedKeywordIds] = useState<Set<number>>(new Set());
  const [selectedPromptIds, setSelectedPromptIds] = useState<Set<number>>(new Set());

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (initialUrl !== undefined) setUrl(initialUrl);
  }, [initialUrl]);

  useEffect(() => {
    if (!open) {
      // Reset on close.
      abortRef.current?.abort();
      abortRef.current = null;
      setPhase('idle');
      setError(null);
      setProgressPct(0);
      setProgressStep('');
    }
  }, [open]);

  const customSeeds = useMemo(
    () => ({
      keywords: customKeywords.split(',').map((s) => s.trim()).filter(Boolean),
      prompts: customPrompts.split('\n').map((s) => s.trim()).filter(Boolean),
    }),
    [customKeywords, customPrompts]
  );

  async function handleStart() {
    setError(null);
    setPhase('crawl');
    setProgressPct(2);
    setProgressStep('Validating URL…');

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      // 1. Validate (fast preflight). Stop early on hard failure.
      const validation = await postJson<{ ok: boolean; reason?: string }>(
        '/api/wizard/validate',
        { url },
        ctrl.signal
      );
      if (!validation.ok) throw new Error(validation.reason ?? 'URL validation failed');

      // 2. Crawl + profile via SSE.
      const id = await streamCrawl({
        url,
        country,
        state: stateField,
        industry,
        customSeeds,
        signal: ctrl.signal,
        onProgress: (pct, step) => {
          setProgressPct(Math.max(progressPct, pct));
          if (step) setProgressStep(step);
        },
      });
      setDomainId(id);

      // 3. Competitor pipeline.
      setPhase('competitors');
      setProgressPct(0);
      setProgressStep('Discovering, verifying and ranking competitors…');
      const compResp = await postJson<{ competitors: CompetitorRow[] }>(
        `/api/wizard/domain/${id}/competitors`,
        {},
        ctrl.signal
      );
      setCompetitors(compResp.competitors ?? []);
      setSelectedHosts(new Set((compResp.competitors ?? []).slice(0, 5).map((c) => c.competitorHost)));
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setPhase('error');
      setError(err instanceof Error ? err.message : 'Wizard failed');
    }
  }

  async function handleConfirmCompetitors() {
    if (!domainId) return;
    setError(null);
    setProgressStep('Saving competitor selection…');
    try {
      await postJson(`/api/wizard/domain/${domainId}/competitors/select`, {
        hosts: Array.from(selectedHosts),
      });
      setPhase('topics');
      setProgressStep('Generating topics…');
      const topicsResp = await postJson<{ items: TopicItem[] }>(
        `/api/wizard/domain/${domainId}/topics`,
        {}
      );
      setTopics(topicsResp.items ?? []);
      // Default-select all generated items.
      setSelectedKeywordIds(new Set(topicsResp.items.filter((i) => i.type === 'keyword').map((i) => i.id)));
      setSelectedPromptIds(new Set(topicsResp.items.filter((i) => i.type === 'prompt').map((i) => i.id)));
    } catch (err) {
      setPhase('error');
      setError(err instanceof Error ? err.message : 'Topics generation failed');
    }
  }

  // Debounced auto-save of selection draft.
  useEffect(() => {
    if (!domainId || phase !== 'topics') return;
    const timer = setTimeout(() => {
      patchJson(`/api/wizard/domain/${domainId}/draft`, {
        keywordIds: Array.from(selectedKeywordIds),
        promptIds: Array.from(selectedPromptIds),
      }).catch(() => undefined);
    }, 600);
    return () => clearTimeout(timer);
  }, [domainId, phase, selectedKeywordIds, selectedPromptIds]);

  async function handleGenerateReport() {
    if (!domainId) return;
    setError(null);
    setProgressStep('Locking selection…');
    try {
      await postJson(`/api/wizard/domain/${domainId}/select`, {
        keywordIds: Array.from(selectedKeywordIds),
        promptIds: Array.from(selectedPromptIds),
      });
      setPhase('done');
      // Navigate to results page (preserves existing route shape).
      navigate(`/ai-results/${maskDomainId(domainId)}`);
    } catch (err) {
      setPhase('error');
      setError(err instanceof Error ? err.message : 'Final selection failed');
    }
  }

  const renderProgress = () => (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
        <span className="text-sm text-slate-700">{progressStep || 'Working…'}</span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded">
        <div
          className="h-1.5 bg-blue-600 rounded transition-all"
          style={{ width: `${Math.min(100, Math.max(0, progressPct))}%` }}
        />
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-4 w-4" /> {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {phase === 'idle' || phase === 'error' ? (
          <div className="space-y-4">
            <div>
              <label className="text-sm text-slate-600 mb-1 block">Domain URL</label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="example.com"
                disabled={lockUrl}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Country" />
              <Input value={stateField} onChange={(e) => setStateField(e.target.value)} placeholder="State" />
              <Input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Industry" />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Custom keywords (comma-separated)</label>
              <Input
                value={customKeywords}
                onChange={(e) => setCustomKeywords(e.target.value)}
                placeholder="ai seo audit, best ai visibility tool"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Custom prompts (one per line)</label>
              <textarea
                className="w-full text-sm rounded border border-slate-200 p-2 min-h-[60px]"
                value={customPrompts}
                onChange={(e) => setCustomPrompts(e.target.value)}
                placeholder="What is the best AI visibility tool for SaaS startups?"
              />
            </div>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleStart} disabled={!url.trim()}>
                {ctaLabel}
              </Button>
            </div>
          </div>
        ) : phase === 'crawl' ? (
          renderProgress()
        ) : phase === 'competitors' ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              {competitors.length === 0 ? renderProgress() : 'Pick the competitors you want to track:'}
            </p>
            <div className="max-h-72 overflow-y-auto space-y-1">
              {competitors.map((c) => (
                <label
                  key={c.competitorHost}
                  className="flex items-start gap-3 p-2 rounded hover:bg-slate-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedHosts.has(c.competitorHost)}
                    onChange={(e) => {
                      const next = new Set(selectedHosts);
                      if (e.target.checked) next.add(c.competitorHost);
                      else next.delete(c.competitorHost);
                      setSelectedHosts(next);
                    }}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-slate-900">{c.competitorHost}</span>
                      {c.threatLevel ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                          {c.threatLevel}
                        </span>
                      ) : null}
                      {typeof c.similarityScore === 'number' ? (
                        <span className="text-[10px] text-slate-400">
                          score {c.similarityScore.toFixed(2)}
                        </span>
                      ) : null}
                    </div>
                    {c.reasoning ? <p className="text-xs text-slate-500">{c.reasoning}</p> : null}
                  </div>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleConfirmCompetitors} disabled={competitors.length === 0}>
                Continue
              </Button>
            </div>
          </div>
        ) : phase === 'topics' ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              {topics.length === 0 ? renderProgress() : 'Confirm the keywords + prompts to test against AI models:'}
            </p>
            <div className="max-h-80 overflow-y-auto space-y-1">
              {topics.map((t) => {
                const isKeyword = t.type === 'keyword';
                const checked = isKeyword
                  ? selectedKeywordIds.has(t.id)
                  : selectedPromptIds.has(t.id);
                return (
                  <label
                    key={`${t.type}-${t.id}`}
                    className={`flex items-center gap-3 p-2 rounded hover:bg-slate-50 cursor-pointer ${
                      isKeyword ? 'bg-slate-50/50 font-medium' : 'pl-8 text-sm'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        if (isKeyword) {
                          const next = new Set(selectedKeywordIds);
                          if (e.target.checked) next.add(t.id);
                          else next.delete(t.id);
                          setSelectedKeywordIds(next);
                        } else {
                          const next = new Set(selectedPromptIds);
                          if (e.target.checked) next.add(t.id);
                          else next.delete(t.id);
                          setSelectedPromptIds(next);
                        }
                      }}
                    />
                    <span className="flex-1">{t.text}</span>
                    {t.intent ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                        {t.intent}
                      </span>
                    ) : null}
                  </label>
                );
              })}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleGenerateReport} disabled={selectedPromptIds.size === 0}>
                Generate report
              </Button>
            </div>
          </div>
        ) : phase === 'done' ? (
          <p className="text-sm text-slate-600">Selection saved. Redirecting…</p>
        ) : null}

        {error && phase !== 'idle' ? (
          <p className="text-sm text-red-600 mt-2">{error}</p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export default AddDomainModal;
