// Composes every agent tool from the per-area modules.
import type { ToolContext } from './_shared';
import { domainTools } from './domains';
import { analysisTools } from './analysis';
import { promptTools } from './prompts';
import { competitorTools } from './competitors';
import { campaignTools } from './campaigns';
import { integrationTools } from './integrations';
import { clientTools } from './client';

export type { ToolContext } from './_shared';

export function buildTools(ctx: ToolContext) {
  return {
    ...domainTools(ctx),
    ...analysisTools(ctx),
    ...promptTools(ctx),
    ...competitorTools(ctx),
    ...campaignTools(ctx),
    ...integrationTools(ctx),
    ...clientTools(),
  };
}

export type AgentTools = ReturnType<typeof buildTools>;
