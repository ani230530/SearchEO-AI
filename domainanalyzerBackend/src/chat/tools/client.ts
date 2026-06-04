// "Effect" tools — they don't read/write data; they instruct the browser to do
// something (navigate, open a modal, open the add-domain wizard). They execute
// SERVER-side by simply echoing a structured intent, so the agent's turn
// completes in one stream. The frontend watches for these results and performs
// the actual browser action as a side effect (see useAgentChat). This avoids
// the fragile client-tool round-trip that left "Running navigate…" hanging.
import { tool } from 'ai';
import { z } from 'zod';

export function clientTools() {
  return {
    navigate: tool({
      description: 'Navigate the user to a page in the app so they can keep working in the real UI. To open a specific worksheet/project, use destination "worksheets" with its worksheetId.',
      inputSchema: z.object({
        destination: z.enum(['ai-report', 'prompt-tracking', 'competitors', 'worksheets', 'dashboard', 'gsc', 'settings']),
        domainId: z.number().optional().describe('Domain for ai-report / prompt-tracking / competitors.'),
        worksheetId: z.number().optional().describe('Open this specific worksheet/project (with destination "worksheets").'),
      }),
      execute: async (input) => ({ action: 'navigate' as const, ...input }),
    }),

    openWorksheetPicker: tool({
      description: 'Open the "Add to worksheet" picker so the user can add a prompt/topic to a content worksheet and draft a blog.',
      inputSchema: z.object({ promptId: z.number().optional(), domainId: z.number().optional() }),
      execute: async (input) => ({ action: 'openWorksheetPicker' as const, ...input }),
    }),

    startDomainAudit: tool({
      description: 'Add a NEW domain/website. Opens the audit wizard (a live crawl that streams progress) — use this when the user wants to add or analyze a new website. Domains cannot be created silently.',
      inputSchema: z.object({ url: z.string().optional().describe('The website URL, if the user gave one.') }),
      execute: async (input) => ({ action: 'startDomainAudit' as const, url: input.url ?? null }),
    }),
  };
}
