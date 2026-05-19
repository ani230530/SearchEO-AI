// Per-IP+email rate limits for the public auth surface. Returns 429 with a
// neutral JSON shape; the frontend already treats !ok responses uniformly.
//
// Keys are scoped by `email|ip` (or just `ip` for endpoints without email)
// so a single user's typos don't lock out their entire office, and a single
// attacker can't multiplex across many emails from one IP without limit.

import rateLimit, { ipKeyGenerator, Options } from 'express-rate-limit';
import type { Request } from 'express';

const handler: Options['handler'] = (_req, res) => {
  res.status(429).json({
    error: 'Too many requests. Please try again later.',
    code: 'RATE_LIMITED',
  });
};

function emailIpKey(req: Request): string {
  const email = (req.body?.email || req.query?.email || '').toString().trim().toLowerCase();
  const ip = ipKeyGenerator((req.ip ?? '').toString());
  return email ? `${email}|${ip}` : ip;
}

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: emailIpKey,
  handler,
});

export const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator((req.ip ?? '').toString()),
  handler,
});

export const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: emailIpKey,
  handler,
});

export const resendVerificationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: emailIpKey,
  handler,
});

export const googleAuthLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator((req.ip ?? '').toString()),
  handler,
});
