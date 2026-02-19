/**
 * LIVE USER TASK TEST
 * 
 * Simule un utilisateur réel qui:
 * 1. Entre une tâche
 * 2. La tâche est enregistrée
 * 3. Compilée à travers tout le pipeline
 * 4. Exécutée
 * 
 * Test de bout en bout: User Request → Full Compilation → Execution
 */

import { Test, TestingModule } from '@nestjs/testing';
import { TaskExecutionService } from './task-execution.service';
import { ServiceResolutionService } from './stages/stage-7-service-resolution.service';
import { ServicePreloaderService } from './stages/stage-8-service-preloader.service';
import { SemanticVirtualMachine } from '../runtime/semantic-vm.service';
import { UserTaskRequest } from './task-execution.service';

describe('LIVE USER TASK EXECUTION TEST', () => {
  let taskExecutionService: TaskExecutionService;
  let resolutionService: ServiceResolutionService;
  let preloaderService: ServicePreloaderService;
  let vm: SemanticVirtualMachine;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskExecutionService,
        ServiceResolutionService,
        ServicePreloaderService,
        SemanticVirtualMachine
      ]
    }).compile();

    taskExecutionService = module.get<TaskExecutionService>(TaskExecutionService);
    resolutionService = module.get<ServiceResolutionService>(ServiceResolutionService);
    preloaderService = module.get<ServicePreloaderService>(ServicePreloaderService);
    vm = module.get<SemanticVirtualMachine>(SemanticVirtualMachine);
  });

  describe('SCENARIO 1: User Sentiment Analysis', () => {
    it('should execute "Analyze the sentiment of: I love this product!"', async () => {
      console.log('\n' + '═'.repeat(100));
      console.log('🚀 LIVE TEST SCENARIO 1: Simple Sentiment Analysis');
      console.log('═'.repeat(100));

      // STEP 1: User submits a task
      const userRequest: UserTaskRequest = {
        userId: 'user-john-001',
        action: 'analyze-sentiment',
        parameters: {
          text: 'I absolutely love this product! Highly recommend it to everyone.',
        },
      };

      console.log('\n📝 USER REQUEST RECEIVED:');
      console.log(`   User ID: ${userRequest.userId}`);
      console.log(`   Action: ${userRequest.action}`);
      console.log(`   Parameters: ${JSON.stringify(userRequest.parameters)}`);

      // STEP 2: Display system info
      console.log('\n📊 SYSTEM INFORMATION:');
      const systemInfo = taskExecutionService.getSystemInfo();
      console.log(`   Available Actions: ${systemInfo.availableActions.length}`);
      console.log(`   Available Services: ${systemInfo.totalServices}`);
      console.log(`   Services: ${systemInfo.availableServiceIds.join(', ')}`);
      console.log(`   Connectors: ${systemInfo.availableConnectors.map((c: any) => c.name).join(', ')}`);

      // STEP 3: Execute task through full pipeline
      console.log('\n🔄 EXECUTING TASK THROUGH COMPILATION PIPELINE:');

      const result = await taskExecutionService.executeTask(userRequest);

      // STEP 4: Display results
      console.log('\n✅ EXECUTION COMPLETE:');
      console.log(`   Task ID: ${result.taskId}`);
      console.log(`   Status: ${result.status}`);
      console.log(`   Compilation Time: ${result.compilationTime}ms`);
      console.log(`   Execution Time: ${result.executionTime}ms`);
      console.log(`   Total Time: ${result.totalTime}ms`);
      console.log(`   Services Used: ${result.services.join(', ')}`);

      if (result.result) {
        console.log(`   Services Called: ${result.result.servicesCalled.length}`);
        result.result.servicesCalled.forEach((call: any, idx: number) => {
          console.log(`     [${idx}] ${call.serviceId} (${call.format}): ${call.duration}ms`);
        });
      }

      console.log('\n═'.repeat(100) + '\n');

      expect(result.status).toBe('success');
      expect(result.services.length).toBeGreaterThan(0);
      expect(result.totalTime).toBeLessThan(2000);
    });
  });

  describe('SCENARIO 2: Multi-service Combined Analysis', () => {
    it('should execute parallel sentiment analysis and GitHub search', async () => {
      console.log('\n' + '═'.repeat(100));
      console.log('🚀 LIVE TEST SCENARIO 2: Combined Sentiment + GitHub Search');
      console.log('═'.repeat(100));

      const userRequest: UserTaskRequest = {
        userId: 'user-alice-002',
        action: 'analyze-sentiment-and-search',
        parameters: {
          text: 'This framework is amazing and powerful!',
          query: 'typescript-framework',
        },
      };

      console.log('\n📝 USER REQUEST RECEIVED:');
      console.log(`   User ID: ${userRequest.userId}`);
      console.log(`   Action: ${userRequest.action}`);
      console.log(`   Text: ${userRequest.parameters.text}`);
      console.log(`   Search Query: ${userRequest.parameters.query}`);

      console.log('\n🔄 EXECUTING COMBINED ANALYSIS:');

      const result = await taskExecutionService.executeTask(userRequest);

      console.log('\n✅ EXECUTION COMPLETE:');
      console.log(`   Task ID: ${result.taskId}`);
      console.log(`   Status: ${result.status}`);
      console.log(`   Services Used: ${result.services.join(', ')}`);
      console.log(`   Total Compilation + Execution Time: ${result.totalTime}ms`);

      if (result.result) {
        console.log(`   Instructions Executed: ${result.result.instructionsExecuted}`);
        console.log(`   Services Called: ${result.result.servicesCalled.length}`);
      }

      console.log('\n═'.repeat(100) + '\n');

      expect(result.status).toBe('success');
      expect(result.services.length).toBe(2); // sentiment-analyzer + github-search
    });
  });

  describe('SCENARIO 3: Error Handling - Invalid Action', () => {
    it('should handle invalid user request gracefully', async () => {
      console.log('\n' + '═'.repeat(100));
      console.log('🚀 LIVE TEST SCENARIO 3: Error Handling');
      console.log('═'.repeat(100));

      const userRequest: UserTaskRequest = {
        userId: 'user-bob-003',
        action: 'non-existent-action',
        parameters: { text: 'test' },
      };

      console.log('\n📝 USER REQUEST RECEIVED:');
      console.log(`   User ID: ${userRequest.userId}`);
      console.log(`   Action: ${userRequest.action} (INVALID)`);

      const result = await taskExecutionService.executeTask(userRequest);

      console.log('\n✅ ERROR HANDLING:');
      console.log(`   Status: ${result.status}`);
      console.log(`   Error: ${result.error}`);

      console.log('\n═'.repeat(100) + '\n');

      expect(result.status).toBe('error');
      expect(result.error).toContain('not available');
    });
  });

  describe('SCENARIO 4: Multi-user Concurrent Tasks', () => {
    it('should handle multiple users submitting tasks simultaneously', async () => {
      console.log('\n' + '═'.repeat(100));
      console.log('🚀 LIVE TEST SCENARIO 4: Concurrent Multi-user Tasks');
      console.log('═'.repeat(100));

      const users = [
        {
          userId: 'user-alice',
          text: 'This is wonderful! 😊',
        },
        {
          userId: 'user-bob',
          text: 'This is terrible! 😞',
        },
        {
          userId: 'user-charlie',
          text: 'This is amazing! 🚀',
        },
      ];

      console.log('\n📝 THREE SIMULTANEOUS USER REQUESTS:');
      users.forEach((user, idx) => {
        console.log(`   [${idx + 1}] ${user.userId}: "${user.text}"`);
      });

      const requests: UserTaskRequest[] = users.map(user => ({
        userId: user.userId,
        action: 'analyze-sentiment',
        parameters: { text: user.text },
      }));

      console.log('\n🔄 EXECUTING CONCURRENT TASKS:');

      const startTime = Date.now();
      const results = await Promise.all(
        requests.map(req => taskExecutionService.executeTask(req))
      );
      const totalTime = Date.now() - startTime;

      console.log('\n✅ ALL TASKS COMPLETED:');
      console.log(`   Total concurrent execution time: ${totalTime}ms`);
      console.log(`   Individual task times:`);

      results.forEach((result, idx) => {
        console.log(
          `     [${idx + 1}] ${result.userId}: ${result.totalTime}ms - Status: ${result.status}`
        );
      });

      console.log('\n═'.repeat(100) + '\n');

      expect(results.every(r => r.status === 'success')).toBe(true);
      expect(results.length).toBe(3);
    });
  });

  describe('SCENARIO 5: Database Recording Simulation', () => {
    it('should record task execution in database', async () => {
      console.log('\n' + '═'.repeat(100));
      console.log('🚀 LIVE TEST SCENARIO 5: Database Recording');
      console.log('═'.repeat(100));

      const userRequest: UserTaskRequest = {
        userId: 'user-david-005',
        action: 'analyze-sentiment',
        parameters: {
          text: 'Perfect! This is exactly what I needed!',
        },
      };

      console.log('\n📝 USER REQUEST:');
      console.log(`   User ID: ${userRequest.userId}`);
      console.log(`   Action: ${userRequest.action}`);

      const result = await taskExecutionService.executeTask(userRequest);

      console.log('\n💾 DATABASE RECORD (simulated):');
      const dbRecord = {
        id: result.taskId,
        userId: result.userId,
        action: result.action,
        parameters: userRequest.parameters,
        status: result.status,
        result: result.result,
        compilationTime: result.compilationTime,
        executionTime: result.executionTime,
        totalTime: result.totalTime,
        servicesUsed: result.services,
        timestamp: new Date(),
      };

      console.log(`   ID: ${dbRecord.id}`);
      console.log(`   User: ${dbRecord.userId}`);
      console.log(`   Action: ${dbRecord.action}`);
      console.log(`   Status: ${dbRecord.status}`);
      console.log(`   Total Time: ${dbRecord.totalTime}ms`);
      console.log(`   Timestamp: ${dbRecord.timestamp.toISOString()}`);

      console.log('\n📋 SERVICES RESOLVED AND USED:');
      dbRecord.servicesUsed.forEach((service, idx) => {
        console.log(`   [${idx + 1}] ${service}`);
      });

      console.log('\n═'.repeat(100) + '\n');

      expect(dbRecord.status).toBe('success');
      expect(dbRecord.totalTime).toBeGreaterThan(0);
    });
  });

  describe('SCENARIO 6: Performance Under Load', () => {
    it('should handle 10 sequential tasks efficiently', async () => {
      console.log('\n' + '═'.repeat(100));
      console.log('🚀 LIVE TEST SCENARIO 6: Performance Under Load (10 tasks)');
      console.log('═'.repeat(100));

      const tasks = Array.from({ length: 10 }, (_, i) => ({
        userId: `performance-test-user-${i}`,
        action: 'analyze-sentiment',
        parameters: {
          text: `Test sentiment ${i}: This is task number ${i}!`,
        },
      }) as UserTaskRequest);

      console.log('\n🔄 EXECUTING 10 SEQUENTIAL TASKS:');

      const startTime = Date.now();
      const results = [];

      for (let i = 0; i < tasks.length; i++) {
        const result = await taskExecutionService.executeTask(tasks[i]);
        results.push(result);
        if ((i + 1) % 3 === 0) {
          console.log(`   ✓ Completed ${i + 1}/10 tasks`);
        }
      }

      const totalTime = Date.now() - startTime;
      const averageTime = totalTime / tasks.length;

      console.log('\n📊 PERFORMANCE METRICS:');
      console.log(`   Total Time: ${totalTime}ms`);
      console.log(`   Average Time per Task: ${averageTime.toFixed(2)}ms`);
      console.log(`   Success Rate: ${results.filter(r => r.status === 'success').length}/${results.length}`);
      console.log(`   Throughput: ${(tasks.length / (totalTime / 1000)).toFixed(2)} tasks/sec`);

      console.log('\n═'.repeat(100) + '\n');

      expect(results.every(r => r.status === 'success')).toBe(true);
      expect(averageTime).toBeLessThan(500); // Should be fast
    });
  });
});
