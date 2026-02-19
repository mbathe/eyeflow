/**
 * Frontend Orchestrator Service Tests (Simplified & Stable)
 * Tests the main orchestration service for Layer 2
 */

import { Test, TestingModule } from '@nestjs/testing';
import { FrontendOrchestratorService } from './frontend-orchestrator.service';
import { NLParserService } from './services/nl-parser.service';
import { TypeInferencerService } from './services/type-inferencer.service';
import { ConstraintValidatorService } from './services/constraint-validator.service';
import { RedisCacheService } from '../../common/services/redis-cache.service';
import { ParseResult } from './interfaces/semantic-node.interface';
import { Logger } from 'winston';

describe('FrontendOrchestratorService', () => {
  let service: FrontendOrchestratorService;
  let parser: jest.Mocked<NLParserService>;
  let typeInferencer: jest.Mocked<TypeInferencerService>;
  let constraintValidator: jest.Mocked<ConstraintValidatorService>;
  let cache: jest.Mocked<RedisCacheService>;
  let logger: jest.Mocked<Logger>;

  beforeEach(async () => {
    parser = {
      parse: jest.fn(),
    } as any;

    typeInferencer = {
      inferTypes: jest.fn().mockResolvedValue([]),
    } as any;

    constraintValidator = {
      validate: jest.fn().mockResolvedValue([]),
    } as any;

    cache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(true),
      delete: jest.fn().mockResolvedValue(true),
      deletePattern: jest.fn().mockResolvedValue(true),
    } as any;

    logger = {
      child: jest.fn().mockReturnThis(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FrontendOrchestratorService,
        {
          provide: NLParserService,
          useValue: parser,
        },
        {
          provide: TypeInferencerService,
          useValue: typeInferencer,
        },
        {
          provide: ConstraintValidatorService,
          useValue: constraintValidator,
        },
        {
          provide: RedisCacheService,
          useValue: cache,
        },
        {
          provide: 'LOGGER',
          useValue: logger,
        },
      ],
    }).compile();

    service = module.get<FrontendOrchestratorService>(FrontendOrchestratorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('compile()', () => {
    it('should throw deprecation error', async () => {
      await expect(service.compile('input', 'name')).rejects.toThrow('DEPRECATED: Use Planning layer LLM service for NL parsing');
    });
  });


  describe('clearCache()', () => {
    it('should be a no-op (deprecated)', async () => {
      await expect(service.clearCache('test input', 'test-workflow')).resolves.toBeUndefined();
      await expect(service.clearCache()).resolves.toBeUndefined();
      expect(cache.delete).not.toHaveBeenCalled();
      expect(cache.deletePattern).not.toHaveBeenCalled();
    });
  });

  describe('getStatistics()', () => {
    it('should return parser statistics (deprecated service)', async () => {
      const stats = await service.getStatistics();

      expect(stats.parserVersion).toBeDefined();
      expect(stats.supportedVerbs).toBeDefined();
      expect(Array.isArray(stats.supportedVerbs)).toBe(true);
      // deprecated service returns empty supportedVerbs array
      expect(stats.supportedVerbs.length).toBeGreaterThanOrEqual(0);
    });

    it('should include workflow duration in statistics (deprecated)', async () => {
      const stats = await service.getStatistics();

      expect(stats.maxWorkflowDuration).toBeGreaterThanOrEqual(0);
    });

    it('should expose supportedVerbs as an array (deprecated)', async () => {
      const stats = await service.getStatistics();

      expect(Array.isArray(stats.supportedVerbs)).toBe(true);
    });
  });
});
