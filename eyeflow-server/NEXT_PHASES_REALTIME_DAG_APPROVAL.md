# 🚀 CRITICAL MISSING PHASES: Real-Time + DAG + Human Loop

## Overview
User needs: Real-time feedback → DAG visualization → Human approval → Rule creation

Timeline to implement: **2-3 days**

---

## Phase 0: Real-Time Compilation Updates via WebSocket

### Step 1: Create CompilationProgressGateway

```bash
# File: src/tasks/gateways/compilation-progress.gateway.ts
```

**Responsibility:** Stream compilation progress to connected clients

```typescript
import { WebSocketGateway, WebSocketServer, SubscribeMessage, MessageBody, ConnectedSocket } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  namespace: '/compilation',
  cors: { origin: '*' }
})
export class CompilationProgressGateway {
  @WebSocketServer()
  server: Server;

  // Emit compilation started
  emitStarted(compilationId: string, ruleName: string) {
    this.server.emit('compilation:started', {
      compilationId,
      ruleName,
      timestamp: new Date(),
      status: 'STARTED'
    });
  }

  // Emit compilation step (e.g., "Validating condition", "Checking connector")
  emitStepProgress(compilationId: string, step: number, stepName: string, message: string, progress: number) {
    this.server.emit('compilation:step', {
      compilationId,
      step,
      stepName,
      message,
      progress, // 0-100
      timestamp: new Date()
    });
  }

  // Emit compilation completed successfully
  emitSucceeded(compilationId: string, report: any, dag: any) {
    this.server.emit('compilation:succeeded', {
      compilationId,
      status: 'SUCCEEDED',
      compilationReport: report,
      dag, // The DAG structure
      timestamp: new Date()
    });
  }

  // Emit compilation failed
  emitFailed(compilationId: string, error: string, userMessage: any, llmExplanation: string) {
    this.server.emit('compilation:failed', {
      compilationId,
      status: 'FAILED',
      error,
      userMessage,
      llmExplanation, // "Why compilation failed" from LLM
      timestamp: new Date()
    });
  }

  @SubscribeMessage('compilation:subscribe')
  handleSubscribe(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
    // Client subscribes to compilation updates for specific ruleId
    client.join(`compilation:${data.ruleId}`);
    return { status: 'subscribed' };
  }
}
```

### Step 2: Update RuleCompilerService to Emit Events

Inject `CompilationProgressGateway` and emit at each step:

```typescript
// In compileRule() method, at each step:
this.gateway.emitStepProgress(compilationId, 1, 'Validate Condition Type', 'Checking condition type...', 10);
// ... do work ...
this.gateway.emitStepProgress(compilationId, 2, 'Check Connectors', 'Verifying connectors exist...', 20);
// ... etc for all 8 steps
```

### Step 3: Update tasks.module.ts

```typescript
import { CompilationProgressGateway } from './gateways/compilation-progress.gateway';

@Module({
  imports: [/* existing */],
  controllers: [/* existing */],
  providers: [
    /* existing */
    CompilationProgressGateway,
  ],
  exports: [CompilationProgressGateway], // Available to other services
})
export class TasksModule {}
```

---

## Phase 1: DAG Generation & Visualization

### Step 1: Create DAG Structures

```typescript
// File: src/tasks/interfaces/dag.interface.ts

export interface DAGNode {
  id: string;
  label: string;
  type: 'trigger' | 'condition' | 'action' | 'decision';
  description: string;
  icon: string; // emoji or icon name
  position: { x: number; y: number }; // for visualization
  metadata?: {
    connector?: string;
    agent?: string;
    serviceCall?: string;
    estimatedTime?: number;
  };
}

export interface DAGEdge {
  id: string;
  source: string; // node id
  target: string; // node id
  label?: string;
  type: 'success' | 'failure' | 'conditional';
  condition?: string; // "if condition passes" or "on error"
}

export interface DAGExecution {
  nodeId: string;
  inputs: Record<string, any>;
  outputs: Record<string, any>;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  duration?: number;
  error?: string;
}

export interface DAGVisualization {
  nodes: DAGNode[];
  edges: DAGEdge[];
  metadata: {
    title: string;
    description: string;
    estimatedExecutionTime: number;
    complexity: 'SIMPLE' | 'MEDIUM' | 'COMPLEX';
  };
}
```

