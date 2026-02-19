import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import * as fs from 'fs';
import * as path from 'path';

/**
 * E2E Tests: Monitoring & Logging Infrastructure
 *
 * Validates:
 * - HTTP request/response logging
 * - Request ID generation and propagation
 * - Error logging with stack traces
 * - Performance monitoring
 * - Log file creation and format
 */

describe('Monitoring & Logging Infrastructure (E2E)', () => {
  let app: INestApplication;
  const logsDir = path.join(process.cwd(), 'logs');

  beforeAll(async () => {
    // Clean up logs before tests start
    if (fs.existsSync(logsDir)) {
      fs.rmSync(logsDir, { recursive: true, force: true });
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
    }));

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('HTTP Request Logging', () => {
    it('should log successful GET request', async () => {
      const response = await request(app.getHttpServer())
        .get('/api')
        .expect(200);

      // Should have request ID in response headers
      expect(response.headers['x-request-id']).toBeDefined();
      expect(typeof response.headers['x-request-id']).toBe('string');
    });

    it('should generate unique request IDs', async () => {
      const response1 = await request(app.getHttpServer())
        .get('/api')
        .expect(200);

      const response2 = await request(app.getHttpServer())
        .get('/api')
        .expect(200);

      const requestId1 = response1.headers['x-request-id'];
      const requestId2 = response2.headers['x-request-id'];

      expect(requestId1).not.toBe(requestId2);
      // Should look like UUID (36 chars with hyphens)
      expect(requestId1.length).toBe(36);
      expect(requestId2.length).toBe(36);
    });

    it('should include request ID in error responses', async () => {
      const response = await request(app.getHttpServer())
        .get('/nonexistent-route-12345')
        .expect(404);

      expect(response.headers['x-request-id']).toBeDefined();
    });
  });

  describe('Log File Creation', () => {
    it('should create logs directory structure', (done) => {
      setTimeout(() => {
        expect(fs.existsSync(logsDir)).toBe(true);
        expect(fs.existsSync(path.join(logsDir, 'errors'))).toBe(true);
        expect(fs.existsSync(path.join(logsDir, 'combined'))).toBe(true);
        expect(fs.existsSync(path.join(logsDir, 'performance'))).toBe(true);
        done();
      }, 500); // Wait for async file writes
    });

    it('should create daily log files', (done) => {
      setTimeout(() => {
        const combinedDir = path.join(logsDir, 'combined');
        const files = fs.readdirSync(combinedDir);
        
        // Should have at least one log file with today's date
        const hasLogFile = files.some((file) => file.includes('combined-'));
        expect(hasLogFile).toBe(true);

        // Log files should be JSON format
        const logFile = files.find((file) => file.includes('combined-'));
        if (logFile) {
          const filePath = path.join(combinedDir, logFile);
          const content = fs.readFileSync(filePath, 'utf-8');
          
          // Each line should be valid JSON
          const lines = content.trim().split('\n');
          lines.forEach((line) => {
            if (line) {
              expect(() => JSON.parse(line)).not.toThrow();
            }
          });
        }
        done();
      }, 500);
    });

    it('should log errors to separate error file', (done) => {
      // Make a request that will trigger an error
      request(app.getHttpServer())
        .post('/connectors')
        .send({ invalid: 'data' })
        .end(() => {
          setTimeout(() => {
            const errorDir = path.join(logsDir, 'errors');
            const files = fs.readdirSync(errorDir);
            
            // Should have at least one error log file
            const hasErrorFile = files.some((file) => file.includes('error-'));
            expect(hasErrorFile).toBe(true);
            done();
          }, 500);
        });
    });
  });

  describe('Log Content Format', () => {
    it('should include required fields in log entries', (done) => {
      setTimeout(() => {
        const combinedDir = path.join(logsDir, 'combined');
        const files = fs.readdirSync(combinedDir);
        const logFile = files.find((file) => file.includes('combined-'));

        if (logFile) {
          const filePath = path.join(combinedDir, logFile);
          const content = fs.readFileSync(filePath, 'utf-8');
          const lines = content.trim().split('\n');

          // Find a line with request logging
          const requestLogLine = lines.find((line) => 
            line.includes && line.includes('Request received')
          );

          if (requestLogLine) {
            const logEntry = JSON.parse(requestLogLine);

            // Check for required logging fields
            expect(logEntry).toHaveProperty('timestamp');
            expect(logEntry).toHaveProperty('service');
            expect(logEntry).toHaveProperty('environment');
            expect(logEntry.service).toBe('eyeflow-server');
          }
        }
        done();
      }, 500);
    });

    it('should include requestId in logs', (done) => {
      setTimeout(() => {
        const combinedDir = path.join(logsDir, 'combined');
        const files = fs.readdirSync(combinedDir);
        const logFile = files.find((file) => file.includes('combined-'));

        if (logFile) {
          const filePath = path.join(combinedDir, logFile);
          const content = fs.readFileSync(filePath, 'utf-8');
          const lines = content.trim().split('\n');

          // All lines should have requestId for HTTP requests
          let foundRequestIdLog = false;
          lines.forEach((line) => {
            if (line && line.includes('Request received')) {
              const logEntry = JSON.parse(line);
              if (logEntry.requestId) {
                foundRequestIdLog = true;
                expect(logEntry.requestId.length).toBe(36);
              }
            }
          });

          expect(foundRequestIdLog).toBe(true);
        }
        done();
      }, 500);
    });
  });

  describe('Performance Metrics in Logs', () => {
    it('should capture response status codes', (done) => {
      request(app.getHttpServer())
        .get('/api')
        .end(() => {
          setTimeout(() => {
            const combinedDir = path.join(logsDir, 'combined');
            const files = fs.readdirSync(combinedDir);
            const logFile = files.find((file) => file.includes('combined-'));

            if (logFile) {
              const filePath = path.join(combinedDir, logFile);
              const content = fs.readFileSync(filePath, 'utf-8');
              const lines = content.trim().split('\n');

              // Find response log with status code
              let foundStatusCode = false;
              lines.forEach((line) => {
                if (line && line.includes('Response:')) {
                  const logEntry = JSON.parse(line);
                  if (logEntry.statusCode) {
                    foundStatusCode = true;
                    expect([200, 201, 400, 401, 404, 500]).toContain(logEntry.statusCode);
                  }
                }
              });

              expect(foundStatusCode).toBe(true);
            }
            done();
          }, 500);
        });
    });

    it('should capture request duration', (done) => {
      request(app.getHttpServer())
        .get('/api')
        .end(() => {
          setTimeout(() => {
            const combinedDir = path.join(logsDir, 'combined');
            const files = fs.readdirSync(combinedDir);
            const logFile = files.find((file) => file.includes('combined-'));

            if (logFile) {
              const filePath = path.join(combinedDir, logFile);
              const content = fs.readFileSync(filePath, 'utf-8');
              const lines = content.trim().split('\n');

              // Find response log with duration
              let foundDuration = false;
              lines.forEach((line) => {
                if (line && line.includes('Response:')) {
                  const logEntry = JSON.parse(line);
                  if (logEntry.duration !== undefined) {
                    foundDuration = true;
                    expect(typeof logEntry.duration).toBe('number');
                    expect(logEntry.duration).toBeGreaterThanOrEqual(0);
                  }
                }
              });

              expect(foundDuration).toBe(true);
            }
            done();
          }, 500);
        });
    });
  });

  describe('Error Logging', () => {
    it('should log validation errors', (done) => {
      request(app.getHttpServer())
        .post('/connectors')
        .send({}) // Send empty body to trigger validation
        .end(() => {
          setTimeout(() => {
            const errorDir = path.join(logsDir, 'errors');
            if (fs.existsSync(errorDir)) {
              const files = fs.readdirSync(errorDir);
              let foundErrorLog = false;

              files.forEach((file) => {
                if (file.includes('error-')) {
                  const filePath = path.join(errorDir, file);
                  const content = fs.readFileSync(filePath, 'utf-8');
                  if (content.includes('Error occurred')) {
                    foundErrorLog = true;
                  }
                }
              });

              expect(foundErrorLog).toBe(true);
            }
            done();
          }, 500);
        });
    });
  });

  describe('Monitoring Health', () => {
    it('should have all required log files after operations', (done) => {
      setTimeout(() => {
        // Should have at least: combined logs
        const combinedDir = path.join(logsDir, 'combined');
        expect(fs.existsSync(combinedDir)).toBe(true);
        
        const files = fs.readdirSync(combinedDir);
        expect(files.length).toBeGreaterThan(0);
        done();
      }, 500);
    });

    it('should not have corrupted log files', (done) => {
      setTimeout(() => {
        const combinedDir = path.join(logsDir, 'combined');
        const files = fs.readdirSync(combinedDir);

        files.forEach((file) => {
          const filePath = path.join(combinedDir, file);
          const content = fs.readFileSync(filePath, 'utf-8');
          const lines = content.trim().split('\n');

          // Verify each line is valid JSON
          lines.forEach((line, index) => {
            if (line) {
              expect(() => JSON.parse(line)).not.toThrow(
                `Invalid JSON at line ${index} in ${file}`,
              );
            }
          });
        });

        done();
      }, 500);
    });
  });
});
