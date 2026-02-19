/**
 * TASK CONTROLLER
 * 
 * Endpoints pour recevoir les demandes utilisateur et les compiler/exécuter
 */

import { Controller, Post, Get, Body, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { TaskExecutionService, UserTaskRequest, TaskExecutionResult } from './task-execution.service';

@Controller('api/tasks')
export class TaskController {
  private readonly logger = new Logger(TaskController.name);

  constructor(private taskExecutionService: TaskExecutionService) {}

  /**
   * GET /api/tasks/info
   * Get available actions and services
   */
  @Get('info')
  getSystemInfo() {
    return this.taskExecutionService.getSystemInfo();
  }

  /**
   * POST /api/tasks/execute
   * Execute a user task
   * 
   * Example request:
   * {
   *   "userId": "user-123",
   *   "action": "analyze-sentiment",
   *   "parameters": {
   *     "text": "I love this product!"
   *   }
   * }
   */
  @Post('execute')
  @HttpCode(HttpStatus.ACCEPTED)
  async executeTask(@Body() request: UserTaskRequest): Promise<TaskExecutionResult> {
    this.logger.log(`Received task execution request from user ${request.userId}`);
    this.logger.log(`Action: ${request.action}`);
    this.logger.log(`Parameters: ${JSON.stringify(request.parameters)}`);

    return await this.taskExecutionService.executeTask(request);
  }

  /**
   * POST /api/tasks/quick-sentiment
   * Quick endpoint to analyze sentiment
   */
  @Post('quick-sentiment')
  @HttpCode(HttpStatus.ACCEPTED)
  async quickSentimentAnalysis(@Body() body: { userId: string; text: string }): Promise<TaskExecutionResult> {
    const request: UserTaskRequest = {
      userId: body.userId,
      action: 'analyze-sentiment',
      parameters: { text: body.text },
    };

    return await this.taskExecutionService.executeTask(request);
  }

  /**
   * POST /api/tasks/combined-analysis
   * Quick endpoint for sentiment + GitHub search
   */
  @Post('combined-analysis')
  @HttpCode(HttpStatus.ACCEPTED)
  async combinedAnalysis(@Body() body: { userId: string; text: string; query: string }): Promise<TaskExecutionResult> {
    const request: UserTaskRequest = {
      userId: body.userId,
      action: 'analyze-sentiment-and-search',
      parameters: {
        text: body.text,
        query: body.query,
      },
    };

    return await this.taskExecutionService.executeTask(request);
  }
}
