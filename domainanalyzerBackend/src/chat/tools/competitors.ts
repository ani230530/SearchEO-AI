// Competitor tools (writes).
import { tool } from 'ai';
import { z } from 'zod';
import { apiCall, resolveDomainId, type ToolContext } from './_shared';

export function competitorTools(ctx: ToolContext) {
  return {
    discoverCompetitors: tool({
      description: 'Run competitor discovery for a domain (LLM + web search; takes a moment).',
      inputSchema: z.object({ domainId: z.number().optional() }),
      execute: async (input) => {
        const id = resolveDomainId(input, ctx);
        const data = await apiCall(ctx.jwt, 'POST', `/wizard/domain/${id}/competitors`);
        const competitors = Array.isArray(data?.competitors) ? data.competitors : [];
        return { domainId: id, discovered: competitors.length, competitors: competitors.slice(0, 15).map((c: any) => ({ id: c.id, host: c.competitorHost ?? c.host })) };
      },
    }),

    addCompetitor: tool({
      description: 'Add a specific competitor (by URL/host) to a domain.',
      inputSchema: z.object({ url: z.string().min(1), domainId: z.number().optional() }),
      execute: async (input) => {
        const id = resolveDomainId(input, ctx);
        await apiCall(ctx.jwt, 'POST', `/wizard/domain/${id}/competitors/add`, { url: input.url });
        return { domainId: id, added: input.url };
      },
    }),

    selectCompetitors: tool({
      description: "Set which competitors are selected for a domain's analysis (replaces the selection).",
      inputSchema: z.object({ competitorIds: z.array(z.number()), domainId: z.number().optional() }),
      execute: async (input) => {
        const id = resolveDomainId(input, ctx);
        await apiCall(ctx.jwt, 'POST', `/wizard/domain/${id}/competitors/select`, { competitorIds: input.competitorIds });
        return { domainId: id, selected: input.competitorIds.length };
      },
    }),
  };
}
