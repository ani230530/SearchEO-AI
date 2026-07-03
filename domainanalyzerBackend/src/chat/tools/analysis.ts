// Read-only analysis tools (report, trends, history, competitors).
import { tool } from 'ai';
import { z } from 'zod';
import { apiCall, resolveDomainId, type ToolContext } from './_shared';

export function analysisTools(ctx: ToolContext) {
  return {
    getDomainReport: tool({
      description: 'Get the AI-visibility report for a domain: overall visibility score, per-model breakdown, and top prompts.',
      inputSchema: z.object({ domainId: z.number().optional() }),
      execute: async (input) => {
        const id = resolveDomainId(input, ctx);
        const data = await apiCall(ctx.jwt, 'GET', `/wizard/domain/${id}/report`);
        const topPrompts = (Array.isArray(data?.topPrompts) ? data.topPrompts : [])
          .filter((p: any) => p.type === 'prompt')
          .slice(0, 8)
          .map((p: any) => ({ id: p.rawId ?? p.id, phrase: p.phrase, sov: p.sov, mentions: p.mentions }));
        return {
          domainId: id,
          host: data?.domainInfo?.host ?? null,
          visibilityScore: data?.metrics?.visibilityScore ?? null,
          mentionRate: data?.metrics?.mentionRate ?? null,
          modelPerformance: (data?.metrics?.modelPerformance ?? []).map((m: any) => ({ model: m.model, visibility: m.visibility, mentions: m.mentions })),
          topPrompts,
        };
      },
    }),

    getTrackedPrompts: tool({
      description: 'List the prompts the user tracks daily for a domain, with day-over-day visibility trend.',
      inputSchema: z.object({ domainId: z.number().optional() }),
      execute: async (input) => {
        const id = resolveDomainId(input, ctx);
        const data = await apiCall(ctx.jwt, 'GET', `/wizard/domain/${id}/tracked-prompts`);
        const prompts = Array.isArray(data?.prompts) ? data.prompts : [];
        return {
          domainId: id,
          count: prompts.length,
          latestRunAt: data?.latestRunAt ?? null,
          prompts: prompts.slice(0, 25).map((p: any) => ({ id: p.rawId ?? p.id, phrase: p.phrase, sov: p.sov, weekTrendDelta: p.weekTrend?.delta ?? null })),
        };
      },
    }),

    getPromptHistory: tool({
      description: "Get one prompt's visibility over time (per run), to show a trend.",
      inputSchema: z.object({ promptId: z.number(), domainId: z.number().optional() }),
      execute: async (input) => {
        const id = resolveDomainId(input, ctx);
        const data = await apiCall(ctx.jwt, 'GET', `/wizard/domain/${id}/prompts/${input.promptId}/history`);
        return {
          promptId: input.promptId,
          phrase: data?.prompt?.text ?? null,
          points: (Array.isArray(data?.runs) ? data.runs : []).map((r: any) => ({ startedAt: r.startedAt, presenceRate: r.presenceRate })),
        };
      },
    }),

    getKeywordHistory: tool({
      description: "Get a keyword's visibility over time (rolled up across its prompts).",
      inputSchema: z.object({ keywordId: z.number(), domainId: z.number().optional() }),
      execute: async (input) => {
        const id = resolveDomainId(input, ctx);
        const data = await apiCall(ctx.jwt, 'GET', `/wizard/domain/${id}/keywords/${input.keywordId}/history`);
        return {
          keywordId: input.keywordId,
          phrase: data?.keyword?.term ?? null,
          points: (Array.isArray(data?.runs) ? data.runs : []).map((r: any) => ({ startedAt: r.startedAt, presenceRate: r.presenceRate })),
        };
      },
    }),

    getRuns: tool({
      description: 'List the completed AI analysis runs for a domain (history of audits).',
      inputSchema: z.object({ domainId: z.number().optional() }),
      execute: async (input) => {
        const id = resolveDomainId(input, ctx);
        const data = await apiCall(ctx.jwt, 'GET', `/wizard/domain/${id}/runs`);
        const runs = Array.isArray(data?.runs) ? data.runs : Array.isArray(data) ? data : [];
        return { domainId: id, runs: runs.slice(0, 12).map((r: any) => ({ id: r.id, startedAt: r.startedAt, kind: r.kind, visibilityScore: r.summary?.avgOverall ?? r.visibilityScore ?? null })) };
      },
    }),

    getTrends: tool({
      description: "Get a domain's overall visibility trend over time across runs.",
      inputSchema: z.object({ domainId: z.number().optional() }),
      execute: async (input) => {
        const id = resolveDomainId(input, ctx);
        const data = await apiCall(ctx.jwt, 'GET', `/wizard/domain/${id}/trends`);
        const runs = Array.isArray(data?.runs) ? data.runs : [];
        return { domainId: id, points: runs.map((r: any) => ({ startedAt: r.startedAt, visibility: r.presenceRate ?? r.visibility ?? null })) };
      },
    }),

    getCompetitors: tool({
      description: 'List the competitors discovered/selected for a domain.',
      inputSchema: z.object({ domainId: z.number().optional() }),
      execute: async (input) => {
        const id = resolveDomainId(input, ctx);
        const data = await apiCall(ctx.jwt, 'GET', `/wizard/domain/${id}/competitors`);
        const competitors = Array.isArray(data?.competitors) ? data.competitors : Array.isArray(data) ? data : [];
        return { domainId: id, competitors: competitors.slice(0, 25).map((c: any) => ({ id: c.id, host: c.competitorHost ?? c.host, name: c.name ?? null, isSelected: !!c.isSelected })) };
      },
    }),

    getCompetitorAnalysis: tool({
      description: 'Get how often competitors are mentioned vs. the brand across AI answers, with sentiment.',
      inputSchema: z.object({ domainId: z.number().optional() }),
      execute: async (input) => {
        const id = resolveDomainId(input, ctx);
        const data = await apiCall(ctx.jwt, 'GET', `/wizard/domain/${id}/competitor-analysis`);
        const rows = Array.isArray(data?.competitors) ? data.competitors : Array.isArray(data?.topCompetitors) ? data.topCompetitors : [];
        return { domainId: id, competitors: rows.slice(0, 12).map((c: any) => ({ host: c.host ?? c.competitorHost, mentions: c.mentions ?? c.count ?? null, sentiment: c.sentiment ?? null })) };
      },
    }),
  };
}
