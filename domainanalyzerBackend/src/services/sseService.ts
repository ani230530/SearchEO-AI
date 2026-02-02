import { Response } from 'express';

export type SSEClient = { res: Response };
const sseClients = new Map<number, Set<SSEClient>>();

export const addSSEClient = (userId: number, client: SSEClient) => {
    if (!sseClients.has(userId)) sseClients.set(userId, new Set());
    sseClients.get(userId)!.add(client);
};

export const removeSSEClient = (userId: number, client: SSEClient) => {
    const set = sseClients.get(userId);
    if (!set) return;
    set.delete(client);
    if (set.size === 0) sseClients.delete(userId);
};

export const broadcastToUser = (userId: number, event: any) => {
    const set = sseClients.get(userId);
    if (!set) return;
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of set) {
        try {
            client.res.write(payload);
        } catch (err) {
            console.error('SSE write error', err);
        }
    }
};
