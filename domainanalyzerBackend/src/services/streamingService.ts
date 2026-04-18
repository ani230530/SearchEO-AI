import IORedis from 'ioredis';
import { formatRedisError, getRedisUrl } from '../lib/redisConfig';
import type { CanonicalStreamingEvent } from './contentFlowService';

// Reuse the Redis connection from existing infrastructure if possible, or create new
const REDIS_URL = getRedisUrl(process.env.REDIS_URL);
const redis = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
});

redis.on('error', (error) => {
    console.warn(`[StreamingService] Redis unavailable at ${REDIS_URL}: ${formatRedisError(error)}`);
});

const MESSAGE_TTL_SECONDS = 86400; // 24 hours

export interface StreamingMessage {
    message: string;
    timestamp: string;
}

export interface StreamingEvent extends CanonicalStreamingEvent {}

const safeRedisWrite = async (operation: () => Promise<void>): Promise<void> => {
    try {
        await operation();
    } catch (error) {
        console.warn(`[StreamingService] Redis write skipped: ${formatRedisError(error)}`);
    }
};

const safeRedisRead = async <T>(operation: () => Promise<T>, fallback: T): Promise<T> => {
    try {
        return await operation();
    } catch (error) {
        console.warn(`[StreamingService] Redis read failed, using fallback: ${formatRedisError(error)}`);
        return fallback;
    }
};

/**
 * Saves a streaming progress message for a specific job.
 */
export const saveStreamingMessage = async (jobId: string, message: string, timestamp: string = new Date().toISOString()) => {
    const key = `streaming:${jobId}:messages`;
    const messageObj: StreamingMessage = { message, timestamp };

    await safeRedisWrite(async () => {
        await redis.rpush(key, JSON.stringify(messageObj));
        await redis.expire(key, MESSAGE_TTL_SECONDS); // Refresh TTL on every new message
    });
};

export const saveStreamingEvent = async (jobId: string, event: StreamingEvent) => {
    const key = `streaming:${jobId}:messages`;
    await safeRedisWrite(async () => {
        await redis.rpush(key, JSON.stringify(event));
        await redis.expire(key, MESSAGE_TTL_SECONDS);
    });
};

/**
 * Retrieves the full history of streaming messages for a job.
 */
export const getStreamingMessages = async (jobId: string): Promise<StreamingMessage[]> => {
    const key = `streaming:${jobId}:messages`;
    const rawMessages = await safeRedisRead(() => redis.lrange(key, 0, -1), [] as string[]);

    return rawMessages.map(raw => {
        try {
            return JSON.parse(raw) as StreamingMessage;
        } catch (e) {
            return { message: raw, timestamp: new Date().toISOString() }; // Fallback
        }
    });
};

export const getStreamingEvents = async (jobId: string): Promise<StreamingEvent[]> => {
    const key = `streaming:${jobId}:messages`;
    const rawMessages = await safeRedisRead(() => redis.lrange(key, 0, -1), [] as string[]);

    return rawMessages.map((raw) => {
        try {
            const parsed = JSON.parse(raw) as Partial<StreamingEvent>;
            return {
                jobId,
                topicId: parsed.topicId ?? null,
                pageId: parsed.pageId ?? null,
                pageType: parsed.pageType ?? null,
                status: parsed.status ?? 'generating',
                phase: parsed.phase ?? null,
                progress: parsed.progress ?? null,
                message: parsed.message || '',
                sequence: parsed.sequence ?? null,
                timestamp: parsed.timestamp || new Date().toISOString(),
            };
        } catch (e) {
            return {
                jobId,
                topicId: null,
                pageId: null,
                pageType: null,
                status: 'generating',
                phase: null,
                progress: null,
                message: raw,
                sequence: null,
                timestamp: new Date().toISOString(),
            };
        }
    });
};

/**
 * Clears streaming messages (optional, e.g. when job completes successfully).
 */
export const clearStreamingMessages = async (jobId: string) => {
    const key = `streaming:${jobId}:messages`;
    await safeRedisWrite(async () => {
        await redis.del(key);
    });
};
