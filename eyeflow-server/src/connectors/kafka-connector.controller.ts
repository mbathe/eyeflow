import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiBody,
  ApiResponse,
  ApiHeader,
} from '@nestjs/swagger';
import { ConnectorsService } from './connectors.service';
import { KafkaConnectorService } from './kafka-connector.service';
import { KafkaProducerMessage, ConnectorType, KafkaConnectorConfig } from './connector.types';
import { convertConnectorEntityToKafkaConfig } from './kafka-connector.converter';
import { validateUUID } from '../common/uuid.validator';

@ApiTags('Connectors - Kafka')
@ApiHeader({
  name: 'X-User-ID',
  description: 'User ID for data isolation',
  required: true,
})
@Controller('connectors/kafka')
export class KafkaConnectorController {
  constructor(
    private connectorsService: ConnectorsService,
    private kafkaConnectorService: KafkaConnectorService,
  ) {}

  /**
   * Test Kafka connector connection
   */
  @Post(':connectorId/test')
  @ApiOperation({
    summary: 'Test Kafka connector connection',
    description: 'Verify connectivity to Kafka brokers',
  })
  @ApiParam({ name: 'connectorId', description: 'Kafka Connector ID' })
  async testConnection(
    @Headers() headers: any,
    @Param('connectorId') connectorId: string,
  ) {
    const userId = validateUUID(headers['x-user-id'], 'X-User-ID header');
    validateUUID(connectorId, 'Connector ID');

    const connector = await this.connectorsService.findOne(
      userId,
      connectorId,
    );
    if (connector.type !== 'kafka') {
      throw new Error('Connector is not a Kafka connector');
    }

    const credentials = this.connectorsService.getDecryptedCredentials(connector);
    const config: KafkaConnectorConfig = {
      id: connector.id,
      type: ConnectorType.KAFKA,
      name: connector.name,
      userId: connector.userId,
      auth: {
        type: connector.authType,
        credentials,
        encrypted: true,
      },
      topics: [],
      enabled: connector.status === 'active',
      createdAt: connector.createdAt,
      updatedAt: connector.updatedAt,
    };

    return this.kafkaConnectorService.testConnection(config);
  }

  /**
   * List all topics from Kafka cluster
   */
  @Get(':connectorId/topics')
  @ApiOperation({
    summary: 'List Kafka topics',
    description: 'Get all topics including CDC topics (cdc.*)',
  })
  @ApiParam({ name: 'connectorId', description: 'Kafka Connector ID' })
  async listTopics(
    @Headers() headers: any,
    @Param('connectorId') connectorId: string,
  ) {
    const userId = validateUUID(headers['x-user-id'], 'X-User-ID header');
    validateUUID(connectorId, 'Connector ID');

    const connector = await this.connectorsService.findOne(
      userId,
      connectorId,
    );
    if (connector.type !== 'kafka') {
      throw new Error('Connector is not a Kafka connector');
    }

    const credentials = this.connectorsService.getDecryptedCredentials(connector);
    const config = convertConnectorEntityToKafkaConfig(connector, credentials);

    return this.kafkaConnectorService.listTopics(config);
  }

  /**
   * Get CDC topics only
   */
  @Get(':connectorId/topics/cdc')
  @ApiOperation({
    summary: 'List CDC topics',
    description: 'Get only Change Data Capture topics (cdc.* pattern)',
  })
  @ApiParam({ name: 'connectorId', description: 'Kafka Connector ID' })
  async listCdcTopics(
    @Headers() headers: any,
    @Param('connectorId') connectorId: string,
  ) {
    const userId = validateUUID(headers['x-user-id'], 'X-User-ID header');
    validateUUID(connectorId, 'Connector ID');

    const connector = await this.connectorsService.findOne(
      userId,
      connectorId,
    );
    if (connector.type !== 'kafka') {
      throw new Error('Connector is not a Kafka connector');
    }

    const credentials = this.connectorsService.getDecryptedCredentials(connector);
    const config = convertConnectorEntityToKafkaConfig(connector, credentials);

    const allTopics = await this.kafkaConnectorService.listTopics(config);
    return allTopics.filter((t) => t.isCdcTopic);
  }

