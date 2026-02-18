/**
 * Mock for kafkajs - Used when Kafka is disabled in tests
 * This prevents connection attempts to Kafka brokers during testing
 */

export const mockKafkaClient = {
  connect: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
  admin: jest.fn().mockReturnValue({
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    fetchTopicMetadata: jest.fn().mockResolvedValue({
      topics: [],
    }),
    describeConsumerGroups: jest.fn().mockResolvedValue({
      groups: [],
    }),
    fetchOffsets: jest.fn().mockResolvedValue([]),
    listGroups: jest.fn().mockResolvedValue({
      groups: [],
    }),
  }),
  consumer: jest.fn().mockReturnValue({
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn().mockResolvedValue(undefined),
    run: jest.fn().mockResolvedValue(undefined),
  }),
  producer: jest.fn().mockReturnValue({
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    send: jest.fn().mockResolvedValue([{ topicName: 'test', partition: 0 }]),
    sendBatch: jest.fn().mockResolvedValue([{ topicName: 'test', partition: 0 }]),
  }),
};

export const mockKafkaClass = jest.fn(() => mockKafkaClient);

jest.mock('kafkajs', () => ({
  Kafka: mockKafkaClass,
  logLevel: {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
  },
}));
