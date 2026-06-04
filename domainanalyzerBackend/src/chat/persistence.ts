// Chat thread persistence.
//
// Threads + messages are scoped to a user. Messages store the AI SDK
// UIMessage `parts` array verbatim so a reloaded thread re-renders its inline
// generative UI. v1 keeps one "active" thread per user (most-recent), with an
// explicit "new chat" path; multi-thread history UI can come later.

import type { PrismaClient } from '../../generated/prisma';
import type { UIMessage } from 'ai';

type Db = PrismaClient;

/** The user's most recent thread, or null. */
export async function getLatestThread(prisma: Db, userId: number) {
  return prisma.chatThread.findFirst({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
  });
}

/** Create a fresh empty thread for the user. */
export async function createThread(prisma: Db, userId: number) {
  return prisma.chatThread.create({ data: { userId } });
}

/** Resolve a thread the user owns by id, or null. */
export async function getOwnedThread(prisma: Db, userId: number, threadId: number) {
  return prisma.chatThread.findFirst({ where: { id: threadId, userId } });
}

/** Load a thread's messages as AI SDK UIMessages (oldest → newest). */
export async function loadMessages(prisma: Db, threadId: number): Promise<UIMessage[]> {
  const rows = await prisma.chatMessage.findMany({
    where: { threadId },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((r) => ({
    id: `m${r.id}`,
    role: r.role as UIMessage['role'],
    parts: (r.parts ?? []) as UIMessage['parts'],
  }));
}

/** Derive a short thread title from the first user text part. */
function deriveTitle(messages: UIMessage[]): string | null {
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser) return null;
  const text = (firstUser.parts as Array<{ type: string; text?: string }>)
    .filter((p) => p.type === 'text')
    .map((p) => p.text ?? '')
    .join(' ')
    .trim();
  if (!text) return null;
  return text.length > 80 ? `${text.slice(0, 77)}…` : text;
}

/**
 * Replace a thread's messages with the latest full list (called from the
 * stream's onFinish). Wipe-and-insert is fine for chat-sized threads and keeps
 * ordering + ids consistent. Also stamps the title on first save.
 */
export async function saveMessages(
  prisma: Db,
  threadId: number,
  messages: UIMessage[],
): Promise<void> {
  const title = deriveTitle(messages);
  await prisma.$transaction(async (tx) => {
    await tx.chatMessage.deleteMany({ where: { threadId } });
    if (messages.length > 0) {
      await tx.chatMessage.createMany({
        data: messages.map((m) => ({
          threadId,
          role: m.role,
          parts: (m.parts ?? []) as object,
        })),
      });
    }
    await tx.chatThread.update({
      where: { id: threadId },
      data: { updatedAt: new Date(), ...(title ? { title } : {}) },
    });
  });
}
