import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { EventsDynamoRepository } from '@common/repositories/eventsDynamoRepository';
import { observabilitySpies, ServiceSpies } from '@common/utils/mockIocInstanceFactory';
import { mockClient } from 'aws-sdk-client-mock';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });
vi.mock('@common/services', { spy: true });

const mockEventsTableName = 'mockEventsTableName';
const mockEventsTableKey = 'NotificationID';

describe('EventsDynamoRepository', () => {
  let eventsDynamoRepo: EventsDynamoRepository;

  const observabilityMock = observabilitySpies();
  const serviceMocks = ServiceSpies(observabilityMock);
  const dynamoMock = mockClient(DynamoDB);

  beforeEach(async () => {
    dynamoMock.reset();

    serviceMocks.configurationServiceMock.getParameter = vi
      .fn()
      .mockResolvedValueOnce(mockEventsTableName)
      .mockResolvedValueOnce(mockEventsTableKey);

    eventsDynamoRepo = new EventsDynamoRepository(serviceMocks.configurationServiceMock, observabilityMock);
    await eventsDynamoRepo.initialize();
  });

  describe('initialize', () => {
    it('should throw an error if table name is undefined', async () => {
      // Arrange
      serviceMocks.configurationServiceMock.getParameter = vi.fn().mockResolvedValueOnce(undefined);
      eventsDynamoRepo = new EventsDynamoRepository(serviceMocks.configurationServiceMock, observabilityMock);

      // Act
      const result = eventsDynamoRepo.initialize();

      // Assert
      await expect(result).rejects.toThrow(new Error('Failed to fetch table name'));
    });

    it('should throw an error if table key is undefined', async () => {
      // Arrange
      serviceMocks.configurationServiceMock.getParameter = vi
        .fn()
        .mockResolvedValueOnce('mockTableName')
        .mockResolvedValueOnce(undefined);
      eventsDynamoRepo = new EventsDynamoRepository(serviceMocks.configurationServiceMock, observabilityMock);

      // Act
      const result = eventsDynamoRepo.initialize();

      // Assert
      await expect(result).rejects.toThrow(new Error('Failed to fetch table key'));
    });
  });
});
