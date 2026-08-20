import { DispatchQueueService } from '@common/services/dispatchQueueService';
import {
  mockDefaultConfig,
  mockGetParameterImplementation,
} from '@common/utils/mockConfigurationImplementation.test.util';
import { awsClientSpies, observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });
vi.mock('@aws-sdk/client-sqs', { spy: true });
vi.mock('@common/services/configurationService', { spy: true });

describe('DispatchQueueService', () => {
  let dispatchQueueService: DispatchQueueService;

  // Observability and Service mocks
  const observabilityMock = observabilitySpies();
  const clientMocks = awsClientSpies();
  const serviceMocks = ServiceSpies(observabilityMock, clientMocks);

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
      clientMocks.sqsClientMock,
      observabilityMock
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
      expect(observabilityMock.logger.info).toHaveBeenCalledWith('Dispatch Queue Service Initialised.');
    });
  });
});
