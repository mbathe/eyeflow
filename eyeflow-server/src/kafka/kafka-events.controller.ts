import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiHeader,
  ApiBadRequestResponse,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { KafkaConsumerService } from './kafka-consumer.service';
import { EventRule, KAFKA_TOPICS, EXAMPLE_RULES } from './kafka-events.types';
import { validateUUID } from '../common/uuid.validator';

/**
 * Kafka Events Controller
 * API endpoints for managing CDC topics and event routing rules
 */
@ApiTags('Kafka & CDC Events')
@ApiHeader({
  name: 'X-User-ID',
  description: 'User ID for data isolation',
  required: true,
})
@Controller('kafka')
export class KafkaEventsController {
  // Store rules in memory (in production, store in database)
  private rules: Map<string, EventRule> = new Map();

  constructor(private kafkaService: KafkaConsumerService) {
    // Initialize with example rules
    EXAMPLE_RULES.forEach((rule) => {
      this.rules.set(rule.id, rule);
    });
    this.kafkaService.registerRules(Array.from(this.rules.values()));
  }

  @Get('status')
  @ApiOperation({
    summary: 'Get Kafka consumer status',
    description: 'Check if Kafka consumer is running and configured',
  })
  @ApiResponse({
    status: 200,
    description: 'Kafka consumer status',
    schema: {
      properties: {
        connected: { type: 'boolean' },
        rulesCount: { type: 'number' },
        processorStats: { type: 'object' },
      },
    },
  })
  getStatus(@Headers() headers: any) {
    this.validateUser(headers);
    return this.kafkaService.getStatus();
  }

  @Get('topics')
  @ApiOperation({
    summary: 'Get available CDC topics',
    description: 'List all standard Kafka topics for CDC events',
  })
  getAvailableTopics(@Headers() headers: any) {
    this.validateUser(headers);
    return {
      topics: KAFKA_TOPICS,
      description: 'Topics follow naming convention: cdc.{source}.{schema}.{table}',
    };
  }

  /**
   * Event Routing Rules Management
   */

  @Get('rules')
  @ApiOperation({
    summary: 'List all CDC routing rules',
    description: 'Get all configured event routing rules',
  })
  @ApiResponse({
    status: 200,
    description: 'List of routing rules',
    isArray: true,
  })
  listRules(@Headers() headers: any) {
    this.validateUser(headers);
    return Array.from(this.rules.values());
  }

  @Get('rules/:ruleId')
  @ApiOperation({
    summary: 'Get a specific routing rule',
  })
  @ApiParam({ name: 'ruleId', description: 'Rule ID' })
  getRule(
    @Headers() headers: any,
    @Param('ruleId') ruleId: string,
  ): EventRule | null {
    this.validateUser(headers);
    return this.rules.get(ruleId) || null;
  }

  @Post('rules')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new CDC routing rule',
    description:
      'Define a rule that transforms database events into agent missions',
  })
  @ApiCreatedResponse({
    description: 'Rule created successfully',
    type: Object,
  })
  @ApiBadRequestResponse({ description: 'Invalid rule configuration' })
  createRule(
    @Headers() headers: any,
    @Body() rule: EventRule,
  ): EventRule {
    this.validateUser(headers);

    // Validate rule
    if (!rule.name || !rule.trigger || !rule.action) {
      throw new Error('Rule must have name, trigger, and action');
    }

    // Ensure ID
    if (!rule.id) {
      rule.id = `rule-${Date.now()}`;
    }

    // Store rule
    this.rules.set(rule.id, rule);

    // Update consumer with new rules
    this.kafkaService.registerRules(Array.from(this.rules.values()));

    return rule;
  }

  @Put('rules/:ruleId')
  @ApiOperation({
    summary: 'Update an existing CDC routing rule',
  })
  @ApiParam({ name: 'ruleId', description: 'Rule ID' })
  updateRule(
    @Headers() headers: any,
    @Param('ruleId') ruleId: string,
    @Body() updates: Partial<EventRule>,
  ): EventRule {
    this.validateUser(headers);

    const rule = this.rules.get(ruleId);
    if (!rule) {
      throw new Error(`Rule not found: ${ruleId}`);
    }

    // Update rule
    const updatedRule = {
      ...rule,
      ...updates,
      id: ruleId, // Ensure ID doesn't change
    };

    this.rules.set(ruleId, updatedRule);

    // Update consumer with modified rules
    this.kafkaService.registerRules(Array.from(this.rules.values()));

    return updatedRule;
  }

  @Delete('rules/:ruleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a CDC routing rule',
  })
  @ApiParam({ name: 'ruleId', description: 'Rule ID' })
  deleteRule(
    @Headers() headers: any,
    @Param('ruleId') ruleId: string,
  ): void {
    this.validateUser(headers);

    this.rules.delete(ruleId);

    // Update consumer with remaining rules
    this.kafkaService.registerRules(Array.from(this.rules.values()));
  }

  /**
   * Example Rules
   */

  @Get('rules-examples/list')
  @ApiOperation({
    summary: 'Get example rules',
    description: 'View predefined example rules for common scenarios',
  })
  getExampleRules(@Headers() headers: any) {
    this.validateUser(headers);
    return EXAMPLE_RULES;
  }

  @Post('rules-examples/import/:exampleId')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Import an example rule',
    description: 'Create a new rule based on a predefined example',
  })
  @ApiParam({ name: 'exampleId', description: 'Example rule index (0-based)' })
  importExampleRule(
    @Headers() headers: any,
    @Param('exampleId') exampleId: string,
  ): EventRule {
    this.validateUser(headers);

    const idx = parseInt(exampleId, 10);
    if (idx < 0 || idx >= EXAMPLE_RULES.length) {
      throw new Error(`Invalid example index: ${exampleId}`);
    }

    const exampleRule = { ...EXAMPLE_RULES[idx] };
    exampleRule.id = `${exampleRule.id}-${Date.now()}`; // Make unique copy

    return this.createRule(headers, exampleRule);
  }

  /**
   * Helper: Validate user from X-User-ID header
   */
  private validateUser(headers: any): string {
    const userId = headers['x-user-id'];
    return validateUUID(userId, 'X-User-ID header');
  }
}