### Step 2: Create DAG Generator Service

```bash
# File: src/tasks/services/dag-generator.service.ts
```

```typescript
import { Injectable } from '@nestjs/common';
import { CompilationReport, DataFlowStep } from './interfaces/compilation-report.interface';
import { DAGVisualization, DAGNode, DAGEdge } from './interfaces/dag.interface';

@Injectable()
export class DAGGeneratorService {
  
  /**
   * Convert CompilationReport.dataFlow into DAG structure
   */
  generateDAGFromCompilationReport(report: CompilationReport): DAGVisualization {
    const nodes = this.generateNodes(report.dataFlow);
    const edges = this.generateEdges(report.dataFlow);
    const positions = this.calculatePositions(nodes, edges);

    return {
      nodes: nodes.map((n, i) => ({
        ...n,
        position: positions[i]
      })),
      edges,
      metadata: {
        title: report.ruleName,
        description: `Rule: ${report.ruleName} - Complexity: ${report.ruleComplexity}`,
        estimatedExecutionTime: report.estimatedExecutionTime,
        complexity: report.ruleComplexity
      }
    };
  }

  private generateNodes(dataFlow: DataFlowStep[]): DAGNode[] {
    return dataFlow.map((step, index) => {
      const nodeTypes = {
        'trigger': 'trigger',
        'condition': 'condition',
        'action': 'action',
        'decision': 'decision'
      };

      return {
        id: step.stepId?.toString() || `step-${index}`,
        label: step.stepName,
        type: step.stepId === 'trigger' ? 'trigger' : 
              step.stepId === 'condition' ? 'condition' : 'action',
        description: step.description || '',
        icon: this.getIconForStep(step),
        metadata: {
          connector: step.connector,
          agent: step.agent,
          serviceCall: step.serviceCall,
          estimatedTime: step.estimatedTime
        }
      };
    });
  }

  private generateEdges(dataFlow: DataFlowStep[]): DAGEdge[] {
    const edges: DAGEdge[] = [];

    for (let i = 0; i < dataFlow.length - 1; i++) {
      const current = dataFlow[i];
      const next = dataFlow[i + 1];

      edges.push({
        id: `edge-${i}-${i + 1}`,
        source: current.stepId?.toString() || `step-${i}`,
        target: next.stepId?.toString() || `step-${i + 1}`,
        type: 'success',
        label: 'Success'
      });
    }

    return edges;
  }

  private calculatePositions(nodes: DAGNode[], edges: DAGEdge[]): Array<{ x: number; y: number }> {
    // Simple horizontal layout: each node incremented by 200px
    return nodes.map((node, index) => ({
      x: 50 + index * 200,
      y: 150
    }));
  }

  private getIconForStep(step: DataFlowStep): string {
    if (step.stepId === 'trigger') return '🎯';
    if (step.stepId === 'condition') return '❓';
    if (step.stepName?.includes('slack')) return '💬';
    if (step.stepName?.includes('database')) return '🗄️';
    if (step.stepName?.includes('service')) return '⚙️';
    return '→';
  }
}
```

### Step 3: Add DAG Endpoint

