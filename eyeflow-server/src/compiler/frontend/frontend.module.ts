/**
 * Frontend Module
 * NestJS module for Layer 2: Compiler Frontend
 * 
 * Exports:
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
