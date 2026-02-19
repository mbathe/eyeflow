import { Injectable, Logger } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';
import { logWithContext } from './logger.service';

/**
 * Redis Caching Service
 * Provides centralized cache management with TTL support
 * Handles: Get, Set, Delete, Invalidation
 */

@Injectable()
export class RedisCacheService {
  private readonly logger = new Logger(RedisCacheService.name);
  private client: RedisClientType | null = null;
  private isConnected = false;
  private readonly defaultTTL = 300; // 5 minutes default

  async onModuleInit() {
    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      this.client = createClient({ url: redisUrl });

      this.client.on('error', (err: any) => {
        logWithContext('error', 'Redis connection error', {
          service: 'RedisCacheService',
          error: err.message,
        });
        this.logger.error(`Redis error: ${err.message}`);
      });

      this.client.on('connect', () => {
        logWithContext('info', 'Redis connected', {
          service: 'RedisCacheService',
          action: 'connect',
        });
        this.isConnected = true;
      });

      this.client.on('disconnect', () => {
        logWithContext('warn', 'Redis disconnected', {
          service: 'RedisCacheService',
          action: 'disconnect',
        });
        this.isConnected = false;
      });

      if (!this.client.isOpen) {
        await this.client.connect();
      }
    } catch (error: any) {
      logWithContext('warn', 'Redis initialization failed - running without cache', {
        service: 'RedisCacheService',
        error: error?.message,
      });
      this.logger.warn(`Redis initialization failed: ${error?.message}`);
      this.client = null;
    }
  }

  async onModuleDestroy() {
    if (this.client?.isOpen) {
      await this.client.quit();
    }
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.client || !this.isConnected) {
      return null;
    }

    try {
      const startTime = Date.now();
      const value = await this.client.get(key);
      const duration = Date.now() - startTime;

      if (value && typeof value === 'string') {
        logWithContext('debug', 'Cache hit', {
          service: 'RedisCacheService',
          action: 'get',
          key,
          duration,
        });
        return JSON.parse(value) as T;
      }

      logWithContext('debug', 'Cache miss', {
        service: 'RedisCacheService',
        action: 'get',
        key,
        duration,
      });
      return null;
    } catch (error: any) {
      logWithContext('error', 'Cache get error', {
        service: 'RedisCacheService',
        action: 'get',
        key,
        error: error?.message,
      });
      return null;
    }
  }

  /**
   * Set value in cache with optional TTL
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<boolean> {
    if (!this.client || !this.isConnected) {
      return false;
    }

    try {
      const startTime = Date.now();
      const serialized = JSON.stringify(value);
      const finalTTL = ttl || this.defaultTTL;

      await this.client.setEx(key, finalTTL, serialized);
      const duration = Date.now() - startTime;

      logWithContext('debug', 'Cache set', {
        service: 'RedisCacheService',
        action: 'set',
        key,
        ttl: finalTTL,
        valueSize: serialized.length,
        duration,
      });

      return true;
    } catch (error: any) {
      logWithContext('error', 'Cache set error', {
        service: 'RedisCacheService',
        action: 'set',
        key,
        error: error?.message,
      });
      return false;
    }
  }

  /**
   * Delete key from cache
   */
  async delete(key: string): Promise<boolean> {
    if (!this.client || !this.isConnected) {
      return false;
    }

    try {
      const result = await this.client.del(key);
      logWithContext('debug', 'Cache delete', {
        service: 'RedisCacheService',
        action: 'delete',
        key,
        deleted: result > 0,
      });
      return result > 0;
    } catch (error: any) {
      logWithContext('error', 'Cache delete error', {
        service: 'RedisCacheService',
        action: 'delete',
        key,
        error: error?.message,
      });
      return false;
    }
  }

  /**
   * Delete multiple keys matching pattern
   */
  async deletePattern(pattern: string): Promise<number> {
    if (!this.client || !this.isConnected) {
      return 0;
    }

    try {
      const keys = await this.client.keys(pattern);
      if (keys.length === 0) {
        return 0;
      }

      const deleted = await this.client.del(keys);
      logWithContext('info', 'Cache invalidation by pattern', {
        service: 'RedisCacheService',
        action: 'deletePattern',
        pattern,
        keysDeleted: deleted,
      });

      return deleted;
    } catch (error: any) {
      logWithContext('error', 'Cache deletePattern error', {
        service: 'RedisCacheService',
        action: 'deletePattern',
        pattern,
        error: error?.message,
      });
      return 0;
    }
  }

  /**
   * Invalidate all cache for a specific entity type
   */
  async invalidateType(type: 'agent' | 'connector' | 'rule' | 'task'): Promise<number> {
    const patterns: Record<string, string> = {
      agent: 'agent:*',
      connector: 'connector:*',
      rule: 'rule:*',
      task: 'task:*',
    };

    const deleted = await this.deletePattern(patterns[type]);
    logWithContext('info', 'Cache invalidation by type', {
      service: 'RedisCacheService',
      action: 'invalidateType',
      type,
      keysDeleted: deleted,
    });

    return deleted;
  }

  /**
   * Clear entire cache
   */
  async clear(): Promise<boolean> {
    if (!this.client || !this.isConnected) {
      return false;
    }

    try {
      await this.client.flushDb();
      logWithContext('warn', 'Cache cleared', {
        service: 'RedisCacheService',
        action: 'clear',
      });
      return true;
    } catch (error: any) {
      logWithContext('error', 'Cache clear error', {
        service: 'RedisCacheService',
        error: error?.message,
      });
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    connected: boolean;
    keyCount?: number;
    error?: string;
  }> {
    if (!this.client || !this.isConnected) {
      return { connected: false };
    }

    try {
      const keys = await this.client.keys('*');
      return {
        connected: true,
        keyCount: keys.length,
      };
    } catch (error: any) {
      return {
        connected: false,
        error: error?.message,
      };
    }
  }

  /**
   * Use cache with get/set pattern
   */
  async getCached<T>(
    key: string,
    generator: () => Promise<T>,
    ttl?: number,
  ): Promise<T> {
    // Try to get from cache
    const cached = await this.get<T>(key);
    if (cached) {
      return cached;
    }

    // Generate new value
    const value = await generator();

    // Store in cache
    await this.set(key, value, ttl);

    return value;
  }

  /**
   * Check if Redis is accessible
   */
  isReady(): boolean {
    return this.isConnected && this.client?.isOpen === true;
  }
}
