import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('/health')
  getHealth() {
    return {
      status: 'ok',
      message: '🚀 EyeFlow Server is running!',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    };
  }

  @Get('/api')
  getApiInfo() {
    return {
      name: 'EyeFlow API',
      version: '1.0.0',
      description: 'Universal Action Execution & Monitoring Platform',
      endpoints: [
        { method: 'GET', path: '/health', description: 'Server health status' },
        { method: 'GET', path: '/api', description: 'API information' },
        { method: 'POST', path: '/agents/register', description: 'Register new agent' },
        { method: 'GET', path: '/agents', description: 'List all agents' },
        { method: 'GET', path: '/agents/:id', description: 'Get agent details' },
        { method: 'POST', path: '/actions', description: 'Create new action' },
        { method: 'GET', path: '/actions', description: 'List actions' },
        { method: 'GET', path: '/jobs', description: 'List jobs' },
        { method: 'GET', path: '/jobs/:id', description: 'Get job details' },
      ],
    };
  }
}
