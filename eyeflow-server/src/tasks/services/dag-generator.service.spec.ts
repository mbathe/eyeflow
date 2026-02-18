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

  describe('generateDAGFromCompilationReport', () => {
    it('should generate a DAG with nodes and edges', () => {
      const compilationReport: any = {
        ruleId: 'rule-123',
        ruleName: 'Test Rule',
        isValid: true,
        errorCount: 0,
        ruleComplexity: 'SIMPLE',
        estimatedExecutionTime: 500,
        dataFlow: [
          { type: 'trigger', name: 'trigger1', timing: { minMs: 0, maxMs: 100 } },
          { type: 'action', name: 'action1', timing: { minMs: 100, maxMs: 200 } },
        ],
      };

      const dag = service.generateDAGFromCompilationReport(compilationReport);

      expect(dag).toBeDefined();
      expect(dag.nodes).toBeDefined();
      expect(dag.edges).toBeDefined();
      expect(dag.metadata).toBeDefined();
      expect(Array.isArray(dag.nodes)).toBe(true);
      expect(Array.isArray(dag.edges)).toBe(true);
    });

    it('should include metadata in DAG', () => {
      const compilationReport: any = {
        ruleId: 'rule-123',
        ruleName: 'Test Rule',
        isValid: true,
        errorCount: 0,
        ruleComplexity: 'MEDIUM',
        estimatedExecutionTime: 500,
        dataFlow: [
          { type: 'trigger', name: 'trigger1', timing: { minMs: 0, maxMs: 100 } },
        ],
      };

      const dag = service.generateDAGFromCompilationReport(compilationReport);

      expect(dag.metadata).toHaveProperty('title');
      expect(dag.metadata).toHaveProperty('description');
      expect(dag.metadata).toHaveProperty('estimatedExecutionTime');
      expect(dag.metadata).toHaveProperty('complexity');
      expect(dag.metadata.ruleId).toBe('rule-123');
      expect(dag.metadata.title).toBe('Test Rule');
    });

    it('should handle different node types correctly', () => {
      const compilationReport: any = {
        ruleId: 'rule-456',
        ruleName: 'Complex Rule',
        isValid: true,
        ruleComplexity: 'COMPLEX',
        dataFlow: [
          { type: 'trigger', name: 'when_event', timing: { minMs: 0, maxMs: 100 } },
          { type: 'condition', name: 'if_valid', timing: { minMs: 50, maxMs: 150 } },
          { type: 'action', name: 'do_something', timing: { minMs: 500, maxMs: 1000 } },
        ],
      };

      const dag = service.generateDAGFromCompilationReport(compilationReport);

      expect(dag.nodes.length).toBeGreaterThan(0);
      expect(dag.nodes).toBeDefined();
      expect(Array.isArray(dag.nodes)).toBe(true);
    });

    it('should create edges between nodes', () => {
      const compilationReport: any = {
        ruleId: 'rule-789',
        ruleName: 'Multi-step Rule',
        isValid: true,
        ruleComplexity: 'MEDIUM',
        dataFlow: [
          { type: 'trigger', name: 'trigger', timing: { minMs: 0, maxMs: 100 } },
          { type: 'action', name: 'action', timing: { minMs: 100, maxMs: 200 } },
        ],
      };

      const dag = service.generateDAGFromCompilationReport(compilationReport);

      expect(dag.edges.length).toBeGreaterThan(0);
      dag.edges.forEach((edge) => {
        expect(edge).toHaveProperty('source');
        expect(edge).toHaveProperty('target');
      });
    });
  });

  describe('Node positioning', () => {
    it('should calculate node positions for visualization', () => {
      const compilationReport: any = {
        ruleId: 'rule-pos-1',
        ruleName: 'Positioned Rule',
        isValid: true,
        ruleComplexity: 'SIMPLE',
        dataFlow: [
          { type: 'trigger', name: 'trigger1', timing: { minMs: 0, maxMs: 100 } },
          { type: 'action', name: 'action1', timing: { minMs: 100, maxMs: 200 } },
        ],
      };

      const dag = service.generateDAGFromCompilationReport(compilationReport);

      dag.nodes.forEach((node) => {
        expect(node).toHaveProperty('position');
        if (node.position) {
          expect(node.position).toHaveProperty('x');
          expect(node.position).toHaveProperty('y');
        }
      });
    });
  });

  describe('Simplified DAG generation', () => {
    it('should generate simplified DAG for quick preview', () => {
      const dag = service.generateSimplifiedDAG('Quick Preview', 'A simple rule', 'SIMPLE');

      expect(dag).toBeDefined();
      expect(dag.nodes).toBeDefined();
      expect(dag.metadata).toBeDefined();
      expect(dag.metadata.title).toContain('Quick Preview');
    });
  });
});
