// Domain (website) tools.
import { tool } from 'ai';
import { z } from 'zod';
import { apiCall, resolveDomainId, type ToolContext } from './_shared';

export function domainTools(ctx: ToolContext) {
  return {
    listDomains: tool({
      description: "List the user's domains (websites). Use to resolve which domain the user means before a domain-scoped action.",
      inputSchema: z.object({}),
      execute: async () => {
        const data = await apiCall(ctx.jwt, 'GET', '/wizard/domains');
        const domains = Array.isArray(data?.domains) ? data.domains : [];
        return {
          domains: domains.map((d: any) => ({
            id: d.id,
            host: d.host,
            url: d.url,
            isCompanyDomain: !!d.isCompanyDomain,
            currentStep: d.currentStep ?? null,
            visibilityScore: d.metrics?.visibilityScore ?? d.visibilityScore ?? null,
          })),
        };
      },
    }),

    getDomain: tool({
      description: 'Get details for one domain: company profile, industry, inferred summary, and progress.',
      inputSchema: z.object({ domainId: z.number().optional() }),
      execute: async (input) => {
        const id = resolveDomainId(input, ctx);
        const d = await apiCall(ctx.jwt, 'GET', `/wizard/domain/${id}`);
        const dom = d?.domain ?? d;
        return {
          id,
          host: dom?.host ?? null,
          url: dom?.url ?? null,
          companyName: dom?.inferred?.companyName ?? null,
          industry: dom?.profile?.industry ?? null,
          summary: dom?.inferred?.summary ?? null,
        };
      },
    }),

    resyncDomain: tool({
      description: 'Re-crawl a domain and refresh its inferred company profile/context. Takes a moment.',
      inputSchema: z.object({ domainId: z.number().optional() }),
      execute: async (input) => {
        const id = resolveDomainId(input, ctx);
        await apiCall(ctx.jwt, 'POST', `/wizard/domain/${id}/resync-context`);
        return { domainId: id, resynced: true };
      },
    }),

    restartDomain: tool({
      description: "Reset a domain's wizard/analysis state and delete downstream data (competitors, prompts, runs). Destructive — only call with confirm:true after the user explicitly confirms.",
      inputSchema: z.object({ domainId: z.number().optional(), confirm: z.boolean() }),
      execute: async (input) => {
        if (!input.confirm) return { ok: false, needsConfirmation: true };
        const id = resolveDomainId(input, ctx);
        await apiCall(ctx.jwt, 'POST', `/wizard/domain/${id}/restart`);
        return { domainId: id, restarted: true };
      },
    }),

    deleteDomain: tool({
      description: 'Permanently delete a domain and ALL its data. Destructive and irreversible — only call with confirm:true after the user explicitly confirms.',
      inputSchema: z.object({ domainId: z.number(), confirm: z.boolean() }),
      execute: async (input) => {
        if (!input.confirm) return { ok: false, needsConfirmation: true };
        await apiCall(ctx.jwt, 'DELETE', `/wizard/domain/${input.domainId}`);
        return { domainId: input.domainId, deleted: true };
      },
    }),
  };
}
