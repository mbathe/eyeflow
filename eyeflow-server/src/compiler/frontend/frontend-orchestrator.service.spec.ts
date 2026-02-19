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
    it('should complete full compilation pipeline successfully', async () => {
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

    it('should handle parse errors gracefully', async () => {
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
    });

    it('should aggregate errors from all pipeline stages', async () => {
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

    it('should invoke type inference during compilation', async () => {
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
      typeInferencer.inferTypes.mockResolvedValue([]);

      await service.compile('test');

      expect(typeInferencer.inferTypes).toHaveBeenCalled();
    });

    it('should invoke constraint validation during compilation', async () => {
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
      constraintValidator.validate.mockResolvedValue([]);

      await service.compile('test');

      expect(constraintValidator.validate).toHaveBeenCalled();
    });

    it('should collect performance metrics', async () => {
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

      const result = await service.compile('test');

      expect(result.metrics).toBeDefined();
      expect(result.metrics.parseTime).toBeGreaterThanOrEqual(0);
      expect(result.metrics.typeCheckTime).toBeGreaterThanOrEqual(0);
      expect(result.metrics.validationTime).toBeGreaterThanOrEqual(0);
      expect(result.metrics.totalTime).toBeGreaterThan(0);
    });

    it('should include operation count in metrics', async () => {
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

      const result = await service.compile('test');

      expect(result.metrics.operationCount).toBeGreaterThanOrEqual(0);
    });

    it('should include variable count in metrics', async () => {
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
          variables: new Map([['var1', {} as any]]),
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

      const result = await service.compile('test');

      expect(result.metrics.variableCount).toBeGreaterThanOrEqual(0);
    });

    it('should preserve warnings with successful compilation', async () => {
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
        warnings: [
          {
            code: 'INEFFICIENT_PATTERN',
            message: 'Inefficient pattern',
            lineNumber: 0,
          },
        ],
        metadata: {
          parsingTime: 100,
          inputLength: 10,
          nodeCount: 1,
        },
      };

      parser.parse.mockResolvedValue(parseResult);

      const result = await service.compile('test');

      expect(result.success).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('clearCache()', () => {
    it('should clear specific cache entry when parameters provided', async () => {
      await service.clearCache('test input', 'test-workflow');
      expect(cache.delete).toHaveBeenCalled();
    });

    it('should clear all cache entries when no parameters provided', async () => {
      await service.clearCache();
      expect(cache.deletePattern).toHaveBeenCalledWith('frontend:parsed:*');
    });
  });

  describe('getStatistics()', () => {
    it('should return parser statistics', async () => {
      const stats = await service.getStatistics();

      expect(stats.parserVersion).toBeDefined();
      expect(stats.supportedVerbs).toBeDefined();
      expect(Array.isArray(stats.supportedVerbs)).toBe(true);
      expect(stats.supportedVerbs.length).toBeGreaterThan(0);
    });

    it('should include workflow duration in statistics', async () => {
      const stats = await service.getStatistics();

      expect(stats.maxWorkflowDuration).toBeGreaterThan(0);
    });

    it('should list all supported verbs', async () => {
      const stats = await service.getStatistics();

      const expectedVerbs = ['read', 'send', 'generate', 'analyze', 'extract', 'transform', 'fetch', 'create', 'delete', 'update', 'process'];
      expectedVerbs.forEach(verb => {
        expect(stats.supportedVerbs).toContain(verb);
      });
    });
  });
});
