import { Injectable, Logger } from '@nestjs/common';
import { CDCEvent, AgentMission, EventRule, KafkaEventType, CDCSource } from './kafka-events.types';
import { v4 as uuidv4 } from 'uuid';

/**
 * CDC Event Processor Service
 * Transforms raw database change events into actionable agent missions
 *
 * Handles:
 * - Event validation and normalization
 * - Rule matching and routing
 * - Mission creation from events
 * - Event deduplication
 */
@Injectable()
export class CDCEventProcessorService {
  private readonly logger = new Logger(CDCEventProcessorService.name);
  private eventCache = new Map<string, CDCEvent>(); // Deduplication cache

  /**
   * Process a raw CDC event from Debezium
   * Returns null if event is filtered/duplicate, otherwise returns agent mission
   */
  async processEvent(
    rawEvent: any,
    rules: EventRule[],
  ): Promise<AgentMission | null> {
    try {
      // 1. Normalize Debezium format to CDCEvent
      const cdcEvent = this.normalizeDebeziumEvent(rawEvent);

      // 2. Deduplicate (Kafka guarantees at-least-once, so we need to handle duplicates)
      if (this.isDuplicate(cdcEvent)) {
        this.logger.debug(`Duplicate event ignored: ${cdcEvent.eventId}`);
        return null;
      }

      // 3. Match against rules
      const applicableRules = this.findMatchingRules(cdcEvent, rules);

      if (applicableRules.length === 0) {
        this.logger.debug(
          `Event ${cdcEvent.eventId} matched no rules - ignored`,
        );
        return null;
      }

      // 4. Create agent mission from matching rule
      const rule = applicableRules[0]; // Use first matching rule for now
      const mission = this.createMissionFromEvent(cdcEvent, rule);

      // 5. Cache event for deduplication
      this.cacheEvent(cdcEvent);

      return mission;
    } catch (error) {
      this.logger.error(`Error processing CDC event: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * Normalize Debezium event format to standardized CDCEvent
   * Debezium sends events in Avro or JSON format
   */
  private normalizeDebeziumEvent(rawEvent: any): CDCEvent {
    const payload = rawEvent.payload || rawEvent;

    return {
      eventId: uuidv4(),
      eventType: this.mapOperationToEventType(payload.op),
      timestamp: payload.ts_ms || Date.now(),
      source: {
        db: this.mapConnectorToSource(payload.source?.name),
        table: payload.source?.table,
        schema: payload.source?.schema,
        connector: payload.source?.connector,
      },
      before: payload.before,
      after: payload.after,
      operation: payload.op as 'I' | 'U' | 'D',
      transactionId: payload.txId,
      logOffset: payload.lsn,
      sequenceNumber: payload.sequence,
    };
  }

  /**
   * Map Debezium operation code to event type
   */
  private mapOperationToEventType(op: string): KafkaEventType {
    const mapping: Record<string, KafkaEventType> = {
      I: KafkaEventType.DB_INSERT,
      U: KafkaEventType.DB_UPDATE,
      D: KafkaEventType.DB_DELETE,
      c: KafkaEventType.ALERT, // Create snapshot
      r: KafkaEventType.ALERT, // Read snapshot
    };
    return mapping[op] || KafkaEventType.ALERT;
  }

  /**
   * Map Debezium connector name to CDCSource
   */
  private mapConnectorToSource(connectorName: string | undefined): CDCSource {
    const mapping: Record<string, string> = {
      postgres: 'PostgreSQL',
      mysql: 'MySQL',
      mongodb: 'MongoDB',
      sqlserver: 'SQL Server',
      oracle: 'Oracle',
    };
    const mapped = mapping[connectorName?.toLowerCase() || ''] || connectorName || 'PostgreSQL';
    return mapped as CDCSource;
  }

  /**
   * Check if event is a duplicate (Kafka at-least-once delivery)
   * Using event ID + source timestamp for deduplication
   */
  private isDuplicate(event: CDCEvent): boolean {
    const key = `${event.source.table}-${event.transactionId}-${event.logOffset}`;
    return this.eventCache.has(key);
  }

  /**
   * Cache event for deduplication tracking (with TTL)
   */
  private cacheEvent(event: CDCEvent, ttlMs: number = 3600000): void {
    const key = `${event.source.table}-${event.transactionId}-${event.logOffset}`;
    this.eventCache.set(key, event);

    // Auto-expire after TTL
    setTimeout(() => this.eventCache.delete(key), ttlMs);
  }

  /**
   * Find all rules that match the event
   */
  private findMatchingRules(event: CDCEvent, rules: EventRule[]): EventRule[] {
    return rules.filter((rule) => {
      // Check if rule is enabled
      if (!rule.enabled) return false;

      // Check source matches
      if (rule.trigger.source !== event.source.db) return false;
      if (rule.trigger.table !== event.source.table) return false;
      if (rule.trigger.schema && rule.trigger.schema !== event.source.schema)
        return false;

      // Check operation matches
      if (!rule.trigger.operations.includes(event.operation)) return false;

      // Check custom condition
      if (rule.trigger.condition && !rule.trigger.condition(event))
        return false;

      return true;
    });
  }

  /**
   * Create an agent mission from CDC event and matching rule
   */
  private createMissionFromEvent(
    event: CDCEvent,
    rule: EventRule,
  ): AgentMission {
    return {
      id: uuidv4(),
      priority: rule.action.priority,
      source: event,
      actionType: rule.action.type,
      context: {
        rule_id: rule.id,
        rule_name: rule.name,
        table: event.source.table,
        schema: event.source.schema,
        before: event.before,
        after: event.after,
        ...rule.action.params,
      },
      targetConnector: rule.action.targetConnector,
      deadline: this.calculateDeadline(rule.action.priority),
      status: 'pending',
      createdAt: new Date(),
    };
  }

  /**
   * Calculate deadline based on mission priority
   */
  private calculateDeadline(priority: string): Date {
    const now = Date.now();
    const deadlines: Record<string, number> = {
      critical: now + 5 * 60 * 1000, // 5 minutes
      high: now + 30 * 60 * 1000, // 30 minutes
      normal: now + 2 * 60 * 60 * 1000, // 2 hours
      low: now + 24 * 60 * 60 * 1000, // 24 hours
    };
    return new Date(deadlines[priority] || deadlines.normal);
  }

  /**
   * Get event cache stats (for monitoring)
   */
  getStats() {
    return {
      cachedEvents: this.eventCache.size,
      cacheSize: `${(this.eventCache.size * 50) / 1024} KB`, // Approximate
    };
  }

  /**
   * Clear cache (useful for testing)
   */
  clearCache(): void {
    this.eventCache.clear();
    this.logger.log('Event cache cleared');
  }
}
