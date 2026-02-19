/**
 * DEPRECATED: Frontend Module
 * 
 * NestJS module for Layer 2: Compiler Frontend
 * NOT USED in Option 1 - Natural language parsing is handled at Planning layer
 * 
 * This module kept for reference/historical purposes only.
 * 
 * Previous Exports:
 * - FrontendOrchestratorService: Main entry point
 * - NLParserService: Natural language parser
 * - TypeInferencerService: Type checking
 * - ConstraintValidatorService: Constraint validation
 * 
 * @file src/compiler/frontend/frontend.module.ts
 */

import { Module } from '@nestjs/common';
import { FrontendOrchestratorService } from './frontend-orchestrator.service';
import { NLParserService } from './services/nl-parser.service';
import { TypeInferencerService } from './services/type-inferencer.service';
import { ConstraintValidatorService } from './services/constraint-validator.service';
import { ExtensibilityModule } from '../../common/extensibility/extensibility.module';
import { CacheModule } from '../../common/cache/cache.module';

@Module({
  imports: [
    // Layer 1: Extensibility (for component registry access)
    ExtensibilityModule,
    // Caching layer
    CacheModule,
  ],
  providers: [
    {
      provide: 'LOGGER',
      useValue: {
        debug: (msg: string, meta?: Record<string, unknown>) => console.debug(msg, meta),
        info: (msg: string, meta?: Record<string, unknown>) => console.info(msg, meta),
        warn: (msg: string, meta?: Record<string, unknown>) => console.warn(msg, meta),
        error: (msg: string, meta?: Record<string, unknown>) => console.error(msg, meta),
        child: () => ({
          debug: (msg: string, meta?: Record<string, unknown>) => console.debug(msg, meta),
          info: (msg: string, meta?: Record<string, unknown>) => console.info(msg, meta),
          warn: (msg: string, meta?: Record<string, unknown>) => console.warn(msg, meta),
          error: (msg: string, meta?: Record<string, unknown>) => console.error(msg, meta),
        }),
      },
    },
    FrontendOrchestratorService,
    NLParserService,
    TypeInferencerService,
    ConstraintValidatorService,
  ],
  exports: [
    FrontendOrchestratorService,
    NLParserService,
    TypeInferencerService,
    ConstraintValidatorService,
  ],
})
export class FrontendModule {}
