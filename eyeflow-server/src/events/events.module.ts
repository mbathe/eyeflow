/**
 * EventsModule
 *
 * NestJS module for the distributed EventStateMachine architecture.
 *
 * Provides:
 *  – EventStateMachineService  : runtime FSM executor (CENTRAL-local FSMs)
 *  – EventCorrelationService   : temporal window management
 *  – PropagatedEventService    : HANDLE_PROPAGATED dispatcher
 *  – HumanApprovalService      : HiL gate registry + synthetic event emission
 *  – PipelineExecutorService   : compiled pipeline executor
 *  – LlmCallService            : real LLM provider calls (OpenAI/Anthropic/Ollama)
 *  – ConnectorDispatchService  : universal connector action dispatcher
 *  – ExpressionSandboxService  : vm-isolated expression/template evaluation
 *  – FsmStateRepository        : Redis-backed FSM state persistence
 *
 * REST controllers:
 *  – ApprovalController        : POST /approvals/:gateId — HiL decision endpoint
 *
 * Imports:
 *  – TriggersModule            : provides TriggerBusService (event input stream)
 *  – NodesModule               : provides NodeDispatcherService (for REMOTE_COMMAND emit)
 *  – ConnectorsModule          : provides ConnectorsService (connector execution)
 *  – LlmConfigModule           : provides LlmConfigService (LLM provider credentials)
 */

import { Module, forwardRef } from '@nestjs/common';
import { EventStateMachineService } from './event-state-machine.service';
import { EventCorrelationService } from './event-correlation.service';
import { PropagatedEventService } from './propagated-event.service';
import { HumanApprovalService } from './human-approval.service';
import { PipelineExecutorService } from './pipeline-executor.service';
import { LlmCallService } from './llm-call.service';
import { ConnectorDispatchService } from './connector-dispatch.service';
import { ExpressionSandboxService } from './expression-sandbox.service';
import { MultiLLMPipelineService } from './multi-llm-pipeline.service';
import { FsmStateRepository } from './fsm-state.repository';
import { ApprovalController } from './approval.controller';
import { TriggersModule } from '../triggers/triggers.module';
import { NodesModule } from '../nodes/nodes.module';
import { ConnectorsModule } from '../connectors/connectors.module';
import { LlmConfigModule } from '../llm-config/llm-config.module';

@Module({
  imports: [
    TriggersModule,
    // forwardRef() is required because NodesModule also imports EventsModule
    // (for PropagatedEventService in NodesGateway).
    forwardRef(() => NodesModule),
    ConnectorsModule,
    LlmConfigModule,
  ],
  controllers: [
    ApprovalController,
  ],
  providers: [
    ExpressionSandboxService,
    FsmStateRepository,
    LlmCallService,
    ConnectorDispatchService,
    EventCorrelationService,
    HumanApprovalService,
    MultiLLMPipelineService,
    PipelineExecutorService,
    PropagatedEventService,
    EventStateMachineService,
  ],
  exports: [
    EventStateMachineService,
    PropagatedEventService,
    EventCorrelationService,
    HumanApprovalService,
    MultiLLMPipelineService,
    PipelineExecutorService,
    LlmCallService,
    ConnectorDispatchService,
    ExpressionSandboxService,
    FsmStateRepository,
  ],
})
export class EventsModule {}

