import { Module } from '@nestjs/common';
import { NotificationsProvider } from './notifications.provider';

/**
 * Notifications Module
 * Provides flexible multi-channel notification capabilities
 * Easily extensible to add new channels
 */
@Module({
  providers: [NotificationsProvider],
  exports: [NotificationsProvider],
})
export class NotificationsModule {}
