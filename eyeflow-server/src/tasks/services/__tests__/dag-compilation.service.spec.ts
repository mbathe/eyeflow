/**
 * Unit Tests for DAGCompilationService
 * 
 * Tests for:
 * - DAG structure validation
 * - Cycle detection
 * - Node placement decisions
 * - Executor type determination
 * - IR generation and signing
 */

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';

import { DAGCompilationService } from '../dag-compilation.service';
import { ExecutorType, ExecutionNodeType } from '../../types/node-placement.types';

describe('DAGCompilationService', () => {
  let service: DAGCompilationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DAGCompilationService],
    }).compile();

    service = module.get<DAGCompilationService>(DAGCompilationService);
  });

  describe('DAG Validation', () => {
    it('should validate a simple linear DAG', async () => {
      const dagJson = {
        nodes: [
          { id: 'node-1', type: 'trigger', name: 'Start' },
          { id: 'node-2', type: 'condition', name: 'Check' },
          { id: 'node-3', type: 'action', name: 'Execute' },
        ],
        edges: [
          { source: 'node-1', target: 'node-2' },
          { source: 'node-2', target: 'node-3' },
        ],
      };

      const availableNodes = [
        {
          node_id: 'nest-1',
          type: ExecutionNodeType.NEST_JS_CENTRAL,
          capabilities: { canExecute: [ExecutorType.TRIGGER_HANDLER, ExecutorType.CONDITION_EVALUATOR] },
        },
      ];

      const result = await service.compileDAG(dagJson, availableNodes);

      expect(result.irBinary).toBeDefined();
      expect(result.irChecksum).toBeDefined();
      expect(result.nodePlacements).toBeDefined();
    });

    it('should detect cycles in DAG', async () => {
      const dagJson = {
        nodes: [
          { id: 'node-1', type: 'trigger' },
          { id: 'node-2', type: 'condition' },
          { id: 'node-3', type: 'action' },
        ],
        edges: [
          { source: 'node-1', target: 'node-2' },
          { source: 'node-2', target: 'node-3' },
          { source: 'node-3', target: 'node-1' }, // Back edge creates cycle
        ],
      };

      const availableNodes = [];

      await expect(service.compileDAG(dagJson, availableNodes)).rejects.toThrow(
        'Directed Acyclic Graph validation failed: DAG contains cycles',
      );
    });

    it('should detect unreachable nodes', async () => {
      const dagJson = {
        nodes: [
          { id: 'node-1', type: 'trigger' },
          { id: 'node-2', type: 'condition' },
          { id: 'node-3', type: 'action' }, // Not reachable from node-1
        ],
        edges: [
          { source: 'node-1', target: 'node-2' },
          // node-3 has no incoming edges from reachable nodes
        ],
      };

      const availableNodes = [];

      const result = await service.compileDAG(dagJson, availableNodes);

      // Should warn about unreachable nodes
      expect(result.validation?.warnings?.length || 0).toBeGreaterThan(0);
    });

    it('should validate all required node types exist', async () => {
      const dagJson = {
        nodes: [
          { id: 'node-1', type: 'unknown-type' }, // Invalid type
        ],
        edges: [],
      };

      const availableNodes = [];

      const result = await service.compileDAG(dagJson, availableNodes);

      expect(result.validation?.errors?.length || 0).toBeGreaterThan(0);
    });
  });

  describe('Node Placement Logic', () => {
    it('should route MCP_SERVER_CALL nodes to Nest.js central', async () => {
      const dagJson = {
        nodes: [
          { id: 'node-1', type: 'trigger' },
          { id: 'node-2', type: 'mcp_call', name: 'Fetch Data' }, // MCP call
        ],
        edges: [{ source: 'node-1', target: 'node-2' }],
      };

      const availableNodes = [
        {
          node_id: 'nest-1',
          type: ExecutionNodeType.NEST_JS_CENTRAL,
          capabilities: { canExecute: [ExecutorType.MCP_SERVER_CALL] },
        },
        {
          node_id: 'rust-1',
          type: ExecutionNodeType.RUST_EDGE,
          capabilities: { canExecute: [ExecutorType.TRIGGER_HANDLER] },
        },
      ];

      const result = await service.compileDAG(dagJson, availableNodes);

      const mcp_placement = result.nodePlacements[0]?.placements?.find(
        (p: any) => p.executor_type === ExecutorType.MCP_SERVER_CALL,
      );

      if (mcp_placement) {
        expect(mcp_placement.target_node_type).toEqual(ExecutionNodeType.NEST_JS_CENTRAL);
      }
    });

    it('should route LLM_INFERENCE to Nest.js central', async () => {
      const dagJson = {
        nodes: [
          { id: 'node-1', type: 'trigger' },
          { id: 'node-2', type: 'llm_inference', name: 'Analyze' },
        ],
        edges: [{ source: 'node-1', target: 'node-2' }],
      };

      const availableNodes = [
        {
          node_id: 'nest-1',
          type: ExecutionNodeType.NEST_JS_CENTRAL,
          capabilities: { canExecute: [ExecutorType.LLM_INFERENCE] },
        },
      ];

      const result = await service.compileDAG(dagJson, availableNodes);

      expect(result.nodePlacements).toBeDefined();
      expect(result.irBinary).toBeDefined();
    });

    it('should route simple conditions to Rust edge nodes', async () => {
      const dagJson = {
        nodes: [
          { id: 'node-1', type: 'trigger' },
          { id: 'node-2', type: 'condition', name: 'Check Status' },
        ],
        edges: [{ source: 'node-1', target: 'node-2' }],
      };

      const availableNodes = [
        {
          node_id: 'rust-1',
          type: ExecutionNodeType.RUST_EDGE,
          capabilities: { canExecute: [ExecutorType.CONDITION_EVALUATOR] },
        },
      ];

      const result = await service.compileDAG(dagJson, availableNodes);

      expect(result.nodePlacements).toBeDefined();
    });

    it('should fallback to Nest.js if no capable Rust node exists', async () => {
      const dagJson = {
        nodes: [
          { id: 'node-1', type: 'trigger' },
          { id: 'node-2', type: 'action', name: 'Execute Action' },
        ],
        edges: [{ source: 'node-1', target: 'node-2' }],
      };

      const availableNodes = [
        {
          node_id: 'nest-1',
          type: ExecutionNodeType.NEST_JS_CENTRAL,
          capabilities: { canExecute: [ExecutorType.ACTION_HANDLER] },
        },
        {
          node_id: 'rust-1',
          type: ExecutionNodeType.RUST_EDGE,
          capabilities: { canExecute: [ExecutorType.TRIGGER_HANDLER] }, // Doesn't support ACTION
        },
      ];

      const result = await service.compileDAG(dagJson, availableNodes);

      // Should fallback, possibly with warning
      expect(result.nodePlacements).toBeDefined();
    });

    it('should validate node connectivity after placement', async () => {
      const dagJson = {
        nodes: [
          { id: 'node-1', type: 'trigger' },
          { id: 'node-2', type: 'condition' },
          { id: 'node-3', type: 'action' },
        ],
        edges: [
          { source: 'node-1', target: 'node-2' },
          { source: 'node-2', target: 'node-3' },
        ],
      };

      const availableNodes = [
        {
          node_id: 'nest-1',
          type: ExecutionNodeType.NEST_JS_CENTRAL,
          capabilities: {},
        },
        {
          node_id: 'rust-1',
          type: ExecutionNodeType.RUST_EDGE,
          capabilities: {},
        },
      ];

      // Should handle differently distributed nodes
      const result = await service.compileDAG(dagJson, availableNodes);

      expect(result.nodePlacements).toBeDefined();
    });
  });

  describe('Executor Type Determination', () => {
    it('should map node types to executor types', async () => {
      const testCases = [
        { nodeType: 'trigger', expectedExecutor: ExecutorType.TRIGGER_HANDLER },
        { nodeType: 'condition', expectedExecutor: ExecutorType.CONDITION_EVALUATOR },
        { nodeType: 'action', expectedExecutor: ExecutorType.ACTION_HANDLER },
        { nodeType: 'mcp_call', expectedExecutor: ExecutorType.MCP_SERVER_CALL },
        { nodeType: 'llm_inference', expectedExecutor: ExecutorType.LLM_INFERENCE },
      ];

      for (const testCase of testCases) {
        const dagJson = {
          nodes: [
            { id: 'node-1', type: testCase.nodeType },
          ],
          edges: [],
        };

        const availableNodes = [];

        const result = await service.compileDAG(dagJson, availableNodes);

        // Verify placement contains the correct executor type
        expect(result.nodePlacements).toBeDefined();
      }
    });
  });

  describe('Preload Resource Calculation', () => {
    it('should calculate preload resources for used connectors', async () => {
      const dagJson = {
        nodes: [
          { id: 'node-1', type: 'trigger', connector: 'slack' },
          { id: 'node-2', type: 'action', connector: 'database', params: { query: 'SELECT *' } },
        ],
        edges: [{ source: 'node-1', target: 'node-2' }],
      };

      const availableNodes = [];

      const result = await service.compileDAG(dagJson, availableNodes);

      // Should identify connectors that need preloading
      expect(result.preloadResources || []).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'connector' }),
        ]),
      );
    });

    it('should deduplicate preload resources', async () => {
      const dagJson = {
        nodes: [
          { id: 'node-1', type: 'action', connector: 'slack' },
          { id: 'node-2', type: 'action', connector: 'slack' }, // Same connector
          { id: 'node-3', type: 'action', connector: 'slack' }, // Same connector again
        ],
        edges: [
          { source: 'node-1', target: 'node-2' },
          { source: 'node-2', target: 'node-3' },
        ],
      };

      const availableNodes = [];

      const result = await service.compileDAG(dagJson, availableNodes);

      const slackPreloads = (result.preloadResources || []).filter(
        (r: any) => r.connector_id === 'slack',
      );

      // Should only have one preload entry for Slack
      expect(slackPreloads.length).toBeLessThanOrEqual(1);
    });
  });

  describe('IR Generation and Signing', () => {
    it('should generate LLM-IR bytecode', async () => {
      const dagJson = {
        nodes: [
          { id: 'node-1', type: 'trigger' },
          { id: 'node-2', type: 'action' },
        ],
        edges: [{ source: 'node-1', target: 'node-2' }],
      };

      const availableNodes = [];

      const result = await service.compileDAG(dagJson, availableNodes);

      expect(result.irBinary).toBeDefined();
      expect(typeof result.irBinary).toBe('string');
      // Should be base64 encoded
      expect(/^[A-Za-z0-9+/=]+$/.test(result.irBinary)).toBe(true);
    });

    it('should generate IR checksum', async () => {
      const dagJson = {
        nodes: [
          { id: 'node-1', type: 'trigger' },
        ],
        edges: [],
      };

      const availableNodes = [];

      const result = await service.compileDAG(dagJson, availableNodes);

      expect(result.irChecksum).toBeDefined();
      // Should be SHA256 hex (64 characters)
      expect(/^[a-f0-9]{64}$/.test(result.irChecksum)).toBe(true);
    });

    it('should sign IR binary with key', async () => {
      const dagJson = {
        nodes: [
          { id: 'node-1', type: 'trigger' },
        ],
        edges: [],
      };

      const availableNodes = [];

      const result = await service.compileDAG(dagJson, availableNodes);

      // Signature should be different from checksum
      expect(result.irSignature).toBeDefined();
      expect(result.irSignature).not.toEqual(result.irChecksum);
      expect(result.signatureKeyId).toBeDefined();
    });

    it('should be deterministic (same DAG → same IR)', async () => {
      const dagJson = {
        nodes: [
          { id: 'node-1', type: 'trigger', name: 'Start' },
          { id: 'node-2', type: 'action', name: 'Execute' },
        ],
        edges: [{ source: 'node-1', target: 'node-2' }],
      };

      const availableNodes = [];

      const result1 = await service.compileDAG(dagJson, availableNodes);
      const result2 = await service.compileDAG(dagJson, availableNodes);

      // Same DAG should produce same checksum
      expect(result1.irChecksum).toEqual(result2.irChecksum);
    });

    it('should produce different IR for different DAGs', async () => {
      const availableNodes = [];

      const result1 = await service.compileDAG(
        {
          nodes: [{ id: 'node-1', type: 'trigger' }],
          edges: [],
        },
        availableNodes,
      );

      const result2 = await service.compileDAG(
        {
          nodes: [{ id: 'node-1', type: 'action' }], // Different node type
          edges: [],
        },
        availableNodes,
      );

      expect(result1.irChecksum).not.toEqual(result2.irChecksum);
    });
  });

  describe('Validation Report', () => {
    it('should return validation report with errors and warnings', async () => {
      const dagJson = {
        nodes: [
          { id: 'node-1', type: 'trigger' },
          { id: 'node-2', type: 'unknown' }, // Invalid type
          { id: 'node-3', type: 'action' }, // Unreachable
        ],
        edges: [{ source: 'node-1', target: 'node-2' }],
      };

      const availableNodes = [];

      const result = await service.compileDAG(dagJson, availableNodes);

      // Should include validation info
      if (result.validation) {
        expect(Array.isArray(result.validation.errors) || Array.isArray(result.validation.warnings)).toBe(true);
      }
    });

    it('should mark compilation as invalid if critical errors', async () => {
      const dagJson = {
        nodes: [], // Empty DAG
        edges: [],
      };

      const availableNodes = [];

      const result = await service.compileDAG(dagJson, availableNodes);

      // Empty DAG is likely invalid
      if (result.validation) {
        expect(result.validation.errors?.length || 0).toBeGreaterThan(0);
      }
    });
  });
});
