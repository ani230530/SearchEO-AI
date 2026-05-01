type NodeEnv = 'development' | 'test' | 'production';

const parseNodeEnv = (value?: string): NodeEnv => {
  if (value === 'production' || value === 'test') return value;
  return 'development';
};

const NODE_ENV = parseNodeEnv(process.env.NODE_ENV);

const getRequired = (name: string): string => {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`[config] Missing required environment variable: ${name}`);
  }
  return value.trim();
};

const getOptional = (name: string, fallback?: string): string | undefined => {
  const value = process.env[name]?.trim();
  if (value) return value;
  return fallback;
};

const requireInProduction = (name: string): string | undefined => {
  if (NODE_ENV === 'production') return getRequired(name);
  return getOptional(name);
};

export const env = {
  NODE_ENV,
  isProduction: NODE_ENV === 'production',
  isDevelopment: NODE_ENV === 'development',
  PORT: Number(process.env.PORT || 3002),
  // LLM API keys – OpenRouter is the primary (single key for all 3 LLMs)
  OPENROUTER_API_KEY: getOptional('OPENROUTER_API_KEY'),
  // Optional services
  JINA_API_KEY: getOptional('JINA_API_KEY'),
  GPTZERO_API_KEY: getOptional('GPTZERO_API_KEY'),
  JWT_SECRET: getRequired('JWT_SECRET'),
  REFRESH_TOKEN_SECRET: getOptional('REFRESH_TOKEN_SECRET'),
  GOOGLE_ENCRYPTION_KEY: getRequired('GOOGLE_ENCRYPTION_KEY'),
  REDIS_URL: getOptional('REDIS_URL', 'redis://localhost:6379')!,
  CALLBACK_BASE_URL: requireInProduction('CALLBACK_BASE_URL'),
  STREAMING_BASE_URL: requireInProduction('STREAMING_BASE_URL'),
  WEBHOOK_SIGNING_SECRET: getRequired('WEBHOOK_SIGNING_SECRET'),
  WEBHOOK_REPLAY_WINDOW_SECONDS: Number(process.env.WEBHOOK_REPLAY_WINDOW_SECONDS || 300),
  N8N_API_KEY: getRequired('N8N_API_KEY'),
  N8N_API_KEY_HEADER: getOptional('N8N_API_KEY_HEADER', 'key')!,
  N8N_TIMEOUT_MS: Number(process.env.N8N_TIMEOUT_MS || 300000),
  /** @deprecated Replaced by the universal webhook in the worksheet refactor. Optional for backwards compatibility. */
  N8N_PILLAR_WEBHOOK_URL: getOptional('N8N_PILLAR_WEBHOOK_URL'),
  /** Universal n8n template webhook used by the worksheet generate flow (Phase B). */
  N8N_UNIVERSAL_WEBHOOK_URL: getOptional(
    'N8N_UNIVERSAL_WEBHOOK_URL',
    'https://n8n.srv891599.hstgr.cloud/webhook/universal%20workflow'
  ),
  N8N_REVIEW_WEBHOOK_URL: getRequired('N8N_REVIEW_WEBHOOK_URL'),
  N8N_PUBLISH_WEBHOOK_URL: getRequired('N8N_PUBLISH_WEBHOOK_URL'),
  N8N_EDIT_TEXT_WEBHOOK_URL: getRequired('N8N_EDIT_TEXT_WEBHOOK_URL'),
  N8N_EDIT_IMAGE_WEBHOOK_URL: getRequired('N8N_EDIT_IMAGE_WEBHOOK_URL'),
  N8N_AUDIT_WEBHOOK_URL: getRequired('N8N_AUDIT_WEBHOOK_URL'),
};

if (!Number.isFinite(env.WEBHOOK_REPLAY_WINDOW_SECONDS) || env.WEBHOOK_REPLAY_WINDOW_SECONDS <= 0) {
  throw new Error('[config] WEBHOOK_REPLAY_WINDOW_SECONDS must be a positive number');
}

if (env.isProduction) {
  if (!env.CALLBACK_BASE_URL || !env.STREAMING_BASE_URL) {
    throw new Error('[config] CALLBACK_BASE_URL and STREAMING_BASE_URL are required in production');
  }
}
