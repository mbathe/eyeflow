import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { AppModule } from './app.module';
import { QueryExceptionFilter } from './common/query-exception.filter';
import { HttpLoggingInterceptor } from './common/services/http-logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Use Winston as global logger
  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

  // Enable CORS
  app.enableCors();

  // Register global exception filters
  app.useGlobalFilters(new QueryExceptionFilter());

  // Register global HTTP logging interceptor
  app.useGlobalInterceptors(new HttpLoggingInterceptor());
  
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
  }));

  // Swagger Configuration
  const config = new DocumentBuilder()
    .setTitle('eyeflow API')
    .setDescription('Proactive Agentic OS for Enterprise Automation - Phase 1 API Documentation')
    .setVersion('1.0.0')
    .addTag('Connectors', 'Manage 15+ connector types (databases, IoT, communication, files)')
    .addTag('LLM Config', 'Configure local (Ollama) or cloud LLM providers (OpenAI, Anthropic)')
    .addTag('Agents', 'Register and manage intelligent agents')
    .addTag('Actions', 'Define automated actions')
    .addTag('Jobs', 'Orchestrate and monitor workflow jobs')
    .addServer('http://localhost:3000', 'Local development')
    .addServer('http://0.0.0.0:3000', 'Server')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('swagger', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      displayOperationId: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
    customSiteTitle: 'eyeflow API Documentation',
  });

  const port = process.env.PORT || 3000;
  const host = process.env.HOST || '0.0.0.0';

  await app.listen(port, host, () => {
    console.log(`
╔════════════════════════════════════════════════╗
║   🚀 EyeFlow Server (Nest.js)                  ║
║   Version: 1.0.0                               ║
║   Environment: ${process.env.NODE_ENV || 'development'}                    ║
╚════════════════════════════════════════════════╝

📍 Server running: http://${host}:${port}
🔌 WebSocket: ws://${host}:${port}

📋 API Documentation:
   📖 Swagger UI: http://localhost:${port}/swagger
   📄 OpenAPI JSON: http://localhost:${port}/swagger-json

📋 Available endpoints:
   GET  /health              - Server health
   GET  /api                 - API info
   POST /agents/register     - Register agent
   GET  /agents              - List agents
   POST /actions             - Create action
   GET  /jobs                - List jobs
   GET  /connectors          - List connectors
   POST /connectors          - Create connector
   POST /llm-config          - Create LLM config
   GET  /llm-config          - List LLM configs

⏸  Press CTRL+C to stop
    `);
  });
}

bootstrap().catch(err => {
  console.error('❌ Failed to start server:', err);
  process.exit(1);
});
