// Conversational agent API.
//
//   GET  /api/chat/thread   → the user's active thread + its messages (creates one if none)
//   POST /api/chat/thread   → start a new empty thread
//   POST /api/chat          → stream an agent turn (streamText + tools), persist on finish
//
// All routes require a JWT (authenticateToken). Tools forward the same JWT to
// the app's own endpoints, so every action stays scoped to the authenticated
// user via the existing ownership checks.

import express, { Request, Response, NextFunction } from 'express';
import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from 'ai';

import { PrismaClient } from '../../generated/prisma';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { getAgentModel, isAgentConfigured } from '../chat/model';
import { buildSystemPrompt } from '../chat/systemPrompt';
import { buildTools } from '../chat/tools';
import {
  getLatestThread,
  createThread,
  getOwnedThread,
  loadMessages,
  saveMessages,
} from '../chat/persistence';

const router = express.Router();
const prisma = new PrismaClient();

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function parseHeaderInt(v: unknown): number | null {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// GET /api/chat/thread — active thread + messages (create if none).
router.get('/thread', authenticateToken, asyncHandler(async (req, res) => {
  const userId = (req as AuthenticatedRequest).user.userId;
  let thread = await getLatestThread(prisma, userId);
  if (!thread) thread = await createThread(prisma, userId);
  const messages = await loadMessages(prisma, thread.id);
  res.json({ threadId: thread.id, messages });
}));

// POST /api/chat/thread — start a fresh thread.
router.post('/thread', authenticateToken, asyncHandler(async (req, res) => {
  const userId = (req as AuthenticatedRequest).user.userId;
  const thread = await createThread(prisma, userId);
  res.json({ threadId: thread.id, messages: [] });
}));

// POST /api/chat — stream an agent turn.
router.post('/', authenticateToken, asyncHandler(async (req, res) => {
  if (!isAgentConfigured()) {
    res.status(503).json({ error: 'Chat agent is not configured (missing OPENROUTER_API_KEY).' });
    return;
  }

  const userId = (req as AuthenticatedRequest).user.userId;
  const jwt = (req.headers.authorization || '').split(' ')[1] || '';
  const currentDomainId = parseHeaderInt(req.headers['x-domain-id']);
  const currentPath = (req.headers['x-path'] as string) || null;

  const body = (req.body ?? {}) as { messages?: UIMessage[]; threadId?: number };
  const uiMessages = Array.isArray(body.messages) ? body.messages : [];

  // Resolve a thread the user owns; fall back to a fresh one. A DB blip here
  // must NOT 500 the whole chat — degrade to no-persistence so the agent still
  // answers (saveMessages is also best-effort below).
  const requestedId = Number(body.threadId);
  let threadId: number | null = null;
  try {
    let thread = Number.isFinite(requestedId) ? await getOwnedThread(prisma, userId, requestedId) : null;
    if (!thread) thread = await createThread(prisma, userId);
    threadId = thread.id;
  } catch (err) {
    console.warn('[chat] thread resolution failed (continuing without persistence)', err);
    threadId = Number.isFinite(requestedId) ? requestedId : null;
  }

  const modelMessages = await convertToModelMessages(uiMessages);
  const result = streamText({
    model: getAgentModel(),
    system: buildSystemPrompt({ currentDomainId, currentPath }),
    messages: modelMessages,
    tools: buildTools({ jwt, currentDomainId }),
    // Agent loop: allow several tool round-trips before forcing a final answer.
    stopWhen: stepCountIs(8),
  });

  result.pipeUIMessageStreamToResponse(res, {
    originalMessages: uiMessages,
    onFinish: ({ messages }) => {
      if (threadId == null) return; // persistence degraded (DB blip)
      saveMessages(prisma, threadId, messages).catch((e) =>
        console.error('[chat] persist failed', e),
      );
    },
    onError: (error) => {
      console.error('[chat] stream error', error);
      return error instanceof Error ? error.message : 'Chat failed. Please try again.';
    },
  });
}));

export default router;
