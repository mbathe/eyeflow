import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SuggestionEntity } from './suggestion.entity';
import { SuggestionEngineConfigEntity } from './suggestion-engine-config.entity';
import { SuggestionWatchEntity } from './suggestion-watch.entity';
import { SuggestionsService } from './suggestions.service';
import { SuggestionsController } from './suggestions.controller';
import { SuggestionEngineService } from './suggestion-engine.service';
import { SuggestionEngineController } from './suggestion-engine.controller';
import { SuggestionWatchService } from './suggestion-watch.service';
import { SuggestionWatchController } from './suggestion-watch.controller';
import { RealtimeModule } from '../realtime/realtime.module';
import { LlmConfigModule } from '../llm-config/llm-config.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SuggestionEntity, SuggestionEngineConfigEntity, SuggestionWatchEntity]),
    RealtimeModule,
    LlmConfigModule,
  ],
  controllers: [SuggestionsController, SuggestionEngineController, SuggestionWatchController],
  providers: [SuggestionsService, SuggestionEngineService, SuggestionWatchService],
  exports: [SuggestionsService, SuggestionEngineService, SuggestionWatchService],
})
export class SuggestionsModule {}
