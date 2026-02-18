import { Test, TestingModule } from '@nestjs/testing';
import { DAGGeneratorService } from './dag-generator.service';

describe('DAGGeneratorService', () => {
  let service: DAGGeneratorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DAGGeneratorService],
    }).compile();

    service = module.get<DAGGeneratorService>(DAGGeneratorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateDAG', () => {
    it('should generate DAG from compilation report with data flow', () => {
      const compilationReport = {
        isValid: true,
        errorCount: 0,
        dataFlow: [
          {
            type: 'trigger',
            name: 'on_sensor_change',
            timing: { minMs: 100, maxMs: 1000 },
          },
          {
            type: 'condition',
            name: 'check_threshold',
            timing: { minMs: 50, maxMs: 200 },
          },
          {
            type: 'action',
            name: 'send_alert',
            timing: { minMs: 500, maxMs: 2000 },
          },
        ],
      };

      const dag = service.generateDAG(compilationReport);

      expect(dag).toHaveProperty('nodes');
      expect(dag).toHaveProperty('edges');
      expect(dag).toHaveProperty('metadata');
      expect(Array.isArray(dag.nodes)).toBe(true);
      expect(Array.isArray(dag.edges)).toBe(true);
    });

    it('should handle empty data flow', () => {
      const compilationReport = {
        isValid: true,
        errorCount: 0,
        dataFlow: [],
      };

      const dag = service.generateDAG(compilationReport);

      expect(dag.nodes.length).toBe(0);
      expect(dag.edges.length).toBe(0);
    });

    it('should create edges between sequential nodes', () => {
      const compilationReport = {
        isValid: true,
        errorCount: 0,
        dataFlow: [
          { type: 'trigger', name: 'trigger1', timing: { minMs: 0, maxMs: 100 } },
          { type: 'action', name: 'action1', timing: { minMs: 100, maxMs: 200 } },
          { type: 'action', name: 'action2', timing: { minMs: 200, maxMs: 300 } },
        ],
      };

      const dag = service.generateDAG(compilationReport);

      expect(dag.edges.length).toBeGreaterThan(0);
      expect(dag.edges[0]).toHaveProperty('source');
      expect(dag.edges[0]).toHaveProperty('target');
    });

    it('should include metadata in DAG', () => {
      const compilationReport = {
        isValid: true,
        errorCount: 0,
        dataFlow: [
          { type: 'trigger', name: 'trigger1', timing: { minMs: 0, maxMs: 100 } },
        ],
      };

      const dag = service.generateDAG(compilationReport);

      expect(dag.metadata).toHaveProperty('totalNodes');
      expect(dag.metadata).toHaveProperty('totalEdges');
      expect(dag.metadata).toHaveProperty('estimatedTotalTimeMs');
    });

    it('should handle different node types correctly', () => {
      const compilationReport = {
        isValid: true,
        errorCount: 0,
        dataFlow: [
          { type: 'trigger', name: 'when_event', timing: { minMs: 0, maxMs: 100 } },
          { type: 'condition', name: 'if_valid', timing: { minMs: 50, maxMs: 150 } },
          { type: 'decision', name: 'branch', timing: { minMs: 100, maxMs: 200 } },
          { type: 'action', name: 'do_something', timing: { minMs: 500, maxMs: 1000 } },
        ],
      };

      const dag = service.generateDAG(compilationReport);

      expect(dag.nodes.length).toBe(4);
      expect(dag.nodes.some(n => n.type === 'trigger')).toBe(true);
      expect(dag.nodes.some(n => n.type === 'condition')).toBe(true);
      expect(dag.nodes.some(n => n.type === 'decision')).toBe(true);
      expect(dag.nodes.some(n => n.type === 'action')).toBe(true);
    });
  });

  describe('Node positioning', () => {
    it('should calculate node positions for visualization', () => {
      const compilationReport = {
        isValid: true,
        errorCount: 0,
        dataFlow: [
          { type: 'trigger', name: 'trigger1', timing: { minMs: 0, maxMs: 100 } },
          { type: 'action', name: 'action1', timing: { minMs: 100, maxMs: 200 } },
        ],
      };

      const dag = service.generateDAG(compilationReport);

      // All nodes should have position for rendering
      dag.nodes.forEach(node => {
        expect(node).toHaveProperty('x');
        expect(node).toHaveProperty('y');
      });
    });
  });
});
