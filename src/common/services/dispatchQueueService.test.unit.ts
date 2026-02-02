/* eslint-disable @typescript-eslint/unbound-method */
import { SQSClient } from '@aws-sdk/client-sqs';
import { ConfigurationService } from '@common/services/configurationService';
import { DispatchQueueService } from '@common/services/dispatchQueueService';
import { observabilitySpies } from '@common/utils/mockIocInstanceFactory';
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

  const observabilityMock = observabilitySpies();
  const sqsMock = mockClient(SQSClient);

  const mockDispatchQueueUrl = 'mockDispatchQueueUrl';

  beforeEach(async () => {
    // Reset all mock
    vi.clearAllMocks();
    sqsMock.reset();

    configurationServiceMock = vi.mocked(new ConfigurationService(observabilityMock));
    configurationServiceMock.getParameter = vi.fn().mockResolvedValue(mockDispatchQueueUrl);
    dispatchQueueService = new DispatchQueueService(configurationServiceMock, observabilityMock);
    await dispatchQueueService.initialize();
  });

  describe('initialize', () => {
    it('should retrieve the queue url and log when the dispatch queue service is initalised.', async () => {
      // Act
      const result = await dispatchQueueService.initialize();

      // Assert
      expect(configurationServiceMock.getParameter).toHaveBeenCalledWith(StringParameters.Queue.Dispatch.Url);
      expectTypeOf(result).toEqualTypeOf<DispatchQueueService>();
      expect(observabilityMock.logger.info).toHaveBeenCalledWith('Dispatch Queue Service Initialised.');
    });

    it('should throw an error if queue url is undefined', async () => {
      // Arrange
      configurationServiceMock.getParameter = vi.fn().mockResolvedValueOnce(undefined);

      // Act
      const result = dispatchQueueService.initialize();

      // Assert
      await expect(result).rejects.toThrow(new Error('Failed to fetch queueUrl'));
    });
  });
});