```typescript
// In tasks.controller.ts

@Get('rules/:ruleId/dag')
async getCompilationDAG(@Param('ruleId') ruleId: string) {
  // 1. Fetch rule from database
  const rule = await this.eventRuleService.findById(ruleId);
  
  if (!rule.compilationReport) {
    throw new NotFoundException('No compilation report for this rule');
  }

  // 2. Generate DAG from compilation report
  const dag = this.dagGenerator.generateDAGFromCompilationReport(
    rule.compilationReport
  );

  return {
    success: true,
    ruleId,
    ruleName: rule.name,
    dag,
    compilationReportId: rule.compilationReport.ruleId
  };
}
```

---

## Phase 2: LLM Error Explanation

### Step 1: Enhance CompilationFeedbackService

```typescript
// In compilation-feedback.service.ts: Add new method

export class CompilationFeedbackService {
  
  async generateLLMErrorExplanation(
    compilationReport: CompilationReport,
    userIntent: string,
    llmClient: any // LLM HTTP client
  ): Promise<string> {
    
    const issues = compilationReport.issues
      .map(issue => `- [${issue.severity}] ${issue.message}`)
      .join('\n');

    const prompt = `
The user wanted to create a rule with this intent:
"${userIntent}"

The rule compilation FAILED. Here are the issues detected:

${issues}

Please explain in simple terms:
1. What went wrong
2. Why it failed
3. What the user should do to fix it

Use a friendly, helpful tone. Be specific and actionable.

Response format:
## What Went Wrong
[explanation]

## Why This Happened
[reason]

## How to Fix It
[actionable steps]
`;

    // Call LLM (Claude)
    const response = await llmClient.post('/v1/messages', {
      model: 'claude-3-haiku-20250307',
      max_tokens: 512,
      messages: [
        { role: 'user', content: prompt }
      ]
    });

    return response.data.content[0].text;
  }
}
```

### Step 2: Update TaskCompilerService to Call New Method

```typescript
// In TaskCompilerService: Update generateEventRuleFromIntent()

// After compilation fails
if (!compilationReport.isValid) {
  // Get LLM explanation of what went wrong
  const llmExplanation = await this.compilationFeedback.generateLLMErrorExplanation(
    compilationReport,
    dto.description, // original user intent
    this.llmClient
  );

  // Emit failure to frontend with explanation
  this.gateway.emitFailed(
    compilationId,
    `Compilation failed with ${compilationReport.errorCount} errors`,
    userMessage,
    llmExplanation
  );

  if (dto.create) {
    return {
      success: false,
      userMessage,
      llmFeedback: {
        summary: llmExplanation,
        missing: compilationReport.issues.reduce((acc, issue) => ({
          ...acc,
          [issue.issueType]: [...(acc[issue.issueType] || []), issue.message]
        }), {})
      }
    };
  }
}
```

---

## Phase 3: Human-in-the-Loop Approval Workflow

### Step 1: Add RuleStatus to EventRuleEntity

```typescript
// In event-rule.entity.ts

export enum RuleApprovalStatus {
  DRAFT = 'DRAFT',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  ACTIVE = 'ACTIVE'
}

@Entity('event_rules')
export class EventRuleEntity {
  // ... existing columns ...

  @Column('varchar', { default: RuleApprovalStatus.DRAFT })
  approvalStatus: RuleApprovalStatus;

  @Column('jsonb', { nullable: true })
  compilationReport: any;

  @Column('jsonb', { nullable: true })
  dag: any; // The DAG structure

  @Column('jsonb', { nullable: true })
  userApprovalFeedback?: {
    approved: boolean;
    feedback: string;
    approvedAt: Date;
    approvedBy: string; // userId
  };

  @Column('text', { nullable: true })
  userMessage?: string; // Message from user why they rejected

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

### Step 2: Create Rule Approval Service

```bash
# File: src/tasks/services/rule-approval.service.ts
```

```typescript
import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { EventRuleEntity, RuleApprovalStatus } from '../entities/event-rule.entity';

@Injectable()
export class RuleApprovalService {
  
  constructor(
    @InjectRepository(EventRuleEntity)
    private ruleRepository: Repository<EventRuleEntity>,
    private taskCompilerService: TaskCompilerService,
    private ruleExecutor: ExtendedRuleExecutorService
  ) {}

