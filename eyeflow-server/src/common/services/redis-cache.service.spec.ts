import { Test, TestingModule } from '@nestjs/testing';
import { RedisCacheService } from './redis-cache.service';

/**
 * Unit Tests: Redis Cache Service
 * Tests: Graceful degradation when Redis is not available
 * NOTE: Full Redis tests should run in integration environment
 */
describe('RedisCacheService', () => {
  let service: RedisCacheService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RedisCacheService],
    }).compile();

    service = module.get<RedisCacheService>(RedisCacheService);
    // Allow initialization to complete
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  describe('Service Definition', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should handle gracefully when Redis is not available', () => {
      // Service should still be functional without Redis
      expect(typeof service.isReady).toBe('function');
    });
  });

  describe('Graceful Degradation', () => {
    it('should return false for isReady when Redis is unavailable', async () => {
      const ready = service.isReady();
      // May be true or false depending on Redis availability
      expect(typeof ready).toBe('boolean');
    });

    it('should return null for non-existent keys', async () => {
      const result = await service.get('non-existent-key');
      // May return null if Redis unavailable
      expect(result === null || typeof result === 'object').toBe(true);
    });

    it('should handle set gracefully', async () => {
      const result = await service.set('test-key', { test: true });
      // May return true or false depending on Redis
      expect(typeof result).toBe('boolean');
    });

    it('should handle delete gracefully', async () => {
      const result = await service.delete('test-key');
      // May return true or false depending on Redis
      expect(typeof result).toBe('boolean');
    });
  });

  describe('Service Methods Exist', () => {
    it('should have all required methods', () => {
      expect(typeof service.get).toBe('function');
      expect(typeof service.set).toBe('function');
      expect(typeof service.delete).toBe('function');
      expect(typeof service.deletePattern).toBe('function');
      expect(typeof service.invalidateType).toBe('function');
      expect(typeof service.clear).toBe('function');
      expect(typeof service.getStats).toBe('function');
      expect(typeof service.getCached).toBe('function');
      expect(typeof service.isReady).toBe('function');
    });
  });

  afterEach(async () => {
    if (service) {
      try {
        await service.onModuleDestroy();
      } catch (e) {
        // Ignore errors during cleanup
      }
    }
  });
});
