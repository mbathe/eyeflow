import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WinstonModule } from 'nest-winston';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AgentsModule } from './agents/agents.module';
import { ActionsModule } from './actions/actions.module';
import { JobsModule } from './jobs/jobs.module';
import { ConnectorsModule } from './connectors/connectors.module';
import { LlmConfigModule } from './llm-config/llm-config.module';
import { KafkaModule } from './kafka/kafka.module';
import { TasksModule } from './tasks/tasks.module';
import { createNestWinstonConfig, logger } from './common/services/logger.service';
import { RedisCacheService } from './common/services/redis-cache.service';
import { ExtensibilityModule } from './common/extensibility';
// DEPRECATED: FrontendModule not needed for Option 1 (Planning→Compilation→Execution)
// NL parsing is handled at Planning layer (Python LLM Service)
// import { FrontendModule } from './compiler/frontend';
import { CompilerModule } from './compiler/compiler.module';
import { RuntimeModule } from './runtime/runtime.module';

// Determine which .env file to load based on environment
const getEnvFile = () => {
  const nodeEnv = process.env.NODE_ENV || 'development';
  if (nodeEnv === 'test') {
    return '.env.test';
  }
  if (nodeEnv === 'production') {
    return '.env.production';
  }
  return '.env';
};

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: getEnvFile(),
    }),
    ...(process.env.NODE_ENV === 'test' 
      ? [] 
      : [TypeOrmModule.forRootAsync({
          inject: [ConfigService],
          useFactory: (configService: ConfigService) => ({
            type: 'postgres',
            host: configService.get('DATABASE_HOST', 'localhost'),
            port: configService.get<number>('DATABASE_PORT', 5432),
            username: configService.get('DATABASE_USER', 'postgres'),
            password: configService.get('DATABASE_PASSWORD', 'postgres'),
            database: configService.get('DATABASE_NAME', 'eyeflow'),
            entities: [
              'dist/**/*.entity{.ts,.js}',
            ],
            synchronize: configService.get('DATABASE_SYNCHRONIZE') === 'true',
            logging: configService.get('DATABASE_LOGGING') === 'true',
            dropSchema: false,
          }),
        })]),
    AgentsModule,
    ActionsModule,
    JobsModule,
    ConnectorsModule,
    LlmConfigModule,
    KafkaModule,
    TasksModule,
    ExtensibilityModule,
    // FrontendModule (DEPRECATED - see above),
    CompilerModule,
    RuntimeModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    RedisCacheService,
    // Provide a shared LOGGER token across the app so modules that inject 'LOGGER' receive the Winston logger
    {
      provide: 'LOGGER',
      useValue: logger,
    },
  ],
})
export class AppModule {}
