import { AnalyticsQueueService } from '@common/services/analyticsQueueService';
import { StringParameters } from '@common/utils';
import { iocSpies, mockServicesExpectedBehaviour } from '@test/mocks';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });
vi.mock('@aws-sdk/client-sqs', { spy: true });

vi.mock('@common/services/configurationService', { spy: true });

describe('AnalyticsQueueService', async () => {
  let analyticsQueueService: AnalyticsQueueService;

  // Initialize mock services, clients, and repositories
  const { observabilityMocks, awsClientMocks, serviceMocks } = await iocSpies();

  beforeEach(async () => {
    // Reset all mock
    vi.clearAllMocks();

    // Mock SSM store and services responses
    mockServicesExpectedBehaviour(serviceMocks);

    analyticsQueueService = await AnalyticsQueueService.create(
      serviceMocks.configurationServiceMock,
      observabilityMocks,
      awsClientMocks.sqsClientMock
    );
  });

  describe('getQueueName', () => {
    it('should have return the correct queue name', () => {
      // Act
      const result = analyticsQueueService.getQueueName();

      // Assert
      expect(result).toBe('analytics');
    });
  });

  describe('create', () => {
    it('should retrieve the queue url and log when the analytics queue service is initialised.', async () => {
      // Act
      const result = await AnalyticsQueueService.create(
        serviceMocks.configurationServiceMock,
        observabilityMocks,
        awsClientMocks.sqsClientMock
      );

      // Assert
      expect(serviceMocks.configurationServiceMock.getParameter).toHaveBeenCalledWith(
        StringParameters.Queue.Analytics.Url
      );
      expect(result).toBeInstanceOf(AnalyticsQueueService);
    });
  });
});
