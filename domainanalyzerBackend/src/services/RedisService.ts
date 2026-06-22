import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

class RedisService {
  private client: Redis;
  private isConnected = false;

  constructor() {
    this.client = new Redis(REDIS_URL);
    
    this.client.on('error', (err: Error) => {
      console.error('Redis Client Error:', err);
      this.isConnected = false;
    });

    this.client.on('connect', () => {
      console.log('Redis connected');
      this.isConnected = true;
    });

    this.client.on('ready', () => {
      this.isConnected = true;
    });

    this.client.on('close', () => {
      this.isConnected = false;
    });
  }

  async get(key: string): Promise<string | null> {
    try {
      if (!this.isConnected) return null;
      return await this.client.get(key);
    } catch (err) {
      console.error(`Redis GET error for key ${key}:`, err);
      return null; // Graceful degradation
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    try {
      if (!this.isConnected) return;
      
      if (ttlSeconds) {
        await this.client.set(key, value, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, value);
      }
    } catch (err) {
      console.error(`Redis SET error for key ${key}:`, err);
    }
  }

  async del(key: string): Promise<void> {
    try {
      if (!this.isConnected) return;
      await this.client.del(key);
    } catch (err) {
      console.error(`Redis DEL error for key ${key}:`, err);
    }
  }

  async delPattern(pattern: string): Promise<void> {
    try {
      if (!this.isConnected) return;
      let cursor = '0';
      do {
        const [nextCursor, keys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;
        if (keys.length > 0) {
          await this.client.del(...keys);
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
