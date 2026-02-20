import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';

describe('JWT Config (env)', () => {
  it('should load JWT_SECRET from .env.test via ConfigModule', async () => {
    process.env.NODE_ENV = 'test';

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env.test' })],
      providers: [ConfigService],
    }).compile();

    const config = moduleRef.get<ConfigService>(ConfigService);
    const jwtSecret = config.get<string>('JWT_SECRET');

    expect(jwtSecret).toBeDefined();
    expect(typeof jwtSecret).toBe('string');
    expect(jwtSecret!.length).toBeGreaterThan(0);
  });
});
