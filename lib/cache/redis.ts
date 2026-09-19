/**
 * Upstash Redis Client
 *
 * Cache respons API + rate-limit key AI + adapter health status.
 * Uses Upstash Redis REST API — works in serverless without persistent connections.
 */

import { Redis } from '@upstash/redis';

function createRedisClient(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    console.warn('[Redis] UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN not set. Cache disabled.');
    return null;
  }

  return new Redis({ url, token });
}

const redis = createRedisClient();

/**
 * Cache wrapper with graceful fallback when Redis is not configured.
 */
export const cache = {
  async get<T>(key: string): Promise<T | null> {
    if (!redis) return null;
    try {
      return await redis.get<T>(key);
    } catch (err) {
      console.error('[Redis] GET error:', err);
      return null;
    }
  },

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    if (!redis) return;
    try {
      if (ttlSeconds) {
        await redis.set(key, value, { ex: ttlSeconds });
      } else {
        await redis.set(key, value);
      }
    } catch (err) {
      console.error('[Redis] SET error:', err);
    }
  },

  async del(key: string): Promise<void> {
    if (!redis) return;
    try {
      await redis.del(key);
    } catch (err) {
      console.error('[Redis] DEL error:', err);
    }
  },

  /**
   * Get or set — fetch from cache, or compute and cache the result.
   */
  async getOrSet<T>(
    key: string,
    compute: () => Promise<T>,
    ttlSeconds: number = 300,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const value = await compute();
    await this.set(key, value, ttlSeconds);
    return value;
  },

  /** Check if Redis is available */
  isAvailable(): boolean {
    return redis !== null;
  },
};
