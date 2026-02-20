import { Controller, Post, Body, Headers, Get, Param, Delete, HttpCode, HttpStatus } from '@nestjs/common';
import { CreateLLMSessionDto } from '../dto/create-llm-session.dto';
import { LLMSessionService } from '../services/llm-session.service';

@Controller('tasks/llm-sessions')
export class LLMSessionsController {
  constructor(private readonly sessionService: LLMSessionService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Headers('X-User-ID') userId: string, @Body() dto: CreateLLMSessionDto) {
    const session = await this.sessionService.createSession(userId, dto);
    return { id: session.id, expiresAt: session.expiresAt, allowedConnectorIds: session.allowedConnectorIds };
  }

  @Get(':id')
  async get(@Headers('X-User-ID') userId: string, @Param('id') id: string) {
    const session = await this.sessionService.getSession(id);
    if (!session || session.userId !== userId) return { found: false };
    return { id: session.id, expiresAt: session.expiresAt, allowedConnectorIds: session.allowedConnectorIds };
  }

  @Delete(':id')
  async delete(@Headers('X-User-ID') userId: string, @Param('id') id: string) {
    const session = await this.sessionService.getSession(id);
    if (!session || session.userId !== userId) return { deleted: false };
    await this.sessionService.deleteSession(id);
    return { deleted: true };
  }
}
