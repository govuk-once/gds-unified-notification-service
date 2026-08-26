import { DispatchQueueService } from '@common/services/dispatchQueueService';
import {
  mockDefaultConfig,
  mockGetParameterImplementation,
} from '@test/mocks/services/mockConfigurationImplementation.test.util';
import { iocSpies } from '@test/mocks/services/mockInstanceFactory.test.util';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });
vi.mock('@aws-sdk/client-sqs', { spy: true });
vi.mock('@common/services/configurationService', { spy: true });

describe('DispatchQueueService', () => {
  let dispatchQueueService: DispatchQueueService;

  // Observability and Service mocks
  // Initialize mock services, clients, and repositories
  const { observabilityMocks, awsClientMocks, serviceMocks } = iocSpies();

  // Mocking implementation of the configuration service
  let mockParameterStore = mockDefaultConfig();

  beforeEach(async () => {
    // Reset all mock
    vi.clearAllMocks();

    // Mock SSM Values
    mockParameterStore = mockDefaultConfig();
    serviceMocks.configurationServiceMock.getParameter.mockImplementation(
      mockGetParameterImplementation(mockParameterStore)
    );

    dispatchQueueService = new DispatchQueueService(
      serviceMocks.configurationServiceMock,
      awsClientMocks.sqsClientMock,
      observabilityMocks
    );
    await dispatchQueueService.initialize();
  });

  describe('getQueueName', () => {
    it('should have return the correct queue name', () => {
      // Act
      const result = dispatchQueueService.getQueueName();

      // Assert
      expect(result).toBe('dispatch');
    });
  });

  describe('initialize', () => {
    it('should retrieve the queue url and log when the dispatch queue service is initialised.', async () => {
      // Act
      const result = await dispatchQueueService.initialize();

      // Assert
      expectTypeOf(result).toEqualTypeOf<DispatchQueueService>();
      expect(observabilityMocks.logger.info).toHaveBeenCalledWith('Dispatch Queue Service Initialised.');
    });
  });
});
