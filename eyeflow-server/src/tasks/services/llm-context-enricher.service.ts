/**
 * LLM CONTEXT ENRICHER SERVICE
 * 
 * Enriches the LLM context with:
 * 1. Available schemas and their contents (for cross-document validation rules)
 * 2. Example complex rules (validation, conditional actions, chaining)
 * 3. Available aggregation/validation functions
 * 4. Best practices for powerful rule generation
 * 
 * Use case example:
 *   User: "Alert on Slack if a document added to folder respects a schema stored in another doc"
 *   LLM needs to know:
 *   - What schemas exist (list + contents)
 *   - How to create SERVICE_CALL conditions (fetch schema, validate against it)
 *   - How to chain actions (validate → then → send to Slack)
 */

import { Injectable, Logger } from '@nestjs/common';
import { LLMContextEnhancedService } from './llm-context-enhanced.service';
import { EnrichedLLMContext } from './llm-context-enhanced.service';

export interface Document {
  id: string;
  name: string;
  type: 'SCHEMA' | 'CONFIG' | 'DATA' | 'TEMPLATE';
  description?: string;
  content?: any; // The actual schema/config
  contentPreview?: string; // Text preview for LLM
}

export interface ContextEnrichedLLMForComplexRules extends EnrichedLLMContext {
  // 🔷 NEW: Available schemas and documents for cross-document rules
  availableDocuments: Document[];

  // 🔷 NEW: Complex example rules showing powerful capabilities
  advancedExampleRules: AdvancedRuleExample[];

  // 🔷 NEW: Aggregation/validation services available
  validationServices: ValidationService[];

  // 🔷 NEW: Best practices for composing powerful rules
  compositionPatterns: CompositionPattern[];
}

export interface AdvancedRuleExample {
  name: string;
  description: string;
  useCase: string;
  complexity: 'medium' | 'advanced' | 'expert';

  // The rule structure showing composition
  rule: {
    trigger: {
      type: string;
      source: string;
      description: string;
    };

    // ✨ Complex composition: condition can be SERVICE_CALL that validates
    condition: {
      type: 'SERVICE_CALL' | 'DATABASE_QUERY' | 'COMPOSITE';
      details: string;
      example: any;
    };

    // ✨ Complex composition: actions chained/conditional
    actions: {
      type: 'CHAINED' | 'CONDITIONAL' | 'PARALLEL';
      steps: Array<{
        action: string;
        description: string;
        example: any;
      }>;
    };
  };

  // French explanation for better LLM understanding
  explicationFrancaise: string;
}

export interface ValidationService {
  name: string;
  description: string;
  endpoint: string; // Where to call it
  capability: 'SCHEMA_VALIDATION' | 'COMPLIANCE_CHECK' | 'DATA_TRANSFORM' | 'ML_ANALYSIS';
  acceptedSchemas: string[]; // What schemas it can validate
  example: {
    input: any;
    output: any;
  };
}

export interface CompositionPattern {
  name: string;
  description: string;
  pattern: string; // Human readable pattern
  example: {
    userRequest: string;
    translatedRule: any;
  };
}

@Injectable()
export class LLMContextEnricherService {
  private readonly logger = new Logger(LLMContextEnricherService.name);

  constructor(private llmContextEnhanced: LLMContextEnhancedService) {}

  /**
   * 🔷 Enrich context with documents and complex examples
   * 
   * This should be called before sending context to the LLM for rule generation
   */
  async enrichContextForComplexRuleGeneration(
    baseContext: EnrichedLLMContext,
    userId: string,
    requestContext?: {
      availableDocuments?: Document[];
      userHint?: string; // e.g., "I need cross-document validation"
    },
  ): Promise<ContextEnrichedLLMForComplexRules> {
    this.logger.log(`🔷 Enriching context for complex rule generation (user: ${userId})`);

    return {
      // Preserve all base context
      ...baseContext,

      // 🔷 Add: Available documents (schemas, configs, etc)
      availableDocuments: requestContext?.availableDocuments || this.getMockAvailableDocuments(),

      // 🔷 Add: Advanced example rules showing complex compositions
      advancedExampleRules: this.getAdvancedExampleRules(),

      // 🔷 Add: Validation services available for SERVICE_CALL conditions
      validationServices: this.getAvailableValidationServices(),

      // 🔷 Add: Common patterns for composing powerful rules
      compositionPatterns: this.getCompositionPatterns(),
    };
  }

