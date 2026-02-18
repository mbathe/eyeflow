import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';

/**
 * Helper for creating a test application module
 * Configures the application for testing with appropriate settings
 */
export async function createTestApplication(): Promise<TestingModule> {
  // Ensure test environment is set before module initialization
  process.env.NODE_ENV = 'test';
  process.env.KAFKA_ENABLED = 'false';
  process.env.DATABASE_SYNCHRONIZE = 'true';

  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  return moduleFixture;
}
