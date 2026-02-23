import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { AuthService } from '../auth.service';

/**
 * Periodically deletes expired rows from the `revoked_tokens` table.
 * Runs once on startup then every hour.
 */
@Injectable()
export class TokenCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TokenCleanupService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly authService: AuthService) {}

  onModuleInit(): void {
    // Run immediately at startup, then every hour
    void this.run();
    this.timer = setInterval(() => void this.run(), 3_600_000);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private async run(): Promise<void> {
    try {
      await this.authService.cleanupExpiredTokens();
      this.logger.debug('Expired revoked tokens cleanup completed');
    } catch (err: unknown) {
      this.logger.error('Failed to clean up expired tokens', err);
    }
  }
}