  /**
   * Produce a message to a Kafka topic
   */
  @Post(':connectorId/produce')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Produce message to Kafka',
    description: 'Send a single message to a Kafka topic',
  })
  @ApiParam({ name: 'connectorId', description: 'Kafka Connector ID' })
  @ApiBody({
    schema: {
      properties: {
        topic: { type: 'string', example: 'orders' },
        key: { type: 'string', example: 'order-123' },
        value: { type: 'object', example: { orderId: 123, amount: 99.99 } },
      },
      required: ['topic', 'value'],
    },
  })
  async produceMessage(
    @Headers() headers: any,
    @Param('connectorId') connectorId: string,
    @Body() message: KafkaProducerMessage,
  ) {
    const userId = validateUUID(headers['x-user-id'], 'X-User-ID header');
    validateUUID(connectorId, 'Connector ID');

    const connector = await this.connectorsService.findOne(
      userId,
      connectorId,
    );
    if (connector.type !== 'kafka') {
      throw new Error('Connector is not a Kafka connector');
    }

    const credentials = this.connectorsService.getDecryptedCredentials(connector);
    const config = convertConnectorEntityToKafkaConfig(connector, credentials);

    return this.kafkaConnectorService.produceMessage(config, message);
  }

  /**
   * Produce multiple messages in batch
   */
  @Post(':connectorId/produce-batch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Produce multiple messages',
    description: 'Send multiple messages to Kafka topics',
  })
  @ApiParam({ name: 'connectorId', description: 'Kafka Connector ID' })
  @ApiBody({
    schema: {
      properties: {
        messages: {
          type: 'array',
          items: {
            properties: {
              topic: { type: 'string' },
              key: { type: 'string' },
              value: { type: 'object' },
            },
          },
        },
      },
      required: ['messages'],
    },
  })
  async produceMessages(
    @Headers() headers: any,
    @Param('connectorId') connectorId: string,
    @Body('messages') messages: KafkaProducerMessage[],
  ) {
    const userId = validateUUID(headers['x-user-id'], 'X-User-ID header');
    validateUUID(connectorId, 'Connector ID');

    const connector = await this.connectorsService.findOne(
      userId,
      connectorId,
    );
    if (connector.type !== 'kafka') {
      throw new Error('Connector is not a Kafka connector');
    }

    const credentials = this.connectorsService.getDecryptedCredentials(connector);
    const config = convertConnectorEntityToKafkaConfig(connector, credentials);

    return this.kafkaConnectorService.produceMessages(config, messages);
  }

  /**
   * Get consumer group information
   */
  @Get(':connectorId/consumer-groups/:groupId')
  @ApiOperation({
    summary: 'Get consumer group info',
    description: 'Retrieve consumer group offset and lag information',
  })
  @ApiParam({ name: 'connectorId', description: 'Kafka Connector ID' })
  @ApiParam({ name: 'groupId', description: 'Consumer group ID' })
  async describeConsumerGroup(
    @Headers() headers: any,
    @Param('connectorId') connectorId: string,
    @Param('groupId') groupId: string,
  ) {
    const userId = validateUUID(headers['x-user-id'], 'X-User-ID header');
    validateUUID(connectorId, 'Connector ID');

    const connector = await this.connectorsService.findOne(
      userId,
      connectorId,
    );
    if (connector.type !== 'kafka') {
      throw new Error('Connector is not a Kafka connector');
    }

    const credentials = this.connectorsService.getDecryptedCredentials(connector);
    const config = convertConnectorEntityToKafkaConfig(connector, credentials);

    return this.kafkaConnectorService.describeConsumerGroup(config, groupId);
  }
}
