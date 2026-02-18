import * as dotenv from 'dotenv';
import * as path from 'path';

// Set test environment explicitly BEFORE loading env file
process.env.NODE_ENV = 'test';
process.env.KAFKA_ENABLED = 'false';

// Load test environment variables
const envFilePath = path.resolve(__dirname, '..', '.env.test');
console.log(`Loading test environment from: ${envFilePath}`);
dotenv.config({ path: envFilePath });

// Suppress Kafka logs during tests
if (!process.env.LOG_LEVEL || process.env.LOG_LEVEL === 'info') {
  process.env.LOG_LEVEL = 'error';
}

console.log(`✓ Test environment configured: NODE_ENV=${process.env.NODE_ENV}, KAFKA_ENABLED=${process.env.KAFKA_ENABLED}`);
