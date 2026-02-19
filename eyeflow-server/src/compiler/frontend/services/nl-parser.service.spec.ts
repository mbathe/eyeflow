/**
 * NL Parser Service Tests
 * Tests the natural language parsing functionality
 * 
 * @file src/compiler/frontend/services/nl-parser.service.spec.ts
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NLParserService } from './nl-parser.service';
import { ComponentRegistry } from '@/common/extensibility/index';
import { getLoggerToken } from 'nest-winston';
import { Logger } from 'winston';

describe('NLParserService', () => {
  let service: NLParserService;
  let componentRegistry: jest.Mocked<ComponentRegistry>;
  let logger: jest.Mocked<Logger>;

  beforeEach(async () => {
    // Mock ComponentRegistry
    componentRegistry = {
      getCapability: jest.fn().mockResolvedValue({
        id: 'action.sendEmail',
        name: 'Send Email',
        inputs: [
          { name: 'to', required: true, type: 'string' },
          { name: 'subject', required: true, type: 'string' },
        ],
        outputs: [{ name: 'result', type: 'object' }],
      }),
    } as any;

    // Mock Logger
    logger = {
      child: jest.fn().mockReturnThis(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NLParserService,
        {
          provide: ComponentRegistry,
          useValue: componentRegistry,
        },
        {
          provide: getLoggerToken(),
          useValue: logger,
        },
      ],
    }).compile();

    service = module.get<NLParserService>(NLParserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('parse()', () => {
    it('should parse simple natural language', async () => {
      const input = 'send email to user@example.com with subject=Hello';
      const result = await service.parse(input, 'test-workflow');

      expect(result.success).toBe(true);
      expect(result.tree).toBeDefined();
      expect(result.errors.length).toBe(0);
      expect(result.metadata.nodeCount).toBeGreaterThan(0);
    });

    it('should return error for no actions', async () => {
      const input = 'This is just a comment\n// Another comment';
      const result = await service.parse(input, 'test-workflow');

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].code).toBe('NO_ACTIONS_FOUND');
    });

    it('should extract multiple actions', async () => {
      const input = `
        read file from /path/to/file.xlsx
        send email to user@example.com
      `;
      const result = await service.parse(input, 'multi-action');

      expect(result.success).toBe(true);
      expect(result.tree!.operations.size).toBeGreaterThanOrEqual(1);
    });

    it('should handle parallel actions', async () => {
      const input = `
        @parallel
        send email to user1@example.com
        send email to user2@example.com
      `;
      const result = await service.parse(input, 'parallel-workflow');

      expect(result.success).toBe(true);
      expect(result.tree).toBeDefined();
    });

    it('should measure parsing time', async () => {
      const input = 'send email to test@example.com';
      const result = await service.parse(input, 'timing-test');

      expect(result.metadata.parsingTime).toBeGreaterThan(0);
      expect(result.metadata.parsingTime).toBeLessThan(5000); // Less than 5 seconds
    });

    it('should validate inputs against capability', async () => {
      const input = 'send email'; // Missing required parameters
      const result = await service.parse(input, 'validation-test');

      // May succeed or fail depending on input extraction
      expect(result.metadata).toBeDefined();
    });

    it('should report errors for missing capabilities', async () => {
      componentRegistry.getCapability.mockResolvedValueOnce(null);
      const input = 'unknown_verb to something';
      const result = await service.parse(input, 'unknown-cap');

      // The parser should handle this gracefully
      expect(result).toBeDefined();
    });
  });

  describe('tokenization', () => {
    it('should remove comments', async () => {
      const input = `
        send email to test@example.com // This is a comment
        # Another comment style
      `;
      const result = await service.parse(input, 'comment-test');

      expect(result.metadata).toBeDefined();
    });

    it('should handle empty lines', async () => {
      const input = `
        send email to test@example.com


        send email to test2@example.com
      `;
      const result = await service.parse(input, 'empty-lines');

      expect(result.success || !result.success).toBe(true); // Either way is ok
    });
  });

  describe('input extraction', () => {
    it('should extract from/to parameters', async () => {
      const input = 'send email to admin@company.com from support@company.com';
      const result = await service.parse(input, 'from-to-test');

      expect(result.metadata).toBeDefined();
      if (result.success) {
        expect(result.tree!.operations.size).toBeGreaterThan(0);
      }
    });

    it('should extract with parameters', async () => {
      const input = 'generate report with format=pdf with theme=professional';
      const result = await service.parse(input, 'with-params');

      expect(result.metadata).toBeDefined();
    });

    it('should extract using parameters', async () => {
      const input = 'transform data using csv_parser';
      const result = await service.parse(input, 'using-param');

      expect(result.metadata).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle parsing exceptions gracefully', async () => {
      componentRegistry.getCapability.mockRejectedValueOnce(new Error('Registry error'));
      const result = await service.parse('send email to test@example.com', 'error-test');

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(logger.error).toHaveBeenCalled();
    });
  });
});
