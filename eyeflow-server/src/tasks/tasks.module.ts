import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { GlobalTaskEntity } from './entities/global-task.entity';
import { EventRuleEntity } from './entities/event-rule.entity';
import { EventRuleExtendedEntity } from './entities/event-rule-extended.entity';
import { MissionEntity } from './entities/mission.entity';
import { GlobalTaskStateEntity } from './entities/task-state.entity';
import { AuditLogEntity } from './entities/audit-log.entity';

// Services
import { TaskCompilerService } from './services/task-compiler.service';
import { ConnectorRegistryService } from './services/connector-registry.service';
import { LLMContextBuilderService } from './services/llm-context-builder.service';
import { LLMContextEnhancedService } from './services/llm-context-enhanced.service';
import { LLMIntentParserMock, LLMIntentParserHttpClient } from './services/llm-intent-parser.abstraction';
import { TaskValidatorService } from './services/task-validator.service';
import { AgentBrokerService } from './services/agent-broker.service';
import { RuleCompilerService } from './services/rule-compiler.service';
import { CompilationFeedbackService } from './services/compilation-feedback.service';
import { LLMContextEnricherService } from './services/llm-context-enricher.service';
import { DAGGeneratorService } from './services/dag-generator.service';
import { RuleApprovalService } from './services/rule-approval.service';
import { CompilationProgressGateway } from './gateways/compilation-progress.gateway';

// Providers
import { AnalyticsProvider } from './services/analytics.provider';
import { NotificationsProvider } from './services/notifications.provider';
import { WorkflowProvider } from './services/workflow.provider';

// Modules
import { AnalyticsModule } from './services/analytics.module';
import { NotificationsModule } from './services/notifications.module';
import { WorkflowModule } from './services/workflow.module';

// Controllers
import { TasksController } from './controllers/tasks.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GlobalTaskEntity,
      EventRuleEntity,
      EventRuleExtendedEntity,
      MissionEntity,
      GlobalTaskStateEntity,
      AuditLogEntity,
    ]),
    // Extension modules
    AnalyticsModule,
    NotificationsModule,
    WorkflowModule,
  ],
  providers: [
    // Core LLM & Validation
    ConnectorRegistryService,
    LLMContextBuilderService,
    // Extension Providers
    AnalyticsProvider,
    NotificationsProvider,
    WorkflowProvider,
    {
      provide: LLMContextEnhancedService,
      useFactory: (
        connectorRegistry: ConnectorRegistryService,
        analyticsProvider: AnalyticsProvider,
        notificationsProvider: NotificationsProvider,
        workflowProvider: WorkflowProvider,
      ) => {
        return new LLMContextEnhancedService(
          connectorRegistry,
          [analyticsProvider, notificationsProvider, workflowProvider], // External providers
        );
      },
      inject: [ConnectorRegistryService, AnalyticsProvider, NotificationsProvider, WorkflowProvider],
    },
    {
      provide: 'LLMIntentParser',
      useFactory: () => {
        // Prefer HTTP client if LLM_SERVICE_URL is configured, otherwise use mock
        const llmUrl = process.env.LLM_SERVICE_URL || process.env.LLM_URL || null;
        if (llmUrl) {
          return new LLMIntentParserHttpClient();
        }
        return new LLMIntentParserMock();
      },
    },
    TaskValidatorService,
    // New Compilation Services
    AgentBrokerService,
    RuleCompilerService,
    CompilationFeedbackService,
    LLMContextEnricherService,
    DAGGeneratorService,
    RuleApprovalService,
    CompilationProgressGateway,
    // Task Compilation
    TaskCompilerService,
  ],
  controllers: [TasksController],
  exports: [
    TaskCompilerService,
    ConnectorRegistryService,
    LLMContextBuilderService,
    LLMContextEnhancedService,
    TaskValidatorService,
    AgentBrokerService,
    RuleCompilerService,
    CompilationFeedbackService,
    LLMContextEnricherService,
    DAGGeneratorService,
    RuleApprovalService,
    CompilationProgressGateway,
    TypeOrmModule,
  ],
})
export class TasksModule {}
