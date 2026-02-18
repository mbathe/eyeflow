import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AgentsModule } from './agents/agents.module';
import { ActionsModule } from './actions/actions.module';
import { JobsModule } from './jobs/jobs.module';
import { ConnectorsModule } from './connectors/connectors.module';
import { LlmConfigModule } from './llm-config/llm-config.module';
import { KafkaModule } from './kafka/kafka.module';
import { TasksModule } from './tasks/tasks.module';

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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
