// Chat-agent language model.
//
// Reuses the existing OPENROUTER_API_KEY (the same key the audit roster uses in
// wizard/runService.ts) so no new secret is required. The model id is
// overridable via CHAT_AGENT_MODEL; the default is a strong tool-caller.

import { getOpenRouterLanguageModel, isOpenRouterConfigured } from '../services/openRouterClient';

// Default to a model with reliable tool calling. Override per-env if needed.
export const AGENT_MODEL_ID = process.env.CHAT_AGENT_MODEL || 'anthropic/claude-sonnet-4.5';

/** True when the agent can run (key present). */
export const isAgentConfigured = (): boolean => isOpenRouterConfigured();

/** The configured agent language model. Throws if the key is missing. */
export function getAgentModel() {
  if (!isOpenRouterConfigured()) {
    throw new Error('OPENROUTER_API_KEY not configured — chat agent is unavailable.');
  }
  return getOpenRouterLanguageModel(AGENT_MODEL_ID, { usage: { include: true } });
}
