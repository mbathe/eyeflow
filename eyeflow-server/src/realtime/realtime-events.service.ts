import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';

/**
 * Thin internal event bus (Node.js EventEmitter as a NestJS singleton).
 * Allows services in any module to emit realtime events without circular deps.
 *
 * Events:
 *   "suggestion.created"   (suggestion: SuggestionEntity)
 *   "suggestion.decided"   ({ id, status })
 *   "event.new"            ({ id, severity, message, connectorId, timestamp })
 *   "health.update"        ({ status, services })
 */
@Injectable()
export class RealtimeEventsService extends EventEmitter {
  constructor() {
    super();
    // Silence max-listener warnings for large deployments
    this.setMaxListeners(50);
  }
}
