/* eslint-disable @typescript-eslint/unbound-method */
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { SQSClient } from '@aws-sdk/client-sqs';
import { AnalyticsQueueService } from '@common/services/analyticsQueueService';
import { ConfigurationService } from '@common/services/configurationService';
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
  let configurationServiceMock: ConfigurationService;

  const loggerMock = vi.mocked(new Logger());
  const metricsMock = vi.mocked(new Metrics());
  const tracerMock = vi.mocked(new Tracer());
  const sqsMock = mockClient(SQSClient);

  const mockAnalyticsQueueUrl = 'mockAnalyticsQueueUrl';

  beforeEach(async () => {
    // Reset all mock
    vi.clearAllMocks();
    sqsMock.reset();

    configurationServiceMock = vi.mocked(new ConfigurationService(loggerMock, metricsMock, tracerMock));
    configurationServiceMock.getParameter = vi.fn().mockResolvedValue(mockAnalyticsQueueUrl);
    analyticsQueueService = new AnalyticsQueueService(configurationServiceMock, loggerMock, metricsMock, tracerMock);
    await analyticsQueueService.initialize();
  });

  describe('initialize', () => {
    it('should retrieve the queue url and log when the analytics queue service is initalised.', async () => {
      // Act
      const result = await analyticsQueueService.initialize();

      // Assert
      expect(configurationServiceMock.getParameter).toHaveBeenCalledWith(StringParameters.Queue.Analytics.Url);
      expectTypeOf(result).toEqualTypeOf<AnalyticsQueueService>();
      expect(loggerMock.info).toHaveBeenCalledWith('Analytics Queue Service Initialised.');
    });

    it('should throw an error if queue url is undefined', async () => {
      // Arrange
      configurationServiceMock.getParameter = vi.fn().mockResolvedValueOnce(undefined);
      analyticsQueueService = new AnalyticsQueueService(configurationServiceMock, loggerMock, metricsMock, tracerMock);

      // Act
      const result = analyticsQueueService.initialize();

      // Assert
      await expect(result).rejects.toThrow(new Error('Failed to fetch queueUrl'));
    });
  });
});