  /**
   * Mock documents (in real system, fetch from DocumentService)
   * This shows the LLM what schemas exist
   */
  private getMockAvailableDocuments(): Document[] {
    return [
      {
        id: 'schema-customer-validation',
        name: 'Customer Validation Schema',
        type: 'SCHEMA',
        description: 'JSON schema for validating customer documents',
        contentPreview: `{
  "type": "object",
  "properties": {
    "customerId": { "type": "string", "pattern": "^CUST-[0-9]{6}$" },
    "email": { "type": "string", "format": "email" },
    "complianceLevel": { "enum": ["LOW", "MEDIUM", "HIGH"] },
    "lastAudit": { "type": "string", "format": "date-time" }
  },
  "required": ["customerId", "email"]
}`,
      },
      {
        id: 'schema-invoice-validation',
        name: 'Invoice Submission Schema',
        type: 'SCHEMA',
        description: 'Schema for invoice documents in the billing system',
        contentPreview: `{
  "type": "object",
  "properties": {
    "invoiceNumber": { "type": "string", "pattern": "^INV-[0-9]{8}$" },
    "amount": { "type": "number", "minimum": 0 },
    "vendor": { "type": "string" },
    "approvalStatus": { "enum": ["PENDING", "APPROVED", "REJECTED"] }
  },
  "required": ["invoiceNumber", "amount", "vendor"]
}`,
      },
      {
        id: 'config-compliance-rules',
        name: 'Compliance Rules Configuration',
        type: 'CONFIG',
        description: 'Organization-wide compliance thresholds and rules',
        contentPreview: `{
  "maxInvoiceAmount": 50000,
  "requiresAuditAbove": 100000,
  "complianceLevels": {
    "HIGH": { "approvalWaitTimeMs": 3600000 },
    "MEDIUM": { "approvalWaitTimeMs": 86400000 }
  },
  "allowedVendors": ["VENDOR-001", "VENDOR-002"]
}`,
      },
    ];
  }

