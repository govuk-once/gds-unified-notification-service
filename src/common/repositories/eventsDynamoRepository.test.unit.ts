import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { EventsDynamoRepository } from '@common/repositories/eventsDynamoRepository';
import { MockConfigurationImplementation } from '@common/utils/mockConfigurationImplementation.test.unit.utils';
import { observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import { mockClient } from 'aws-sdk-client-mock';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });
vi.mock('@common/services', { spy: true });

describe('EventsDynamoRepository', () => {
  let eventsDynamoRepo: EventsDynamoRepository;

  // Initialize the mock service and repository layers
  const observabilityMock = observabilitySpies();
  const serviceMocks = ServiceSpies(observabilityMock);
  const dynamoMock = mockClient(DynamoDB);

  // Mocking implementation of the configuration service
  const mockConfigurationImplementation: MockConfigurationImplementation = new MockConfigurationImplementation();

  beforeEach(async () => {
    // Reset all mock
    vi.resetAllMocks();
    dynamoMock.reset();
    mockConfigurationImplementation.resetConfig();

    serviceMocks.configurationServiceMock.getParameter = vi.fn().mockImplementation((namespace: string) => {
      return Promise.resolve(mockConfigurationImplementation.stringConfiguration[namespace]);
    });

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
