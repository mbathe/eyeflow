import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { AgentsService } from './agents.service';

@Controller('agents')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Post('register')
  registerAgent(
    @Body() data: { agentName: string; version: string; capabilities: string[] },
  ) {
    const agent = this.agentsService.registerAgent(data);
    return {
      success: true,
      message: 'Agent registered successfully',
      agent,
    };
  }

  @Get()
  getAllAgents() {
    const agents = this.agentsService.getAllAgents();
    return {
      total: agents.length,
      agents,
    };
  }

  @Get(':id')
  getAgent(@Param('id') id: string) {
    const agent = this.agentsService.getAgent(id);
    if (!agent) {
      return { error: 'Agent not found' };
    }
    return agent;
  }
}
