import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LlmConfigController } from './llm-config.controller';
import { LlmConfigService } from './llm-config.service';
import { LlmConfigEntity } from './llm-config.entity';

@Module({
  imports: [TypeOrmModule.forFeature([LlmConfigEntity])],
  controllers: [LlmConfigController],
  providers: [LlmConfigService],
  exports: [LlmConfigService],
})
export class LlmConfigModule {}
