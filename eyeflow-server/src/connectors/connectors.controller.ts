import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiHeader,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiNotFoundResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNoContentResponse,
} from '@nestjs/swagger';
import { ConnectorsService } from './connectors.service';
import {
  ConnectorType,
  ConnectorStatus,
  AnyConnectorConfig,
  ConnectorTestResponse,
} from './connector.types';
import { CreateConnectorDto, transformCreateDtoToConfig } from './create-connector.dto';
import { ConnectorEntity } from './connector.entity';
import { validateUUID } from '../common/uuid.validator';

/**
 * API Endpoints pour la gestion des connecteurs
 * Base: /api/connectors
 */
@ApiTags('Connectors')
@ApiHeader({
  name: 'X-User-ID',
  description: 'User ID for data isolation',
  required: true,
})
@Controller('connectors')
export class ConnectorsController {
  constructor(private connectorsService: ConnectorsService) {}

  /**
   * Extract and validate user ID from X-User-ID header
   */
  private getUserId(headers: any): string {
    const userId = headers['x-user-id'];
    return validateUUID(userId, 'X-User-ID header');
  }

  /**
   * POST /connectors
   * Créer un nouveau connecteur
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new connector',
    description: 'Create a connector for integrating with external data sources (databases, APIs, IoT, communication platforms, etc.)',
  })
  @ApiCreatedResponse({
    description: 'Connector created successfully',
    type: ConnectorEntity,
  })
  @ApiBadRequestResponse({ description: 'Invalid connector configuration' })
  @ApiConflictResponse({ description: 'Connector with this name already exists' })
  async create(
    @Headers() headers: any,
    @Body() dto: CreateConnectorDto,
  ): Promise<ConnectorEntity> {
    const userId = this.getUserId(headers);
    const config = transformCreateDtoToConfig(dto);
    return this.connectorsService.create(userId, config);
  }

  /**
   * GET /connectors
   * Lister tous les connecteurs avec filtrage optionnel
   */
  @Get()
  @ApiOperation({
    summary: 'List all connectors',
    description: 'Retrieve all connectors for the authenticated user with optional filtering',
  })
  @ApiQuery({ name: 'type', required: false, description: 'Filter by connector type' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by connector status' })
  @ApiOkResponse({
    description: 'List of connectors',
    type: [ConnectorEntity],
  })
  async findAll(
    @Headers() headers: any,
    @Query('type') type?: ConnectorType,
    @Query('status') status?: ConnectorStatus,
  ): Promise<ConnectorEntity[]> {
    const userId = this.getUserId(headers);
    return this.connectorsService.findAll(userId, {
      type,
      status: status as ConnectorStatus,
    });
  }

  /**
   * GET /connectors/:id
   * Récupérer un connecteur spécifique
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Get connector details',
    description: 'Retrieve full details of a specific connector by ID',
  })
  @ApiParam({ name: 'id', description: 'Connector ID (UUID)' })
  @ApiOkResponse({
    description: 'Connector details',
    type: ConnectorEntity,
  })
  @ApiNotFoundResponse({ description: 'Connector not found' })
  async findOne(
    @Headers() headers: any,
    @Param('id') connectorId: string,
  ): Promise<ConnectorEntity> {
    const userId = this.getUserId(headers);
    validateUUID(connectorId, 'Connector ID');
    return this.connectorsService.findOne(userId, connectorId);
  }

  /**
   * PUT /connectors/:id
   * Mettre à jour un connecteur
   */
  @Put(':id')
  @ApiOperation({
    summary: 'Update connector',
    description: 'Update connector configuration and metadata',
  })
  @ApiParam({ name: 'id', description: 'Connector ID (UUID)' })
  @ApiOkResponse({
    description: 'Updated connector',
    type: ConnectorEntity,
  })
  @ApiNotFoundResponse({ description: 'Connector not found' })
  @ApiBadRequestResponse({ description: 'Invalid update data' })
  async update(
    @Headers() headers: any,
    @Param('id') connectorId: string,
    @Body() updateData: Partial<AnyConnectorConfig>,
  ): Promise<ConnectorEntity> {
    const userId = this.getUserId(headers);
    validateUUID(connectorId, 'Connector ID');
    return this.connectorsService.update(userId, connectorId, updateData);
  }

  /**
   * POST /connectors/:id/test
   * Tester la connexion avec un connecteur
   */
  @Post(':id/test')
  @ApiOperation({
    summary: 'Test connector connection',
    description: 'Verify that the connector can successfully connect to the target system',
  })
  @ApiParam({ name: 'id', description: 'Connector ID (UUID)' })
  @ApiOkResponse({
    description: 'Connection test result with latency metrics',
  })
  @ApiNotFoundResponse({ description: 'Connector not found' })
  async testConnection(
    @Headers() headers: any,
    @Param('id') connectorId: string,
  ): Promise<ConnectorTestResponse> {
    const userId = this.getUserId(headers);
    validateUUID(connectorId, 'Connector ID');
    return this.connectorsService.testConnection(userId, connectorId);
  }

  /**
   * DELETE /connectors/:id
   * Supprimer un connecteur
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete connector',
    description: 'Soft delete a connector (marked as deleted, not physically removed)',
  })
  @ApiParam({ name: 'id', description: 'Connector ID (UUID)' })
  @ApiNoContentResponse({ description: 'Connector deleted successfully' })
  @ApiNotFoundResponse({ description: 'Connector not found' })
  async delete(
    @Headers() headers: any,
    @Param('id') connectorId: string,
  ): Promise<void> {
    const userId = this.getUserId(headers);
    validateUUID(connectorId, 'Connector ID');
    return this.connectorsService.delete(userId, connectorId);
  }

  /**
   * PATCH /connectors/:id/status
   * Activer/Désactiver un connecteur
   */
  @Put(':id/status')
  @ApiOperation({
    summary: 'Update connector status',
    description: 'Change connector status (CONFIGURED, ACTIVE, TESTING, FAILED)',
  })
  @ApiParam({ name: 'id', description: 'Connector ID (UUID)' })
  @ApiOkResponse({
    description: 'Updated connector',
    type: ConnectorEntity,
  })
  @ApiNotFoundResponse({ description: 'Connector not found' })
  @ApiBadRequestResponse({ description: 'Invalid status' })
  async setStatus(
    @Headers() headers: any,
    @Param('id') connectorId: string,
    @Body('status') status: ConnectorStatus,
  ): Promise<ConnectorEntity> {
    const userId = this.getUserId(headers);
    validateUUID(connectorId, 'Connector ID');
    return this.connectorsService.setStatus(userId, connectorId, status);
  }

  /**
   * GET /connectors/catalog/available-types
   * Retourner tous les types de connecteurs disponibles
   */
  @Get('catalog/available-types')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get available connector types',
    description: 'Retrieve all 15+ supported connector types organized by category',
  })
  @ApiOkResponse({
    description: 'Available connector types by category',
  })
  getAvailableConnectorTypes(): any {
    return {
      databases: [
        ConnectorType.POSTGRESQL,
        ConnectorType.MYSQL,
        ConnectorType.MONGODB,
        ConnectorType.DYNAMODB,
        ConnectorType.FIRESTORE,
      ],
      fileystems: [
        ConnectorType.LOCAL_FILE,
        ConnectorType.S3,
        ConnectorType.GOOGLE_DRIVE,
        ConnectorType.DROPBOX,
      ],
      iot: [
        ConnectorType.MQTT,
        ConnectorType.KAFKA,
        ConnectorType.INFLUXDB,
      ],
      communication: [
        ConnectorType.SLACK,
        ConnectorType.TEAMS,
        ConnectorType.WHATSAPP,
        ConnectorType.SMTP,
      ],
      business: [
        ConnectorType.SHOPIFY,
        ConnectorType.STRIPE,
        ConnectorType.HUBSPOT,
      ],
      custom: [
        ConnectorType.REST_API,
        ConnectorType.GRAPHQL,
        ConnectorType.WEBHOOK,
      ],
    };
  }
}
