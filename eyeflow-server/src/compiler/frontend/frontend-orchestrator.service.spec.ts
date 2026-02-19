/**
 * Frontend Orchestrator Service Tests
 * Tests the main orchestration service for Layer 2
 * 
 * @file src/compiler/frontend/frontend-orchestrator.service.spec.ts
 */

import { Test, TestingModule } from '@nestjs/testing';
import { FrontendOrchestratorService } from './frontend-orchestrator.service';
import { NLParserService } from './services/nl-parser.service';
import { TypeInferencerService } from './services/type-inferencer.service';
import { ConstraintValidatorService } from './services/constraint-validator.service';
import { RedisCacheService } from '@/common/services/redis-cache.service';
import { ParseResult } from './interfaces/semantic-node.interface';
import { getLoggerToken } from 'nest-winston';
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
          provide: getLoggerToken(),
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
    it('should complete full compilation pipeline', async () => {
      const input = 'send email to test@example.com';
      const parseResult: ParseResult = {
        success: true,
        tree: {
          root: {
            type: 'operation',
            id: 'action_0',
            operation: {
              capabilityId: 'action.sendEmail',
              inputs: { to: 'test@example.com' },
            },
            metadata: {
              parallelizable: false,
              dependencies: [],
            },
          },
          operations: new Map([
            [
              'action_0',
              {
                type: 'operation',
                id: 'action_0',
                operation: {
                  capabilityId: 'action.sendEmail',
                  inputs: { to: 'test@example.com' },
                },
                metadata: {
                  parallelizable: false,
                  dependencies: [],
                },
              },
            ],
          ]),
          variables: new Map(),
          inputs: new Map(),
          metadata: {
            name: 'test',
            createdAt: new Date(),
            parserVersion: '1.0',
            source: 'natural_language',
          },
        },
        errors: [],
        warnings: [],
        metadata: {
          parsingTime: 100,
          inputLength: input.length,
          nodeCount: 1,
        },
      };

      parser.parse.mockResolvedValue(parseResult);

      const result = await service.compile(input, 'test-workflow');

      expect(result.success).toBe(true);
      expect(result.tree).toBeDefined();
      expect(result.errors).toEqual([]);
      expect(result.metrics.totalTime).toBeGreaterThan(0);
    });

    it('should return early on parse errors', async () => {
      const parseResult: ParseResult = {
        success: false,
        errors: [
          {
            code: 'NO_ACTIONS_FOUND',
            message: 'No actions found',
            lineNumber: 0,
          },
        ],
        warnings: [],
        metadata: {
          parsingTime: 50,
          inputLength: 0,
          nodeCount: 0,
        },
      };

      parser.parse.mockResolvedValue(parseResult);

      const result = await service.compile('invalid input', 'test');

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.tree).toBeUndefined();
      expect(typeInferencer.inferTypes).not.toHaveBeenCalled();
    });

    it('should cache successful compilations', async () => {
      const input = 'send email to test@example.com';
      const parseResult: ParseResult = {
        success: true,
        tree: {
          root: {
            type: 'operation',
            id: 'action_0',
            operation: {
              capabilityId: 'action.sendEmail',
              inputs: {},
            },
            metadata: {
              parallelizable: false,
              dependencies: [],
            },
          },
          operations: new Map(),
          variables: new Map(),
          inputs: new Map(),
          metadata: {
            name: 'test',
            createdAt: new Date(),
            parserVersion: '1.0',
            source: 'natural_language',
          },
        },
        errors: [],
        warnings: [],
        metadata: {
          parsingTime: 100,
          inputLength: input.length,
          nodeCount: 1,
        },
      };

      parser.parse.mockResolvedValue(parseResult);

      await service.compile(input, 'workflow1');

      expect(cache.set).toHaveBeenCalled();
      const cacheCall = cache.set.mock.calls[0];
      expect(cacheCall[1].success).toBe(true);
    });

    it('should return cached result on second call', async () => {
      const input = 'send email to test@example.com';
      const cachedResult = {
        success: true,
        tree: {} as any,
        errors: [],
        warnings: [],
        metrics: {
          parseTime: 100,
          typeCheckTime: 50,
          validationTime: 30,
          totalTime: 180,
          operationCount: 1,
          variableCount: 0,
        },
      };

      cache.get.mockResolvedValueOnce(cachedResult);

      const result = await service.compile(input, 'cached-workflow');

      expect(result).toEqual(cachedResult);
      expect(parser.parse).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        'Frontend compilation cache hit',
        expect.any(Object),
      );
    });

    it('should measure parsing time', async () => {
      const parseResult: ParseResult = {
        success: true,
        tree: {
          root: {
            type: 'operation',
            id: 'action_0',
            operation: {
              capabilityId: 'test',
              inputs: {},
            },
            metadata: {
              parallelizable: false,
              dependencies: [],
            },
          },
          operations: new Map(),
          variables: new Map(),
          inputs: new Map(),
          metadata: {
            name: 'test',
            createdAt: new Date(),
            parserVersion: '1.0',
            source: 'natural_language',
          },
        },
        errors: [],
        warnings: [],
        metadata: {
          parsingTime: 100,
          inputLength: 10,
          nodeCount: 1,
        },
      };

      parser.parse.mockResolvedValue(parseResult);

      const result = await service.compile('test input', 'timing');

      expect(result.metrics.parseTime).toBeGreaterThan(0);
      expect(result.metrics.typeCheckTime).toBeGreaterThanOrEqual(0);
      expect(result.metrics.validationTime).toBeGreaterThanOrEqual(0);
      expect(result.metrics.totalTime).toBeGreaterThan(0);
    });

    it('should collect errors from all stages', async () => {
      const parseResult: ParseResult = {
        success: true,
        tree: {
          root: {
            type: 'operation',
            id: 'action_0',
            operation: {
              capabilityId: 'test',
              inputs: {},
            },
            metadata: {
              parallelizable: false,
              dependencies: [],
            },
          },
          operations: new Map(),
          variables: new Map(),
          inputs: new Map(),
          metadata: {
            name: 'test',
            createdAt: new Date(),
            parserVersion: '1.0',
            source: 'natural_language',
          },
        },
        errors: [],
        warnings: [],
        metadata: {
          parsingTime: 100,
          inputLength: 10,
          nodeCount: 1,
        },
      };

      parser.parse.mockResolvedValue(parseResult);
      typeInferencer.inferTypes.mockResolvedValue([
        {
          code: 'TYPE_MISMATCH',
          message: 'Type mismatch',
          lineNumber: 1,
        },
      ]);
      constraintValidator.validate.mockResolvedValue([
        {
          code: 'CIRCULAR_DEPENDENCY',
          message: 'Circular dependency detected',
          lineNumber: 0,
        },
      ]);

      const result = await service.compile('test', 'error-collection');

      expect(result.success).toBe(false);
      expect(result.errors.length).toEqual(2);
    });
  });

  describe('parseInteractive()', () => {
    it('should parse without caching', async () => {
      const input = 'send email';
      const parseResult: ParseResult = {
        success: true,
        tree: {
          root: {
            type: 'operation',
            id: 'action_0',
            operation: {
              capabilityId: 'test',
              inputs: {},
            },
            metadata: {
              parallelizable: false,
              dependencies: [],
            },
          },
          operations: new Map(),
          variables: new Map(),
          inputs: new Map(),
          metadata: {
            name: 'test',
            createdAt: new Date(),
            parserVersion: '1.0',
            source: 'natural_language',
          },
        },
        errors: [],
        warnings: [],
        metadata: {
          parsingTime: 100,
          inputLength: input.length,
          nodeCount: 1,
        },
      };

      parser.parse.mockResolvedValue(parseResult);

      const result = await service.parseInteractive(input, 'interactive');

      expect(result.success).toBe(true);
      expect(cache.set).not.toHaveBeenCalled();
    });
  });

  describe('clearCache()', () => {
    it('should clear specific cache entry', async () => {
      await service.clearCache('test input', 'test-workflow');
      expect(cache.delete).toHaveBeenCalled();
    });

    it('should clear all cache entries', async () => {
      await service.clearCache();
      expect(cache.deletePattern).toHaveBeenCalledWith('frontend:parsed:*');
    });
  });

  describe('getStatistics()', () => {
    it('should return parser statistics', async () => {
      const stats = await service.getStatistics();

      expect(stats.parserVersion).toBeDefined();
      expect(stats.supportedVerbs).toBeDefined();
      expect(stats.supportedVerbs.length).toBeGreaterThan(0);
      expect(stats.maxWorkflowDuration).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('should handle parser exceptions', async () => {
      parser.parse.mockRejectedValue(new Error('Parse exception'));

      const result = await service.compile('test', 'error-test');

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle type inference exceptions', async () => {
      const parseResult: ParseResult = {
        success: true,
        tree: {
          root: {
            type: 'operation',
            id: 'action_0',
            operation: {
              capabilityId: 'test',
              inputs: {},
            },
            metadata: {
              parallelizable: false,
              dependencies: [],
            },
          },
          operations: new Map(),
          variables: new Map(),
          inputs: new Map(),
          metadata: {
            name: 'test',
            createdAt: new Date(),
            parserVersion: '1.0',
            source: 'natural_language',
          },
        },
        errors: [],
        warnings: [],
        metadata: {
          parsingTime: 100,
          inputLength: 10,
          nodeCount: 1,
        },
      };

      parser.parse.mockResolvedValue(parseResult);
      typeInferencer.inferTypes.mockRejectedValue(new Error('Type check failed'));

      const result = await service.compile('test', 'type-error');

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
