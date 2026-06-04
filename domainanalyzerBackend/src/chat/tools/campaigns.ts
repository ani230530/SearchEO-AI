// Worksheet / campaign tools (content planning + drafting).
import { tool } from 'ai';
import { z } from 'zod';
import { apiCall, type ToolContext } from './_shared';

export function campaignTools(ctx: ToolContext) {
  return {
    listWorksheets: tool({
      description: "List the user's content worksheets (projects/campaigns).",
      inputSchema: z.object({}),
      execute: async () => {
        const data = await apiCall(ctx.jwt, 'GET', '/campaigns');
        const campaigns = Array.isArray(data?.campaigns) ? data.campaigns : [];
        return { worksheets: campaigns.map((c: any) => ({ id: c.id, title: c.title, description: c.description ?? null })) };
      },
    }),

    createWorksheet: tool({
      description: 'Create a new content worksheet — also called a "project" or "campaign". "Project"/"worksheet"/"campaign" mean the same thing. (A "domain" is different — a website URL added via the audit wizard.)',
      inputSchema: z.object({ title: z.string().min(1) }),
      execute: async (input) => {
        const data = await apiCall(ctx.jwt, 'POST', '/campaigns', { title: input.title });
        return { created: true, id: data?.campaign?.id ?? null, title: data?.campaign?.title ?? input.title };
      },
    }),

    updateWorksheet: tool({
      description: 'Rename / update a worksheet (campaign).',
      inputSchema: z.object({ worksheetId: z.number(), title: z.string().min(1) }),
      execute: async (input) => {
        await apiCall(ctx.jwt, 'PUT', `/campaigns/${input.worksheetId}`, { title: input.title });
        return { worksheetId: input.worksheetId, title: input.title, updated: true };
      },
    }),

    deleteWorksheet: tool({
      description: 'Delete a worksheet (campaign) and its topics. Destructive — only call with confirm:true after the user explicitly confirms.',
      inputSchema: z.object({ worksheetId: z.number(), confirm: z.boolean() }),
      execute: async (input) => {
        if (!input.confirm) return { ok: false, needsConfirmation: true };
        await apiCall(ctx.jwt, 'DELETE', `/campaigns/${input.worksheetId}`);
        return { worksheetId: input.worksheetId, deleted: true };
      },
    }),

    getWorksheet: tool({
      description: 'Get a worksheet\'s structure: its topics and each topic\'s keywords + draft status.',
      inputSchema: z.object({ worksheetId: z.number() }),
      execute: async (input) => {
        const data = await apiCall(ctx.jwt, 'GET', `/campaigns/${input.worksheetId}/structure`);
        const topics = Array.isArray(data?.topics) ? data.topics : [];
        return {
          worksheetId: input.worksheetId,
          title: data?.title ?? data?.campaign?.title ?? null,
          topics: topics.slice(0, 25).map((t: any) => ({
            id: t.id,
            title: t.title,
            status: t.status ?? t.draftStatus ?? null,
            keywords: (Array.isArray(t.keywords) ? t.keywords : []).slice(0, 10).map((k: any) => ({ id: k.id, term: k.term, isPrimary: !!k.isPrimary, isLongtail: !!k.isLongtail })),
          })),
        };
      },
    }),

    addTopic: tool({
      description: 'Add a content topic to a worksheet.',
      inputSchema: z.object({ worksheetId: z.number(), title: z.string().min(1) }),
      execute: async (input) => {
        const data = await apiCall(ctx.jwt, 'POST', `/campaigns/${input.worksheetId}/topics`, { title: input.title });
        return { worksheetId: input.worksheetId, topicId: data?.topic?.id ?? null, title: input.title, added: true };
      },
    }),

    aiSuggestTopics: tool({
      description: 'Have AI suggest content topics for a worksheet (LLM; takes a moment).',
      inputSchema: z.object({ worksheetId: z.number() }),
      execute: async (input) => {
        const data = await apiCall(ctx.jwt, 'POST', `/campaigns/${input.worksheetId}/topics/ai`, {});
        const topics = Array.isArray(data?.topics) ? data.topics : [];
        return { worksheetId: input.worksheetId, suggested: topics.length, topics: topics.slice(0, 12).map((t: any) => ({ id: t.id, title: t.title })) };
      },
    }),

    updateTopicTitle: tool({
      description: "Update a topic's title.",
      inputSchema: z.object({ topicId: z.number(), title: z.string().min(1) }),
      execute: async (input) => {
        await apiCall(ctx.jwt, 'PUT', `/campaigns/topics/${input.topicId}`, { title: input.title });
        return { topicId: input.topicId, title: input.title, updated: true };
      },
    }),

    deleteTopic: tool({
      description: 'Delete a topic from a worksheet. Destructive — only call with confirm:true after the user explicitly confirms.',
      inputSchema: z.object({ topicId: z.number(), confirm: z.boolean() }),
      execute: async (input) => {
        if (!input.confirm) return { ok: false, needsConfirmation: true };
        await apiCall(ctx.jwt, 'DELETE', `/campaigns/topics/${input.topicId}`);
        return { topicId: input.topicId, deleted: true };
      },
    }),

    addKeyword: tool({
      description: 'Add a keyword to a topic.',
      inputSchema: z.object({ topicId: z.number(), term: z.string().min(1) }),
      execute: async (input) => {
        const data = await apiCall(ctx.jwt, 'POST', `/campaigns/topics/${input.topicId}/keywords`, { term: input.term });
        return { topicId: input.topicId, keywordId: data?.keyword?.id ?? null, term: input.term, added: true };
      },
    }),

    aiSuggestKeywords: tool({
      description: 'Have AI suggest keywords for a topic (LLM; takes a moment).',
      inputSchema: z.object({ topicId: z.number() }),
      execute: async (input) => {
        const data = await apiCall(ctx.jwt, 'POST', `/campaigns/topics/${input.topicId}/keywords/ai`, {});
        const keywords = Array.isArray(data?.keywords) ? data.keywords : [];
        return { topicId: input.topicId, suggested: keywords.length, keywords: keywords.slice(0, 15).map((k: any) => ({ id: k.id, term: k.term })) };
      },
    }),

    selectPrimaryKeyword: tool({
      description: 'Mark a keyword as the primary keyword for its topic.',
      inputSchema: z.object({ keywordId: z.number() }),
      execute: async (input) => {
        await apiCall(ctx.jwt, 'POST', `/campaigns/keywords/${input.keywordId}/select-primary`);
        return { keywordId: input.keywordId, primary: true };
      },
    }),

    selectLongtailKeyword: tool({
      description: 'Mark a keyword as a longtail keyword for its topic.',
      inputSchema: z.object({ keywordId: z.number() }),
      execute: async (input) => {
        await apiCall(ctx.jwt, 'POST', `/campaigns/keywords/${input.keywordId}/select-longtail`);
        return { keywordId: input.keywordId, longtail: true };
      },
    }),

    deselectKeyword: tool({
      description: 'Deselect a keyword (remove primary/longtail status).',
      inputSchema: z.object({ keywordId: z.number() }),
      execute: async (input) => {
        await apiCall(ctx.jwt, 'POST', `/campaigns/keywords/${input.keywordId}/deselect`);
        return { keywordId: input.keywordId, deselected: true };
      },
    }),

    deleteKeyword: tool({
      description: 'Delete a keyword from a topic. Destructive — only call with confirm:true after the user explicitly confirms.',
      inputSchema: z.object({ keywordId: z.number(), confirm: z.boolean() }),
      execute: async (input) => {
        if (!input.confirm) return { ok: false, needsConfirmation: true };
        await apiCall(ctx.jwt, 'DELETE', `/campaigns/keywords/${input.keywordId}`);
        return { keywordId: input.keywordId, deleted: true };
      },
    }),

    generateContent: tool({
      description: 'Start generating a blog draft for a topic. Runs in the background (returns a job). Confirm with the user first since it produces content.',
      inputSchema: z.object({
        topicId: z.number(),
        confirm: z.boolean(),
        templateType: z.enum(['blog', 'landing_page', 'case_study', 'faq']).optional(),
        tone: z.string().optional(),
        wordCount: z.number().optional(),
      }),
      execute: async (input) => {
        if (!input.confirm) return { started: false, needsConfirmation: true };
        const data = await apiCall(ctx.jwt, 'POST', `/campaigns/topics/${input.topicId}/generate`, {
          template_type: input.templateType ?? 'blog',
          ...(input.tone ? { tone: input.tone } : {}),
          ...(input.wordCount ? { word_count: input.wordCount } : {}),
        });
        return { started: true, topicId: input.topicId, jobId: data?.jobId ?? data?.job?.id ?? null };
      },
    }),

    getGenerationStatus: tool({
      description: 'Check the status of a topic\'s content-generation job.',
      inputSchema: z.object({ topicId: z.number() }),
      execute: async (input) => {
        const data = await apiCall(ctx.jwt, 'GET', `/campaigns/topics/${input.topicId}/generation-job`);
        return { topicId: input.topicId, status: data?.status ?? null, phase: data?.phase ?? null, progress: data?.progress ?? null, draftId: data?.draftId ?? null };
      },
    }),

    getDraft: tool({
      description: 'Get a generated blog draft (title, meta, status).',
      inputSchema: z.object({ draftId: z.number() }),
      execute: async (input) => {
        const data = await apiCall(ctx.jwt, 'GET', `/campaigns/drafts/${input.draftId}`);
        const d = data?.draft ?? data;
        return { draftId: input.draftId, title: d?.title ?? null, metaDescription: d?.metaDescription ?? null, status: d?.status ?? null, wordCount: d?.wordCount ?? null };
      },
    }),
  };
}
