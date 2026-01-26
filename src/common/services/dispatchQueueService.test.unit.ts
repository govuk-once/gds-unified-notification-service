/* eslint-disable @typescript-eslint/unbound-method */
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { SQSClient } from '@aws-sdk/client-sqs';
import { ConfigurationService } from '@common/services/configurationService';
import { DispatchQueueService } from '@common/services/dispatchQueueService';
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

describe('DispatchQueueService', () => {
  let dispatchQueueService: DispatchQueueService;
  let configurationServiceMock: ConfigurationService;

  const loggerMock = vi.mocked(new Logger());
  const metricsMock = vi.mocked(new Metrics());
  const tracerMock = vi.mocked(new Tracer());
  const sqsMock = mockClient(SQSClient);

  const mockDispatchQueueUrl = 'mockDispatchQueueUrl';

  beforeEach(async () => {
    // Reset all mock
    vi.clearAllMocks();
    sqsMock.reset();

    configurationServiceMock = vi.mocked(new ConfigurationService(loggerMock, metricsMock, tracerMock));
    configurationServiceMock.getParameter = vi.fn().mockResolvedValue(mockDispatchQueueUrl);
    dispatchQueueService = new DispatchQueueService(configurationServiceMock, loggerMock, metricsMock, tracerMock);
    await dispatchQueueService.initialize();
  });

  describe('initialize', () => {
    it('should retrieve the queue url and log when the dispatch queue service is initalised.', async () => {
      // Act
      const result = await dispatchQueueService.initialize();

      // Assert
      expect(configurationServiceMock.getParameter).toHaveBeenCalledWith(StringParameters.Queue.Dispatch.Url);
      expectTypeOf(result).toEqualTypeOf<DispatchQueueService>();
      expect(loggerMock.info).toHaveBeenCalledWith('Dispatch Queue Service Initialised.');
    });

    it('should throw an error if queue url is undefined', async () => {
      // Arrange
      configurationServiceMock.getParameter = vi.fn().mockResolvedValueOnce(undefined);

      dispatchQueueService = new DispatchQueueService(configurationServiceMock, loggerMock, metricsMock, tracerMock);

      // Act
      const result = dispatchQueueService.initialize();

      // Assert
      await expect(result).rejects.toThrow(new Error('Failed to fetch queueUrl'));
    });
  });
});