  /**
   * Get rules pending user approval
   */
  async getPendingApproval(userId: string) {
    return this.ruleRepository.find({
      where: { approvalStatus: RuleApprovalStatus.PENDING_APPROVAL },
      order: { createdAt: 'DESC' }
    });
  }

  /**
   * Approve a rule and activate it
   */
  async approveRule(ruleId: string, userId: string): Promise<EventRuleEntity> {
    const rule = await this.ruleRepository.findOneBy({ id: ruleId });
    
    if (rule.approvalStatus !== RuleApprovalStatus.PENDING_APPROVAL) {
      throw new BadRequestException('Rule is not pending approval');
    }

    rule.approvalStatus = RuleApprovalStatus.APPROVED;
    rule.userApprovalFeedback = {
      approved: true,
      feedback: 'User approved the DAG',
      approvedAt: new Date(),
      approvedBy: userId
    };

    // Activate the rule
    rule.approvalStatus = RuleApprovalStatus.ACTIVE;

    return this.ruleRepository.save(rule);
  }

  /**
   * Reject a rule and send back to LLM for refinement
   */
  async rejectRule(
    ruleId: string,
    userId: string,
    feedback: string
  ): Promise<{ nextAttempt: any }> {
    const rule = await this.ruleRepository.findOneBy({ id: ruleId });
    
    if (rule.approvalStatus !== RuleApprovalStatus.PENDING_APPROVAL) {
      throw new BadRequestException('Rule is not pending approval');
    }

    // Store rejection feedback
    rule.userMessage = feedback;
    rule.approvalStatus = RuleApprovalStatus.REJECTED;
    await this.ruleRepository.save(rule);

    // Call LLM again with user feedback
    const compilationId = `retry-${ruleId}`;
    const retryResult = await this.taskCompilerService.generateEventRuleFromIntent(
      {
        description: rule.description,
        create: false, // Get suggestions first
        userFeedback: feedback // New parameter: what user didn't like
      },
      UUID() // new task ID
    );

    return {
      nextAttempt: retryResult
    };
  }

  /**
   * Get rule details with DAG
   */
  async getRuleWithDAG(ruleId: string) {
    const rule = await this.ruleRepository.findOneBy({ id: ruleId });
    
    return {
      rule,
      dag: rule.dag,
      compilationReport: rule.compilationReport,
      approvalStatus: rule.approvalStatus,
      userMessage: rule.userMessage
    };
  }
}
```

### Step 3: Add Approval Endpoints

```typescript
// In tasks.controller.ts

@Get('rules/pending-approval')
async getPendingApproval(
  @Headers('X-User-ID') userId: string
) {
  return await this.ruleApprovalService.getPendingApproval(userId);
}

@Get('rules/:ruleId/for-approval')
async getRuleForApproval(@Param('ruleId') ruleId: string) {
  return await this.ruleApprovalService.getRuleWithDAG(ruleId);
}

@Post('rules/:ruleId/approve')
async approveRule(
  @Param('ruleId') ruleId: string,
  @Headers('X-User-ID') userId: string
) {
  const approved = await this.ruleApprovalService.approveRule(ruleId, userId);
  return {
    success: true,
    message: `Rule "${approved.name}" approved and activated`,
    rule: approved
  };
}

@Post('rules/:ruleId/reject')
async rejectRule(
  @Param('ruleId') ruleId: string,
  @Headers('X-User-ID') userId: string,
  @Body() dto: { feedback: string }
) {
  const result = await this.ruleApprovalService.rejectRule(
    ruleId,
    userId,
    dto.feedback
  );
  
  return {
    success: true,
    message: 'Rule rejected, LLM will retry with your feedback',
    nextAttempt: result.nextAttempt
  };
}
```

---

## Phase 4: Frontend Integration

### Step 1: Compilation Progress Component

```typescript
// Frontend (Angular/React)

