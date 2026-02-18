import { Module } from '@nestjs/common';
import { AnalyticsProvider } from './analytics.provider';

/**
 * Analytics Module
 * Provides analytics capabilities to the LLM context system
 * Automatically registers with LLMContextProviderRegistry on import
 */
@Module({
  providers: [AnalyticsProvider],
  exports: [AnalyticsProvider],
})
export class AnalyticsModule {}
