import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { GlobalTaskEntity } from './entities/global-task.entity';
import { EventRuleEntity } from './entities/event-rule.entity';
import { EventRuleExtendedEntity } from './entities/event-rule-extended.entity';
import { MissionEntity } from './entities/mission.entity';
import { GlobalTaskStateEntity } from './entities/task-state.entity';
import { AuditLogEntity } from './entities/audit-log.entity';
import { LLMSessionEntity } from './entities/llm-session.entity';
import { LLMProjectEntity } from './entities/llm-project.entity';
import { ProjectVersionEntity } from './entities/project-version.entity';
import { ExecutionMemoryStateEntity } from './entities/execution-memory-state.entity';
import { ExecutionRecordEntity } from './entities/execution-record.entity';

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
import { DAGCompilationService } from './services/dag-compilation.service';
import { RuleApprovalService } from './services/rule-approval.service';
import { CompilationProgressGateway } from './gateways/compilation-progress.gateway';
import { LLMSessionService } from './services/llm-session.service';
import { LLMSessionsController } from './controllers/llm-sessions.controller';
import { ProjectsController } from './controllers/projects.controller';
import { LLMProjectService } from './services/llm-project.service';
import { LLMProjectExecutionService } from './services/llm-project-execution.service';
import { AuditQueryService } from './services/audit-query.service';
import { VersionLifecycleService } from './services/version-lifecycle.service';

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
import { AuditController } from './controllers/audit.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GlobalTaskEntity,
      EventRuleEntity,
      EventRuleExtendedEntity,
      MissionEntity,
      GlobalTaskStateEntity,
      AuditLogEntity,
      LLMSessionEntity,
      LLMProjectEntity,
      ProjectVersionEntity,
      ExecutionMemoryStateEntity,
      ExecutionRecordEntity,
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
    DAGCompilationService,
    RuleApprovalService,
    CompilationProgressGateway,
    // Session & LLM scoping
    LLMSessionService,
    // Project & Versioning
    LLMProjectService,
    LLMProjectExecutionService,
    // Task Compilation
    TaskCompilerService,
    // Audit chain query (spec §12.4)
    AuditQueryService,
    // Version lifecycle state machine (spec §11)
    VersionLifecycleService,
  ],
  controllers: [TasksController, LLMSessionsController, ProjectsController, AuditController],
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
    LLMSessionService,
    LLMProjectService,
    LLMProjectExecutionService,
    DAGGeneratorService,
    DAGCompilationService,
    RuleApprovalService,
    CompilationProgressGateway,
    AuditQueryService,
    VersionLifecycleService,
    TypeOrmModule,
  ],
})
export class TasksModule {}
