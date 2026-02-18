import { Test, TestingModule } from '@nestjs/testing';
import { CompilationProgressGateway } from './compilation-progress.gateway';

describe('CompilationProgressGateway', () => {
  let gateway: CompilationProgressGateway;
  let mockServer: any;
  let mockClient: any;
  let mockToFn: jest.Mock;

  beforeEach(async () => {
    // Mock socket.io Server and Client
    mockToFn = jest.fn().mockReturnValue({
      emit: jest.fn(),
    });

    mockServer = {
      to: mockToFn,
    };

    mockClient = {
      id: 'socket-123',
      emit: jest.fn(),
      join: jest.fn(),
      leave: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [CompilationProgressGateway],
    }).compile();

    gateway = module.get<CompilationProgressGateway>(CompilationProgressGateway);
    gateway.server = mockServer;
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('WebSocket Connections', () => {
    it('should handle client connection', () => {
      expect(() => gateway.handleConnection(mockClient)).not.toThrow();
    });

    it('should handle client disconnection', () => {
      gateway.handleConnection(mockClient);
      expect(() => gateway.handleDisconnect(mockClient)).not.toThrow();
    });
  });

  describe('Compilation Events', () => {
    it('should emit started event with correct parameters', () => {
      const compilationId = 'comp-123';
      const ruleName = 'Test Rule';

      gateway.emitStarted(compilationId, ruleName);

      // Verify server.to was called with correct room
      expect(mockToFn).toHaveBeenCalledWith(`compilation:${compilationId}`);
      const emittedData = mockToFn().emit.mock.calls[0];
      expect(emittedData[0]).toBe('compilation:started');
      expect(emittedData[1].compilationId).toBe(compilationId);
      expect(emittedData[1].ruleName).toBe(ruleName);
    });

    it('should emit step progress event with correct parameters', () => {
      const compilationId = 'comp-456';
      const step = 2;
      const stepName = 'validate_condition';
      const message = 'Validating condition syntax';
      const progress = 25;

      gateway.emitStepProgress(compilationId, step, stepName, message, progress);

      expect(mockToFn).toHaveBeenCalledWith(`compilation:${compilationId}`);
      const emittedData = mockToFn().emit.mock.calls[0];
      expect(emittedData[0]).toBe('compilation:step');
      expect(emittedData[1].step).toBe(step);
      expect(emittedData[1].stepName).toBe(stepName);
      expect(emittedData[1].progress).toBe(progress);
    });

    it('should emit succeeded event with DAG and report', () => {
      const compilationId = 'comp-789';
      const report = { isValid: true, errors: [] };
      const dag = { nodes: [], edges: [] };
      const ruleName = 'Success Rule';

      gateway.emitSucceeded(compilationId, report, dag, ruleName);

      expect(mockToFn).toHaveBeenCalledWith(`compilation:${compilationId}`);
      const emittedData = mockToFn().emit.mock.calls[0];
      expect(emittedData[0]).toBe('compilation:succeeded');
      expect(emittedData[1].compilationId).toBe(compilationId);
      expect(emittedData[1].dag).toEqual(dag);
      expect(emittedData[1].ruleName).toBe(ruleName);
    });

    it('should emit failed event with error explanation', () => {
      const compilationId = 'comp-fail';
      const error = 'Invalid condition syntax';
      const userMessage = 'The condition has a syntax error';
      const llmExplanation = 'Missing closing parenthesis in condition';
      const compilationReport = { isValid: false, errors: [{ message: error }] };

      gateway.emitFailed(compilationId, error, userMessage, llmExplanation, compilationReport);

      expect(mockToFn).toHaveBeenCalledWith(`compilation:${compilationId}`);
      const emittedData = mockToFn().emit.mock.calls[0];
      expect(emittedData[0]).toBe('compilation:failed');
      expect(emittedData[1].compilationId).toBe(compilationId);
      expect(emittedData[1].error).toBe(error);
      expect(emittedData[1].llmExplanation).toBe(llmExplanation);
    });
  });

  describe('Room Management', () => {
    it('should handle subscription to compilation room', () => {
      const compilationId = 'comp-subscribe';
      const data = { compilationId };

      gateway.handleSubscribe(mockClient, data);

      expect(mockClient.join).toHaveBeenCalledWith(`compilation:${compilationId}`);
    });

    it('should handle unsubscription from compilation room', () => {
      const compilationId = 'comp-unsubscribe';
      const data = { compilationId };

      gateway.handleUnsubscribe(mockClient, data);

      expect(mockClient.leave).toHaveBeenCalledWith(`compilation:${compilationId}`);
    });
  });
});
