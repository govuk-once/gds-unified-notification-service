import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { EventsDynamoRepository } from '@common/repositories/eventsDynamoRepository';
import { ConfigurationService } from '@common/services';
import { mockClient } from 'aws-sdk-client-mock';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });
vi.mock('@common/services/configurationService', { spy: true });

const mockEventsTableName = 'mockEventsTableName';
const mockEventsTableKey = 'NotificationID';

describe('EventsDynamoRepository', () => {
  const dynamoMock = mockClient(DynamoDB);
  let eventsDynamoRepo: EventsDynamoRepository;
  let config: ConfigurationService;

  const loggerMock = vi.mocked(new Logger());
  const tracerMock = vi.mocked(new Tracer());
  const metricsMock = vi.mocked(new Metrics());

  beforeEach(async () => {
    dynamoMock.reset();

    config = vi.mocked(new ConfigurationService(loggerMock, metricsMock, tracerMock));
    config.getParameter = vi.fn().mockResolvedValueOnce(mockEventsTableName).mockResolvedValueOnce(mockEventsTableKey);

    eventsDynamoRepo = new EventsDynamoRepository(config, loggerMock, metricsMock, tracerMock);
    await eventsDynamoRepo.initialize();
  });

  describe('initialize', () => {
    it('should throw an error if table name is undefined', async () => {
      // Arrange
      config.getParameter = vi.fn().mockResolvedValueOnce(undefined);
      eventsDynamoRepo = new EventsDynamoRepository(config, loggerMock, metricsMock, tracerMock);

      // Act
      const result = eventsDynamoRepo.initialize();

      // Assert
      await expect(result).rejects.toThrow(new Error('Failed to fetch table name'));
    });

    it('should throw an error if table key is undefined', async () => {
      // Arrange
      config.getParameter = vi.fn().mockResolvedValueOnce('mockTableName').mockResolvedValueOnce(undefined);
      eventsDynamoRepo = new EventsDynamoRepository(config, loggerMock, metricsMock, tracerMock);

      // Act
      const result = eventsDynamoRepo.initialize();

      // Assert
      await expect(result).rejects.toThrow(new Error('Failed to fetch table key'));
    });
  });
});
