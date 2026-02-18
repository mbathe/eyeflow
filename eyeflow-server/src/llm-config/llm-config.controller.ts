import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Request,
  HttpCode,
  HttpStatus,
  Patch,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiHeader,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiNotFoundResponse,
  ApiBadRequestResponse,
  ApiNoContentResponse,
} from '@nestjs/swagger';
import { LlmConfigService } from './llm-config.service';
import { LlmConfig, LlmHealthCheck } from './llm-config.types';
import { CreateLlmConfigDto, UpdateLlmConfigDto } from './create-llm-config.dto';
import { LlmConfigEntity } from './llm-config.entity';
import { validateUUID } from '../common/uuid.validator';

/**
 * API Endpoints pour gérer les configurations LLM
 * Base: /api/llm-config
 */
@ApiTags('LLM Config')
@ApiHeader({
  name: 'X-User-ID',
  description: 'User ID for data isolation',
  required: true,
})
@Controller('llm-config')
export class LlmConfigController {
  constructor(private llmConfigService: LlmConfigService) {}

  /**
   * Extract and validate user ID from X-User-ID header
   */
  private getUserId(headers: any): string {
    const userId = headers['x-user-id'];
    return validateUUID(userId, 'X-User-ID header');
  }

  /**
   * POST /llm-config
   * Créer une nouvelle configuration LLM
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create LLM configuration',
    description: 'Create a new LLM configuration (local Ollama or cloud API like OpenAI, Anthropic)',
  })
  @ApiCreatedResponse({
    description: 'LLM configuration created successfully',
    type: LlmConfigEntity,
  })
  @ApiBadRequestResponse({ description: 'Invalid LLM configuration' })
  async create(
    @Headers() headers: any,
    @Body() config: CreateLlmConfigDto,
  ): Promise<LlmConfigEntity> {
    const userId = this.getUserId(headers);
    return this.llmConfigService.create(userId, config as any);
  }

  /**
   * GET /llm-config
   * Lister toutes les configurations LLM de l'utilisateur
   */
  @Get()
  @ApiOperation({
    summary: 'List all LLM configurations',
    description: 'Retrieve all LLM configurations for the authenticated user',
  })
  @ApiOkResponse({
    description: 'List of LLM configurations',
    type: [LlmConfigEntity],
  })
  async findAll(@Headers() headers: any): Promise<LlmConfigEntity[]> {
    const userId = this.getUserId(headers);
    return this.llmConfigService.findAll(userId);
  }

  /**
   * GET /llm-config/default
   * Récupérer la configuration LLM par défaut
   */
  @Get('default')
  @ApiOperation({
    summary: 'Get default LLM configuration',
    description: 'Retrieve the LLM configuration marked as default for this user',
  })
  @ApiOkResponse({
    description: 'Default LLM configuration',
    type: LlmConfigEntity,
  })
  @ApiNotFoundResponse({ description: 'No default configuration found' })
  async getDefault(@Headers() headers: any): Promise<LlmConfigEntity> {
    const userId = this.getUserId(headers);
    return this.llmConfigService.getDefault(userId);
  }

  /**
   * GET /llm-config/:id
   * Récupérer une configuration spécifique
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Get LLM configuration details',
    description: 'Retrieve full details of a specific LLM configuration including health statistics',
  })
  @ApiParam({ name: 'id', description: 'Configuration ID (UUID)' })
  @ApiOkResponse({
    description: 'LLM configuration details',
    type: LlmConfigEntity,
  })
  @ApiNotFoundResponse({ description: 'Configuration not found' })
  async findOne(
    @Headers() headers: any,
    @Param('id') configId: string,
  ): Promise<LlmConfigEntity> {
    const userId = this.getUserId(headers);
    validateUUID(configId, 'Configuration ID');
    return this.llmConfigService.findOne(userId, configId);
  }

  /**
   * PUT /llm-config/:id
   * Mettre à jour une configuration
   */
  @Put(':id')
  @ApiOperation({
    summary: 'Update LLM configuration',
    description: 'Update LLM configuration parameters like temperature, max tokens, etc.',
  })
  @ApiParam({ name: 'id', description: 'Configuration ID (UUID)' })
  @ApiOkResponse({
    description: 'Updated configuration',
    type: LlmConfigEntity,
  })
  @ApiNotFoundResponse({ description: 'Configuration not found' })
  @ApiBadRequestResponse({ description: 'Invalid update data' })
  async update(
    @Headers() headers: any,
    @Param('id') configId: string,
    @Body() updateData: UpdateLlmConfigDto,
  ): Promise<LlmConfigEntity> {
    const userId = this.getUserId(headers);
    validateUUID(configId, 'Configuration ID');
    return this.llmConfigService.update(userId, configId, updateData as any);
  }

  /**
   * POST /llm-config/:id/health-check
   * Tester la santé d'une configuration LLM
   */
  @Post(':id/health-check')
  @ApiOperation({
    summary: 'Check LLM configuration health',
    description: 'Verify that the LLM provider is accessible and responsive',
  })
  @ApiParam({ name: 'id', description: 'Configuration ID (UUID)' })
  @ApiOkResponse({
    description: 'Health check result with latency and status',
  })
  @ApiNotFoundResponse({ description: 'Configuration not found' })
  async healthCheck(
    @Headers() headers: any,
    @Param('id') configId: string,
  ): Promise<LlmHealthCheck> {
    const userId = this.getUserId(headers);
    validateUUID(configId, 'Configuration ID');
    return this.llmConfigService.healthCheck(userId, configId);
  }

  /**
   * DELETE /llm-config/:id
   * Supprimer une configuration
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete LLM configuration',
    description: 'Remove an LLM configuration (soft delete)',
  })
  @ApiParam({ name: 'id', description: 'Configuration ID (UUID)' })
  @ApiNoContentResponse({ description: 'Configuration deleted successfully' })
  @ApiNotFoundResponse({ description: 'Configuration not found' })
  async delete(
    @Headers() headers: any,
    @Param('id') configId: string,
  ): Promise<void> {
    const userId = this.getUserId(headers);
    validateUUID(configId, 'Configuration ID');
    return this.llmConfigService.delete(userId, configId);
  }

  /**
   * PATCH /llm-config/:id/set-default
   * Définir comme configuration par défaut
   */
  @Patch(':id/set-default')
  @ApiOperation({
    summary: 'Set as default LLM configuration',
    description: 'Mark this LLM configuration as the default for the user',
  })
  @ApiParam({ name: 'id', description: 'Configuration ID (UUID)' })
  @ApiOkResponse({
    description: 'Configuration set as default',
  })
  @ApiNotFoundResponse({ description: 'Configuration not found' })
  async setDefault(
    @Headers() headers: any,
    @Param('id') configId: string,
  ): Promise<any> {
    const userId = this.getUserId(headers);
    validateUUID(configId, 'Configuration ID');
    const updated = await this.llmConfigService.update(userId, configId, { isDefault: true });
    return {
      message: 'Configuration set as default',
      config: updated,
    };
  }
}
