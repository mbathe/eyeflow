/**
 * Cache Module
 * Provides caching services for the compiler
 * Currently backed by Redis
 * 
 * @file src/common/cache/cache.module.ts
 */

import { Module } from '@nestjs/common';
import { RedisCacheService } from '../services/redis-cache.service';

@Module({
  providers: [RedisCacheService],
  exports: [RedisCacheService],
})
export class CacheModule {}