// Subscribe to WebSocket events
compilationService.subscribe('compilation:started', (data) => {
  console.log('📝 Compilation started:', data);
});

compilationService.subscribe('compilation:step', (data) => {
  progressBar.setValue(data.progress);
  statusText.textContent = `${data.stepName}: ${data.message}`;
  console.log(`Step ${data.step}/8: ${data.progress}%`);
});

compilationService.subscribe('compilation:succeeded', (data) => {
  console.log('✅ Compilation succeeded');
  showDAGVisualization(data.dag);
  showApprovalScreen(data);
});

compilationService.subscribe('compilation:failed', (data) => {
  console.log('❌ Compilation failed');
  showErrorExplanation(data.llmExplanation);
  showUserMessage(data.userMessage);
});
```

### Step 2: DAG Visualization Component

```typescript
// Use a library like ReactFlow or Cytoscape

<DagVisualization 
  nodes={dag.nodes}
  edges={dag.edges}
  metadata={dag.metadata}
  onApprove={handleApprove}
  onReject={handleReject}
/>

// Display: 
// 🎯 Trigger → ❓ Condition → 💬 Slack Action
// With estimated time, complexity, etc.
```

### Step 3: Approval Screen

```typescript
<ApprovalScreen
  rule={rule}
  dag={dag}
  compilationReport={compilationReport}
  onApprove={() => {
    api.post(`/tasks/rules/${ruleId}/approve`);
    showSuccess('Rule activated!');
  }}
  onReject={() => {
    const feedback = prompt('Why are you rejecting this?');
    api.post(`/tasks/rules/${ruleId}/reject`, { feedback });
    showInfo('LLM will retry...');
  }}
/>
```

---

## Implementation Order

### Day 1: WebSocket + DAG Generation
- [ ] CompilationProgressGateway (30 min)
- [ ] DAG interfaces + DAGGeneratorService (1.5 hours)
- [ ] Update RuleCompilerService to emit events (30 min)
- [ ] Add DAG endpoint (30 min)
- [ ] Test: Compile rule and see DAG (30 min)

### Day 2: LLM Error Explanation + Approval
- [ ] Update CompilationFeedbackService (1 hour)
- [ ] Add RuleApprovalStatus to entity (30 min)
- [ ] Create RuleApprovalService (1.5 hours)
- [ ] Add approval endpoints (1 hour)
- [ ] Test: Reject rule and see LLM retry (1 hour)

### Day 3: Frontend Integration
- [ ] WebSocket progress component (2 hours)
- [ ] DAG visualization component (2 hours)
- [ ] Approval screen component (2 hours)
- [ ] Integration testing (1 hour)

---

## Testing Scenarios

### Scenario A: Happy Path
1. User provides intent → "Alert Slack when DB memory < 15%"
2. Frontend shows compilation progress (WebSocket events)
3. Compilation succeeds
4. DAG visualization shown: Trigger → Condition → Action
5. User approves DAG → Rule activated

### Scenario B: Compilation Fails
1. User provides invalid intent → "Call non-existent-service"
2. Compilation fails
3. LLM explains: "Error: Service 'non-existent-service' not found. Available services: ..."
4. User sees options: Retry, Reject, Choose different service

### Scenario C: User Rejects DAG
1. Rule compiled successfully
2. DAG shows 5 steps
3. User rejects: "Too complex, too many steps"
4. LLM retries with feedback: "Keep rule simple with max 3 steps"
5. New rule generated, user sees new DAG

---

## Success Metrics

✅ Real-time events flow to frontend
✅ DAG accurately represents rule steps  
✅ Error explanations are specific and actionable
✅ User can approve/reject and LLM respects feedback
✅ Approved rules have `ACTIVE` status
✅ Complete human-in-the-loop workflow working end-to-end