  /**
   * Advanced example rules showing complex compositions
   * These teach the LLM about CHAINED, CONDITIONAL, SERVICE_CALL patterns
   */
  private getAdvancedExampleRules(): AdvancedRuleExample[] {
    return [
      {
        name: 'Cross-Document Schema Validation with Alert',
        description: 'Validate a document against a schema stored in another document, then alert if invalid',
        useCase: 'Compliance: Ensure all uploaded invoices match business rules before processing',
        complexity: 'advanced',
        rule: {
          trigger: {
            type: 'ON_CREATE',
            source: 'file_storage',
            description: 'When a new document is added to the "invoices" folder',
          },
          condition: {
            type: 'SERVICE_CALL',
            details: 'Call validation service to check document against schema from doc:schema-invoice-validation',
            example: {
              serviceType: 'SCHEMA_VALIDATION',
              documentToValidate: '$event.documentId',
              schemaReference: 'doc:schema-invoice-validation',
              validationRules: {
                checkAmountRange: true,
                checkVendorInAllowedList: true,
              },
            },
          },
          actions: {
            type: 'CONDITIONAL',
            steps: [
              {
                action: 'IF validation.isValid',
                description: 'If validation passed',
                example: {
                  type: 'UPDATE_DOCUMENT',
                  setField: 'approvalStatus',
                  setValue: 'APPROVED',
                },
              },
              {
                action: 'ELSE',
                description: 'If validation failed, alert team',
                example: {
                  type: 'CHAINED',
                  actions: [
                    {
                      connector: 'slack',
                      function: 'send_message',
                      params: {
                        channel: '#compliance-alerts',
                        message: 'Document $event.documentId failed validation',
                        details: '$result.validationErrors',
                      },
                    },
                    {
                      connector: 'email',
                      function: 'send_email',
                      params: {
                        to: 'compliance@company.com',
                        subject: 'Invoice validation failed',
                        body: '$result.validationReport',
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
        explicationFrancaise: `
Quand un nouveau document est ajouté dans un dossier:
1. Appeler un service pour valider le document contre un schéma (stocké dans un autre document)
2. Si valide: mettre à jour le statut du document
3. Si invalide: envoyer une alerte sur Slack + email au team de conformité
        `,
      },

      {
        name: 'Multi-Step Data Transformation Pipeline',
        description: 'Fetch data from multiple sources, transform it, validate it, and post results',
        useCase: 'Analytics: Combine metrics from multiple systems and alert if patterns detected',
        complexity: 'expert',
        rule: {
          trigger: {
            type: 'ON_SCHEDULE',
            source: 'scheduler',
            description: 'Every 5 minutes',
          },
          condition: {
            type: 'DATABASE_QUERY',
            details: 'Check if there are new events to process',
            example: {
              database: 'metrics_db',
              query: 'SELECT COUNT(*) FROM events WHERE processed=false LIMIT 100',
              operator: 'GT',
              threshold: 10,
            },
          },
          actions: {
            type: 'CHAINED',
            steps: [
              {
                action: 'FETCH_DATA',
                description: 'Fetch events from database',
                example: {
                  connector: 'postgresql',
                  function: 'query',
                  params: { query: 'SELECT * FROM events WHERE processed=false' },
                },
              },
              {
                action: 'TRANSFORM',
                description: 'Transform data using LLM analysis',
                example: {
                  type: 'LLM_ANALYSIS',
                  content: '$step1.result',
                  prompt: 'Analyze sentiment and classify as positive/negative/neutral',
                },
              },
              {
                action: 'SEND_RESULTS',
                description: 'Send classification results to Slack',
                example: {
                  connector: 'slack',
                  function: 'send_structured_message',
                  params: {
                    channel: '#analytics',
                    blocks: [
                      { type: 'section', text: 'Analysis Results' },
                      { type: 'section', text: 'Positive sentiment: $step2.result.positiveCount' },
                    ],
                  },
                },
              },
            ],
          },
        },
        explicationFrancaise: `
Créer un pipeline d'analyse automatisée:
1. Récupérer des données depuis plusieurs sources
2. Appliquer une transformation/analyse (exemple: sentiment LLM)
3. Envoyer les résultats sur Slack pour action manuelle
        `,
      },
    ];
  }

  /**
   * Validation services available for SERVICE_CALL conditions
   */
  private getAvailableValidationServices(): ValidationService[] {
    return [
      {
        name: 'Schema Validator',
        description: 'Validates documents against JSON schemas',
        endpoint: 'POST /validation/schema-check',
        capability: 'SCHEMA_VALIDATION',
        acceptedSchemas: ['schema-customer-validation', 'schema-invoice-validation'],
        example: {
          input: {
            documentId: 'doc-123',
            schemaId: 'schema-invoice-validation',
          },
          output: {
            isValid: true,
            errors: [],
            warnings: [],
          },
        },
      },
      {
        name: 'Compliance Checker',
        description: 'Checks documents against compliance rules and thresholds',
        endpoint: 'POST /validation/compliance-check',
        capability: 'COMPLIANCE_CHECK',
        acceptedSchemas: ['all'],
        example: {
          input: {
            documentId: 'doc-456',
            complianceLevel: 'HIGH',
          },
          output: {
            isCompliant: true,
            violations: [],
            recommendations: [],
          },
        },
      },
    ];
  }

  /**
   * Common composition patterns to guide LLM
   */
  private getCompositionPatterns(): CompositionPattern[] {
    return [
      {
        name: 'Validate Against External Schema',
        description: 'Document added → Fetch schema from reference document → Validate → Alert if fail',
        pattern: 'TRIGGER(document_added) → CONDITION(SERVICE_CALL validate against doc:XYZ) → ACTION(IF valid: update status, ELSE: alert)',
        example: {
          userRequest: 'Alert on Slack if invoice does not match our validation schema',
          translatedRule: {
            trigger: { type: 'ON_CREATE', source: 'file_storage', filter: { folder: 'invoices' } },
            condition: {
              type: 'SERVICE_CALL',
              service: 'schema_validator',
              params: {
                documentId: '$event.id',
                schemaRef: 'doc:schema-invoice-validation',
              },
              expectedResult: { field: 'isValid', operator: 'EQ', value: false }, // Alert if INVALID
            },
            actions: [
              {
                type: 'CHAINED',
                steps: [
                  {
                    connector: 'slack',
                    function: 'send_message',
                    params: {
                      channel: '#alerts',
                      message: 'Invoice $event.name failed validation',
                      details: '$result.validationErrors',
                    },
                  },
                ],
              },
            ],
          },
        },
      },

      {
        name: 'Multi-Step Alert Pipeline',
        description: 'Multiple conditions checked in sequence, actions triggered if all pass/fail',
        pattern: 'TRIGGER → CONDITION(check1 AND check2 AND check3) → ACTION(alert + escalate)',
        example: {
          userRequest: 'When memory < 15% AND database responses slow AND on critical server, page on-call and alert team',
          translatedRule: {
            trigger: { type: 'ON_SCHEDULE', interval: '1m' },
            condition: {
              type: 'COMPOSITE',
              operator: 'AND',
              checks: [
                { field: 'system.memory.free_percent', operator: 'LT', value: 15 },
                { field: 'db.query_latency_ms', operator: 'GT', value: 5000 },
                { field: 'server.role', operator: 'EQ', value: 'CRITICAL' },
              ],
            },
            actions: [
              {
                type: 'PARALLEL',
                actions: [
                  {
                    connector: 'pagerduty',
                    function: 'page_oncall',
                    params: { severity: 'CRITICAL' },
                  },
                  {
                    connector: 'slack',
                    function: 'send_message',
                    params: { channel: '#incidents' },
                  },
                ],
              },
            ],
          },
        },
      },
    ];
  }
}
