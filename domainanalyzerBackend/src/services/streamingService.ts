import IORedis from 'ioredis';

// Reuse the Redis connection from existing infrastructure if possible, or create new
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const redis = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
});

const MESSAGE_TTL_SECONDS = 86400; // 24 hours

export interface StreamingMessage {
    message: string;
    timestamp: string;
}

/**
 * Saves a streaming progress message for a specific job.
 */
export const saveStreamingMessage = async (jobId: string, message: string, timestamp: string = new Date().toISOString()) => {
    const key = `streaming:${jobId}:messages`;
    const messageObj: StreamingMessage = { message, timestamp };

    await redis.rpush(key, JSON.stringify(messageObj));
    await redis.expire(key, MESSAGE_TTL_SECONDS); // Refresh TTL on every new message
};

/**
 * Retrieves the full history of streaming messages for a job.
 */
export const getStreamingMessages = async (jobId: string): Promise<StreamingMessage[]> => {
    const key = `streaming:${jobId}:messages`;
    const rawMessages = await redis.lrange(key, 0, -1);

    return rawMessages.map(raw => {
        try {
            return JSON.parse(raw) as StreamingMessage;
        } catch (e) {
            return { message: raw, timestamp: new Date().toISOString() }; // Fallback
        }
    });
};

/**
 * Clears streaming messages (optional, e.g. when job completes successfully).
 */
export const clearStreamingMessages = async (jobId: string) => {
    const key = `streaming:${jobId}:messages`;
    await redis.del(key);
};
