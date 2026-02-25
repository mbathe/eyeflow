import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeEventsService } from './realtime-events.service';

@Module({
  providers: [RealtimeEventsService, RealtimeGateway],
  exports: [RealtimeEventsService],
})
export class RealtimeModule {}
