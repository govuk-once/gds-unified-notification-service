import { AnalyticsQueueService } from '@common/services/analyticsQueueService';
import {
  mockDefaultConfig,
  mockGetParameterImplementation,
} from '@common/utils/mockConfigurationImplementation.test.util';
import { iocSpies } from '@common/utils/mockInstanceFactory.test.util';
import { StringParameters } from '@common/utils/parameters';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });
vi.mock('@aws-sdk/client-sqs', { spy: true });
vi.mock('@common/services/configurationService', { spy: true });

describe('AnalyticsQueueService', () => {
  let analyticsQueueService: AnalyticsQueueService;

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

    analyticsQueueService = new AnalyticsQueueService(
      serviceMocks.configurationServiceMock,
      awsClientMocks.sqsClientMock,
      observabilityMocks
    );
    await analyticsQueueService.initialize();
  });

  describe('getQueueName', () => {
    it('should have return the correct queue name', () => {
      // Act
      const result = analyticsQueueService.getQueueName();

      // Assert
      expect(result).toBe('analytics');
    });
  });

  describe('initialize', () => {
    it('should retrieve the queue url and log when the analytics queue service is initialised.', async () => {
      // Act
      const result = await analyticsQueueService.initialize();

      // Assert
      expect(serviceMocks.configurationServiceMock.getParameter).toHaveBeenCalledWith(
        StringParameters.Queue.Analytics.Url
      );
      expectTypeOf(result).toEqualTypeOf<AnalyticsQueueService>();
      expect(observabilityMocks.logger.info).toHaveBeenCalledWith('Analytics Queue Service Initialised.');
    });
  });
});
