// Integration tools: Google Search Console + WordPress publishing.
import { tool } from 'ai';
import { z } from 'zod';
import { apiCall, type ToolContext } from './_shared';

export function integrationTools(ctx: ToolContext) {
  return {
    getGscStatus: tool({
      description: 'Check whether Google Search Console is connected for the user.',
      inputSchema: z.object({}),
      execute: async () => {
        const data = await apiCall(ctx.jwt, 'GET', '/gsc/status');
        return { connected: !!(data?.connected ?? data?.isConnected), property: data?.property ?? data?.selectedProperty ?? null };
      },
    }),

    getGscProperties: tool({
      description: 'List the Google Search Console properties available to the user (requires GSC connected).',
      inputSchema: z.object({}),
      execute: async () => {
        const data = await apiCall(ctx.jwt, 'GET', '/gsc/properties');
        const props = Array.isArray(data?.properties) ? data.properties : Array.isArray(data) ? data : [];
        return { properties: props.slice(0, 25).map((p: any) => (typeof p === 'string' ? p : p.siteUrl ?? p.url ?? p)) };
      },
    }),

    getWordpressStatus: tool({
      description: "Check the user's WordPress publishing integration (site URL + connection).",
      inputSchema: z.object({}),
      execute: async () => {
        const data = await apiCall(ctx.jwt, 'GET', '/publish/wordpress');
        return { connected: !!(data?.siteUrl || data?.connected), siteUrl: data?.siteUrl ?? null, username: data?.username ?? null, lastPublishedAt: data?.lastPublishedAt ?? null };
      },
    }),

    publishDraft: tool({
      description: 'Publish a generated draft to the connected WordPress site. Destructive (goes live) — only call with confirm:true after the user explicitly confirms.',
      inputSchema: z.object({ draftId: z.number(), confirm: z.boolean() }),
      execute: async (input) => {
        if (!input.confirm) return { published: false, needsConfirmation: true };
        const data = await apiCall(ctx.jwt, 'POST', '/publish/publish', { draftId: input.draftId });
        return { published: data?.status === 'published' || !!data?.publishedUrl, draftId: input.draftId, publishedUrl: data?.publishedUrl ?? null, status: data?.status ?? null };
      },
    }),
  };
}
