import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { InboundDynamoRepository } from '@common/repositories/inboundDynamoRepository';
import { ConfigurationService } from '@common/services';
import { mockClient } from 'aws-sdk-client-mock';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });
vi.mock('@common/services/configurationService', { spy: true });

const mockInboundTableName = 'mockInboundTableName';
const mockInboundTableKey = 'NotificationID';

describe('InboundDynamoRepository', () => {
  const dynamoMock = mockClient(DynamoDB);
  let inboundDynamoRepo: InboundDynamoRepository;
  let config: ConfigurationService;

  const loggerMock = vi.mocked(new Logger());
  const tracerMock = vi.mocked(new Tracer());
  const metricsMock = vi.mocked(new Metrics());

  beforeEach(async () => {
    dynamoMock.reset();

    config = vi.mocked(new ConfigurationService(loggerMock, metricsMock, tracerMock));
    config.getParameter = vi
      .fn()
      .mockResolvedValueOnce(mockInboundTableName)
      .mockResolvedValueOnce(mockInboundTableKey);

    inboundDynamoRepo = new InboundDynamoRepository(config, loggerMock, metricsMock, tracerMock);
    await inboundDynamoRepo.initialize();
  });

  describe('initialize', () => {
    it('should throw an error if table name is undefined', async () => {
      // Arrange
      config.getParameter = vi.fn().mockResolvedValueOnce(undefined);
      inboundDynamoRepo = new InboundDynamoRepository(config, loggerMock, metricsMock, tracerMock);

      // Act
      const result = inboundDynamoRepo.initialize();

      // Assert
      await expect(result).rejects.toThrow(new Error('Failed to fetch table name'));
    });

    it('should throw an error if table key is undefined', async () => {
      // Arrange
      config.getParameter = vi.fn().mockResolvedValueOnce('mockTableName').mockResolvedValueOnce(undefined);
      inboundDynamoRepo = new InboundDynamoRepository(config, loggerMock, metricsMock, tracerMock);

      // Act
      const result = inboundDynamoRepo.initialize();

      // Assert
      await expect(result).rejects.toThrow(new Error('Failed to fetch table key'));
    });
  });
});
