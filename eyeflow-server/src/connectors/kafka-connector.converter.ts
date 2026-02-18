import { ConnectorEntity } from './connector.entity';
import { KafkaConnectorConfig, ConnectorType, AuthType } from './connector.types';

/**
 * Convert ConnectorEntity to KafkaConnectorConfig
 * Decrypts credentials and builds proper configuration object
 */
export function convertConnectorEntityToKafkaConfig(
  connector: ConnectorEntity,
  decryptedCredentials: any,
): KafkaConnectorConfig {
  return {
    id: connector.id,
    name: connector.name,
    type: ConnectorType.KAFKA,
    userId: connector.userId,
    description: connector.description,
    auth: {
      type: connector.authType,
      credentials: decryptedCredentials,
      encrypted: true,
    },
    topics: [], // Will be fetched via listTopics() method
    enabled: connector.status === 'active',
    createdAt: connector.createdAt,
    updatedAt: connector.updatedAt,
  };
}
