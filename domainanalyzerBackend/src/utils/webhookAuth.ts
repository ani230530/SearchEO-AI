import crypto from 'crypto';
import { Request } from 'express';
import { env } from '../config/env';

const SIGNATURE_HEADER = 'x-webhook-signature';
const TIMESTAMP_HEADER = 'x-webhook-timestamp';

const getHeader = (req: Request, name: string): string | null => {
  const value = req.headers[name];
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
};

const safeEqual = (a: string, b: string): boolean => {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
};

const buildSignedPayload = (timestamp: string, rawBody: string) => `${timestamp}.${rawBody}`;

export const signWebhookBody = (rawBody: string, timestamp: string): string => {
  const payload = buildSignedPayload(timestamp, rawBody);
  return crypto.createHmac('sha256', env.WEBHOOK_SIGNING_SECRET).update(payload).digest('hex');
};

export const buildWebhookAuthHeaders = (body: unknown): Record<string, string> => {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const rawBody = typeof body === 'string' ? body : JSON.stringify(body ?? {});
  const signature = signWebhookBody(rawBody, timestamp);
  return {
    'X-Webhook-Timestamp': timestamp,
    'X-Webhook-Signature': signature,
  };
};

export const verifyWebhookSignature = (req: Request): { ok: true } | { ok: false; error: string } => {
  const signature = getHeader(req, SIGNATURE_HEADER);
  const timestamp = getHeader(req, TIMESTAMP_HEADER);

  if (!signature || !timestamp) {
    return { ok: false, error: 'Missing webhook signature headers' };
  }

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) {
    return { ok: false, error: 'Invalid webhook timestamp' };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const ageSeconds = Math.abs(nowSeconds - timestampSeconds);
  if (ageSeconds > env.WEBHOOK_REPLAY_WINDOW_SECONDS) {
    return { ok: false, error: 'Webhook request expired (replay window exceeded)' };
  }

  const rawBody =
    (req as Request & { rawBody?: string }).rawBody ??
    JSON.stringify(req.body ?? {});

  const expectedSignature = signWebhookBody(rawBody, timestamp);
  if (!safeEqual(signature, expectedSignature)) {
    return { ok: false, error: 'Invalid webhook signature' };
  }

  return { ok: true };
};

