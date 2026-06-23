import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL?.trim() || 'redis://127.0.0.1:6379';
const REDIS_CONNECT_TIMEOUT_MS = Number(process.env.REDIS_CONNECT_TIMEOUT_MS) || 1000;
const REDIS_COMMAND_TIMEOUT_MS = Number(process.env.REDIS_COMMAND_TIMEOUT_MS) || 750;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

class RedisService {
  private client: Redis;
  private isConnected = false;

  constructor() {
    this.client = new Redis(REDIS_URL, {
      connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
      commandTimeout: REDIS_COMMAND_TIMEOUT_MS,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      retryStrategy: (attempt) => Math.min(attempt * 100, 1000),
    });
    
    this.client.on('error', (err: Error) => {
      console.error('Redis Client Error:', err);
      this.isConnected = false;
    });

    this.client.on('connect', () => {
      console.log('Redis connected');
    });

    this.client.on('ready', () => {
      this.isConnected = true;
    });

    this.client.on('close', () => {
      this.isConnected = false;
    });

    this.client.on('end', () => {
      this.isConnected = false;
    });
  }

  private isReady(): boolean {
    return this.isConnected && this.client.status === 'ready';
  }

  private async run<T>(label: string, operation: Promise<T>, fallback: T): Promise<T> {
    try {
      return await withTimeout(operation, REDIS_COMMAND_TIMEOUT_MS, label);
    } catch (err) {
      console.error(`Redis ${label} error:`, err);
      return fallback;
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.isReady()) return null;
    return this.run(`GET ${key}`, this.client.get(key), null);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.isReady()) return;

    const operation = ttlSeconds
      ? this.client.set(key, value, 'EX', ttlSeconds)
      : this.client.set(key, value);

    await this.run(`SET ${key}`, operation.then(() => undefined), undefined);
  }

  async del(key: string): Promise<void> {
    if (!this.isReady()) return;
    await this.run(`DEL ${key}`, this.client.del(key).then(() => undefined), undefined);
  }

  async delPattern(pattern: string): Promise<void> {
    try {
      if (!this.isReady()) return;
      let cursor = '0';
      do {
        const [nextCursor, keys] = await withTimeout(
          this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100),
          REDIS_COMMAND_TIMEOUT_MS,
          `SCAN ${pattern}`,
        );
        cursor = nextCursor;
        if (keys.length > 0) {
          await withTimeout(
            this.client.del(...keys),
            REDIS_COMMAND_TIMEOUT_MS,
            `DEL pattern ${pattern}`,
          );
        }
      } while (cursor !== '0');
    } catch (err) {
      console.error(`Redis DEL pattern error for ${pattern}:`, err);
    }
  }

  // Domain specific helpers
  getDashboardKey(domainId: number | string, type: 'overview' | 'metrics' | 'comps') {
    return `dash:${domainId}:${type}`;
  }
}

export const redisService = new RedisService();
