import IORedis from 'ioredis';
import { env } from '../config/env';
import { formatRedisError, getRedisUrl } from './redisConfig';

declare global {
  // eslint-disable-next-line no-var
  var __redis__: IORedis | undefined;
}

const redisUrl = getRedisUrl(env.REDIS_URL);

export const redis = global.__redis__ ?? new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
});

redis.on('error', (error) => {
  console.warn(`[Redis] Connection error for ${redisUrl}: ${formatRedisError(error)}`);
});

redis.on('connect', () => {
  console.log(`[Redis] Connected to ${redisUrl}`);
});

if (process.env.NODE_ENV !== 'production') {
  global.__redis__ = redis;
}

