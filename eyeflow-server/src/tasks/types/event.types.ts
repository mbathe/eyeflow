/**
 * StandardEvent - Universal event format
 * All events from any source are normalized to this format
 */

export interface StandardEvent {
  // ==========================================
  // IDENTIFICATION
  // ==========================================
  id: string;                              // UUID for this event
  sourceConnectorId: string;               // Which connector generated this
  sourceConnectorType: string;             // Type (POSTGRESQL, KAFKA, SENSOR_*, etc)

  // ==========================================
  // TIMING
  // ==========================================
  timestamp: Date;                         // When event occurred
  receivedAt: Date;                        // When server received it
  normalizedAt: Date;                      // When it was normalized

  // ==========================================
  // DATA
  // ==========================================
  data: Record<string, any>;               // Actual event payload
  
  // ==========================================
  // CONTEXT
  // ==========================================
  userId: string;                          // Multi-tenant isolation
  correlationId?: string;                  // Link related events
  
  // ==========================================
  // METADATA
  // ==========================================
  source: string;                          // Human-readable source
  eventType: string;                       // "INSERT", "UPDATE", "ALERT", "METRIC", etc
  severity?: 'info' | 'warning' | 'error' | 'critical';
}

/**
 * Example StandardEvents from different sources:
 * 
 * From PostgreSQL (CDC):
 * {
 *   id: "evt-abc123",
 *   sourceConnectorId: "conn-postgres-1",
 *   sourceConnectorType: "POSTGRESQL",
 *   timestamp: 2026-02-18T14:32:00Z,
 *   receivedAt: 2026-02-18T14:32:01Z,
 *   normalizedAt: 2026-02-18T14:32:02Z,
 *   data: {
 *     table: "products",
 *     operation: "INSERT",
 *     record: { id: 123, sku: "ABC", price: 99.99 }
 *   },
 *   userId: "user-xyz",
 *   source: "PostgreSQL",
 *   eventType: "INSERT"
 * }
 * 
 * From Heart Rate Sensor:
 * {
 *   id: "evt-def456",
 *   sourceConnectorId: "sensor-hr-1",
 *   sourceConnectorType: "SENSOR_HEART_RATE",
 *   timestamp: 2026-02-18T14:32:05Z,
 *   receivedAt: 2026-02-18T14:32:06Z,
 *   normalizedAt: 2026-02-18T14:32:07Z,
 *   data: {
 *     patient_id: "ICU-001",
 *     bpm: 125,
 *     quality: 0.95,
 *     waveform: [...raw data...]
 *   },
 *   userId: "doctor-123",
 *   source: "Heart Rate Monitor",
 *   eventType: "METRIC",
 *   severity: "warning"
 * }
 * 
 * From Webhook:
 * {
 *   id: "evt-ghi789",
 *   sourceConnectorId: "webhook-slack",
 *   sourceConnectorType: "WEBHOOK",
 *   timestamp: 2026-02-18T14:32:10Z,
 *   receivedAt: 2026-02-18T14:32:10Z,
 *   normalizedAt: 2026-02-18T14:32:11Z,
 *   data: {
 *     channel: "#alerts",
 *     user: "bot",
 *     text: "Production error: OutOfMemory"
 *   },
 *   userId: "team-ops",
 *   source: "Slack",
 *   eventType: "ALERT",
 *   severity: "critical"
 * }
 */
