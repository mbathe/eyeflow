import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UserEntity } from './entities/user.entity';
import { RevokedTokenEntity } from './entities/revoked-token.entity';
import { EmailService } from './services/email.service';
import { TokenCleanupService } from './services/token-cleanup.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

const isTest = process.env.NODE_ENV === 'test';

@Global()
@Module({
  imports: [
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET', 'test-secret'),
        signOptions: {
          expiresIn: config.get<string>('JWT_EXPIRATION', '15m') as any,
        },
      }),
    }),
    TypeOrmModule.forFeature([UserEntity, RevokedTokenEntity]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    EmailService,
    ...(isTest ? [] : [
      TokenCleanupService,
      JwtStrategy,
      JwtRefreshStrategy,
      GoogleStrategy,
      {
        provide: APP_GUARD,
        useClass: JwtAuthGuard,
      },
    ]),
  ],
  exports: [AuthService, EmailService, JwtModule],
})
export class AuthModule {}

