// Prompt + keyword/topic generation tools (writes).
import { tool } from 'ai';
import { z } from 'zod';
import { apiCall, resolveDomainId, type ToolContext } from './_shared';

export function promptTools(ctx: ToolContext) {
  return {
    trackPrompt: tool({
      description: 'Start daily tracking for a prompt so its AI visibility is re-tested every day.',
      inputSchema: z.object({ promptId: z.number(), domainId: z.number().optional() }),
      execute: async (input) => {
        const id = resolveDomainId(input, ctx);
        await apiCall(ctx.jwt, 'PATCH', `/wizard/domain/${id}/prompts/track`, { promptIds: [input.promptId], tracked: true });
        return { promptId: input.promptId, tracked: true };
      },
    }),

    untrackPrompt: tool({
      description: 'Stop daily tracking for a prompt.',
      inputSchema: z.object({ promptId: z.number(), domainId: z.number().optional() }),
      execute: async (input) => {
        const id = resolveDomainId(input, ctx);
        await apiCall(ctx.jwt, 'PATCH', `/wizard/domain/${id}/prompts/track`, { promptIds: [input.promptId], tracked: false });
        return { promptId: input.promptId, tracked: false };
      },
    }),

    addCustomPrompt: tool({
      description: 'Add a custom prompt to a domain so it can be tested for AI visibility.',
      inputSchema: z.object({ text: z.string().min(1), domainId: z.number().optional() }),
      execute: async (input) => {
        const id = resolveDomainId(input, ctx);
        const data = await apiCall(ctx.jwt, 'POST', `/wizard/domain/${id}/prompts/custom`, { text: input.text });
        return { added: true, promptId: data?.prompt?.id ?? null, text: input.text };
      },
    }),

    editPrompt: tool({
      description: "Edit a prompt's text.",
      inputSchema: z.object({ promptId: z.number(), text: z.string().min(1), domainId: z.number().optional() }),
      execute: async (input) => {
        const id = resolveDomainId(input, ctx);
        await apiCall(ctx.jwt, 'PATCH', `/wizard/domain/${id}/prompts/${input.promptId}`, { text: input.text });
        return { promptId: input.promptId, text: input.text, updated: true };
      },
    }),

    testTrackedNow: tool({
      description: "Re-run ALL of a domain's tracked prompts right now. Costs LLM credits and takes several minutes. Only call with confirm:true after the user explicitly confirms.",
      inputSchema: z.object({ domainId: z.number().optional(), confirm: z.boolean() }),
      execute: async (input) => {
        if (!input.confirm) return { started: false, needsConfirmation: true };
        const id = resolveDomainId(input, ctx);
        const data = await apiCall(ctx.jwt, 'POST', `/wizard/domain/${id}/tracked-prompts/run-now`);
        return { started: true, domainId: id, trackedPrompts: data?.trackedPrompts ?? null };
      },
    }),

    generateKeywords: tool({
      description: 'Generate AI keyword suggestions for a domain (LLM; takes a moment).',
      inputSchema: z.object({ domainId: z.number().optional() }),
      execute: async (input) => {
        const id = resolveDomainId(input, ctx);
        const data = await apiCall(ctx.jwt, 'POST', `/wizard/domain/${id}/keywords`);
        const keywords = Array.isArray(data?.keywords) ? data.keywords : [];
        return { domainId: id, generated: keywords.length, keywords: keywords.slice(0, 20).map((k: any) => ({ id: k.id, term: k.term ?? k.keyword })) };
      },
    }),

    generateTopics: tool({
      description: 'Generate AI audit prompts/topics for a domain (LLM; takes a moment).',
      inputSchema: z.object({ domainId: z.number().optional() }),
      execute: async (input) => {
        const id = resolveDomainId(input, ctx);
        const data = await apiCall(ctx.jwt, 'POST', `/wizard/domain/${id}/topics`);
        const prompts = Array.isArray(data?.prompts) ? data.prompts : [];
        return { domainId: id, generated: prompts.length };
      },
    }),
  };
}
