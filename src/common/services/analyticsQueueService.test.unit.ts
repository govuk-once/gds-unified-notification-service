/* eslint-disable @typescript-eslint/unbound-method */
import { SQSClient } from '@aws-sdk/client-sqs';
import { AnalyticsQueueService } from '@common/services/analyticsQueueService';
import { observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import { StringParameters } from '@common/utils/parameters';
import { mockClient } from 'aws-sdk-client-mock';
import { toHaveReceivedCommandWith } from 'aws-sdk-client-mock-vitest';

expect.extend({
  toHaveReceivedCommandWith,
});

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });
vi.mock('@common/services/configurationService', { spy: true });

describe('AnalyticsQueueService', () => {
  let analyticsQueueService: AnalyticsQueueService;

  const observabilityMock = observabilitySpies();
  const serviceMocks = ServiceSpies(observabilityMock);
  const sqsMock = mockClient(SQSClient);

  const mockAnalyticsQueueUrl = 'mockAnalyticsQueueUrl';

  beforeEach(async () => {
    // Reset all mock
    vi.clearAllMocks();
    sqsMock.reset();

    serviceMocks.configurationServiceMock.getParameter = vi.fn().mockResolvedValue(mockAnalyticsQueueUrl);
    analyticsQueueService = new AnalyticsQueueService(serviceMocks.configurationServiceMock, observabilityMock);
    await analyticsQueueService.initialize();
  });

  describe('initialize', () => {
    it('should retrieve the queue url and log when the analytics queue service is initalised.', async () => {
      // Act
      const result = await analyticsQueueService.initialize();

      // Assert
      expect(serviceMocks.configurationServiceMock.getParameter).toHaveBeenCalledWith(
        StringParameters.Queue.Analytics.Url
      );
      expectTypeOf(result).toEqualTypeOf<AnalyticsQueueService>();
      expect(observabilityMock.logger.info).toHaveBeenCalledWith('Analytics Queue Service Initialised.');
    });

    it('should throw an error if queue url is undefined', async () => {
      // Arrange
      serviceMocks.configurationServiceMock.getParameter = vi.fn().mockResolvedValueOnce(undefined);
      analyticsQueueService = new AnalyticsQueueService(serviceMocks.configurationServiceMock, observabilityMock);

      // Act
      const result = analyticsQueueService.initialize();

      // Assert
      await expect(result).rejects.toThrow(new Error('Failed to fetch queueUrl'));
    });
  });
});
