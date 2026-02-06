/* eslint-disable @typescript-eslint/unbound-method */
import { SQSClient } from '@aws-sdk/client-sqs';
import { AnalyticsQueueService } from '@common/services/analyticsQueueService';
import { MockConfigurationImplementation } from '@common/utils/mockConfigurationImplementation.test.unit.utils';
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

  // Initialize the mock service and repository layers
  const observabilityMock = observabilitySpies();
  const serviceMocks = ServiceSpies(observabilityMock);
  const sqsMock = mockClient(SQSClient);

  // Mocking implementation of the configuration service
  const mockConfigurationImplementation: MockConfigurationImplementation = new MockConfigurationImplementation();

  beforeEach(async () => {
    // Reset all mock
    vi.clearAllMocks();
    sqsMock.reset();
    mockConfigurationImplementation.resetConfig();

    serviceMocks.configurationServiceMock.getParameter = vi.fn().mockImplementation((namespace: string) => {
      return Promise.resolve(mockConfigurationImplementation.stringConfiguration[namespace]);
    });

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
  });
});
