import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConnectorsController } from './connectors.controller';
import { KafkaConnectorController } from './kafka-connector.controller';
import { ConnectorsService } from './connectors.service';
import { KafkaConnectorService } from './kafka-connector.service';
import { ConnectorEntity } from './connector.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ConnectorEntity])],
  controllers: [ConnectorsController, KafkaConnectorController],
  providers: [ConnectorsService, KafkaConnectorService],
  exports: [ConnectorsService, KafkaConnectorService],
})
export class ConnectorsModule {}
