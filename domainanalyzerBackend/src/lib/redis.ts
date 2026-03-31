import IORedis from 'ioredis';
import { env } from '../config/env';

declare global {
  // eslint-disable-next-line no-var
  var __redis__: IORedis | undefined;
}

export const redis = global.__redis__ ?? new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

if (process.env.NODE_ENV !== 'production') {
  global.__redis__ = redis;
}

