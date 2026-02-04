import { Response } from 'express';

export type SSEClient = { res: Response };
const sseClients = new Map<number, Set<SSEClient>>();

export const addSSEClient = (userId: number, client: SSEClient) => {
    console.log(`[SSE:Connection] User ${userId} connected`);
    if (!sseClients.has(userId)) sseClients.set(userId, new Set());
    sseClients.get(userId)!.add(client);
};

export const removeSSEClient = (userId: number, client: SSEClient) => {
    console.log(`[SSE:Connection] User ${userId} disconnected`);
    const set = sseClients.get(userId);
    if (!set) return;
    set.delete(client);
    if (set.size === 0) sseClients.delete(userId);
};

export const broadcastToUser = (userId: number, event: any) => {
    const set = sseClients.get(userId);
    if (!set) {
        console.log(`[SSE:Broadcast] No active clients for user ${userId}. Event type: ${event.type}`);
        return;
    }
    console.log(`[SSE:Broadcast] Sending ${event.type} to ${set.size} clients for user ${userId}`);
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of set) {
        try {
            client.res.write(payload);
        } catch (err) {
            console.error('[SSE:Error] Write failed for user', userId, err);
        }
    }
};
