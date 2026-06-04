// Chat-agent language model.
//
// Reuses the existing OPENROUTER_API_KEY (the same key the audit roster uses in
// wizard/runService.ts) so no new secret is required. The model id is
// overridable via CHAT_AGENT_MODEL; the default is a strong tool-caller.

import { createOpenRouter } from '@openrouter/ai-sdk-provider';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const APP_URL = process.env.OPENROUTER_REFERRER || 'http://localhost:3002';

// Default to a model with reliable tool calling. Override per-env if needed.
export const AGENT_MODEL_ID = process.env.CHAT_AGENT_MODEL || 'anthropic/claude-sonnet-4.5';

const openrouter = OPENROUTER_API_KEY
  ? createOpenRouter({
      apiKey: OPENROUTER_API_KEY,
      compatibility: 'strict',
      headers: {
        'HTTP-Referer': APP_URL,
        'X-Title': 'SearchEO-AI Agent',
      },
    })
  : null;

/** True when the agent can run (key present). */
export const isAgentConfigured = (): boolean => openrouter !== null;

/** The configured agent language model. Throws if the key is missing. */
export function getAgentModel() {
  if (!openrouter) {
    throw new Error('OPENROUTER_API_KEY not configured — chat agent is unavailable.');
  }
  return openrouter(AGENT_MODEL_ID);
}
