import { ConnectorType, AuthType } from './connector.types';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsString, IsOptional, IsObject } from 'class-validator';

/**
 * Simplified DTO pour créer un connecteur via l'API
 * Transformée automatiquement en AnyConnectorConfig interne
 */
export class CreateConnectorDto {
  @ApiProperty({
    enum: ConnectorType,
    description: 'Type of connector (e.g., slack, postgresql, mqtt)',
    example: ConnectorType.SLACK,
  })
  @IsEnum(ConnectorType)
  type!: ConnectorType;

  @ApiProperty({
    type: String,
    description: 'Unique name for this connector',
    example: 'Production Slack',
  })
  @IsString()
  name!: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Optional description of the connector',
    example: 'Main team communication channel',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    type: Object,
    description: 'Authentication config with type and credentials',
    example: {
      type: 'bearer_token',
      credentials: {
        botToken: 'xoxb-123456789',
        webhookUrl: 'https://hooks.slack.com/services/T00/B00/XX',
      },
    },
  })
  @IsOptional()
  @IsObject()
  auth?: {
    type?: AuthType;
    credentials: Record<string, any>;
  };

  @ApiPropertyOptional({
    type: Object,
    description:
      'Credentials shorthand - alternative to nested auth.credentials',
    example: {
      botToken: 'xoxb-123456789',
      webhookUrl: 'https://hooks.slack.com/services/T00/B00/XX',
    },
  })
  @IsOptional()
  @IsObject()
  credentials?: Record<string, any>;

  @ApiPropertyOptional({
    type: Object,
    description: 'Type-specific configuration options',
  })
  @IsOptional()
  @IsObject()
  config?: Record<string, any>;

  @ApiPropertyOptional({
    type: Number,
    description: 'Connection timeout in milliseconds',
    example: 30000,
    default: 30000,
  })
  @IsOptional()
  timeout?: number;

  @ApiPropertyOptional({
    type: Number,
    description: 'Number of retry attempts on failure',
    example: 3,
    default: 3,
  })
  @IsOptional()
  retryCount?: number;

  @ApiPropertyOptional({
    type: Number,
    description: 'Delay between retries in milliseconds',
    example: 1000,
    default: 1000,
  })
  @IsOptional()
  retryDelay?: number;

  @ApiPropertyOptional({
    type: Number,
    description: 'Rate limit in requests per second',
  })
  @IsOptional()
  rateLimit?: number;

  @ApiPropertyOptional({
    type: Boolean,
    description: 'Whether the connector is enabled',
    example: true,
    default: true,
  })
  @IsOptional()
  enabled?: boolean;
}

/**
 * Helper pour transformer CreateConnectorDto en AnyConnectorConfig
 */
export function transformCreateDtoToConfig(dto: CreateConnectorDto): any {
  // Déterminer le auth type basé sur le type de connecteur
  const authType = dto.auth?.type || getDefaultAuthType(dto.type);

  // Construire les credentials depuis dto.credentials ou dto.auth.credentials
  const credentials = dto.auth?.credentials || dto.credentials || {};

  // Construire la config
  const config: any = {
    type: dto.type,
    name: dto.name,
    description: dto.description,
    auth: {
      type: authType,
      credentials,
      encrypted: true,
    },
    timeout: dto.timeout || 30000,
    retryCount: dto.retryCount || 3,
    retryDelay: dto.retryDelay || 1000,
    rateLimit: dto.rateLimit,
    enabled: dto.enabled !== false, // Default to true
  };

  // Ajouter les fields type-spéciques
  if (dto.config) {
    config.config = dto.config;
  }

  // Ajouter les fields supplémentaires (bucket, topics, etc)
  const ignoredKeys = new Set([
    'type',
    'name',
    'description',
    'auth',
    'credentials',
    'config',
    'timeout',
    'retryCount',
    'retryDelay',
    'rateLimit',
    'enabled',
  ]);

  for (const [key, value] of Object.entries(dto)) {
    if (!ignoredKeys.has(key) && value !== undefined) {
      config[key] = value;
    }
  }

  return config;
}

/**
 * Déterminer le AuthType par défaut selon le ConnectorType
 */
function getDefaultAuthType(connectorType: ConnectorType): AuthType {
  const authTypeMap: Record<ConnectorType, AuthType> = {
    [ConnectorType.POSTGRESQL]: AuthType.CONNECTION_STRING,
    [ConnectorType.MYSQL]: AuthType.CONNECTION_STRING,
    [ConnectorType.MONGODB]: AuthType.CONNECTION_STRING,
    [ConnectorType.DYNAMODB]: AuthType.API_KEY,
    [ConnectorType.FIRESTORE]: AuthType.API_KEY,
    [ConnectorType.LOCAL_FILE]: AuthType.NONE,
    [ConnectorType.S3]: AuthType.API_KEY,
    [ConnectorType.GOOGLE_DRIVE]: AuthType.OAUTH2,
    [ConnectorType.DROPBOX]: AuthType.OAUTH2,
    [ConnectorType.MQTT]: AuthType.BASIC_AUTH,
    [ConnectorType.KAFKA]: AuthType.BASIC_AUTH,
    [ConnectorType.INFLUXDB]: AuthType.BEARER_TOKEN,
    [ConnectorType.SMTP]: AuthType.BASIC_AUTH,
    [ConnectorType.SLACK]: AuthType.BEARER_TOKEN,
    [ConnectorType.TEAMS]: AuthType.API_KEY,
    [ConnectorType.WHATSAPP]: AuthType.API_KEY,
    [ConnectorType.SHOPIFY]: AuthType.API_KEY,
    [ConnectorType.STRIPE]: AuthType.API_KEY,
    [ConnectorType.HUBSPOT]: AuthType.API_KEY,
    [ConnectorType.WEBHOOK]: AuthType.NONE,
    [ConnectorType.REST_API]: AuthType.API_KEY,
    [ConnectorType.GRAPHQL]: AuthType.API_KEY,
  };

  return authTypeMap[connectorType] || AuthType.API_KEY;
}
