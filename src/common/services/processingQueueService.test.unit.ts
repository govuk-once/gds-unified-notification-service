/* eslint-disable @typescript-eslint/unbound-method */
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { SQSClient } from '@aws-sdk/client-sqs';
import { ConfigurationService } from '@common/services/configurationService';
import { ProcessingQueueService } from '@common/services/processingQueueService';
import { StringParameters } from '@common/utils/parameters';
import { IMessage } from '@project/lambdas/interfaces/IMessage';
import { mockClient } from 'aws-sdk-client-mock';
import { toHaveReceivedCommandWith } from 'aws-sdk-client-mock-vitest';

expect.extend({
  toHaveReceivedCommandWith,
});

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });
vi.mock('@common/services/configurationService', { spy: true });

describe('ProcessingQueueService', () => {
  let processingQueueService: ProcessingQueueService;
  let configurationServiceMock: ConfigurationService;
  let mockMessageBody: IMessage;

  const loggerMock = vi.mocked(new Logger());
  const metricsMock = vi.mocked(new Metrics());
  const tracerMock = vi.mocked(new Tracer());
  const sqsMock = mockClient(SQSClient);

  const mockProcessingQueueUrl = 'mockProcessingQueueUrl';

  beforeEach(async () => {
    // Reset all mock
    vi.clearAllMocks();
    sqsMock.reset();

    configurationServiceMock = vi.mocked(new ConfigurationService(loggerMock, metricsMock, tracerMock));
    configurationServiceMock.getParameter = vi.fn().mockResolvedValue(mockProcessingQueueUrl);
    processingQueueService = new ProcessingQueueService(configurationServiceMock, loggerMock, metricsMock, tracerMock);
    await processingQueueService.initialize();

    mockMessageBody = {
      NotificationID: '1234',
      DepartmentID: 'DVLA01',
      UserID: 'UserID',
      MessageTitle: 'You have a new Message',
      MessageBody: 'Open Notification Centre to read your notifications',
      NotificationTitle: 'You have a new medical driving license',
      NotificationBody: 'The DVLA has issued you a new license.',
    };
  });

  describe('initialize', () => {
    it('should retrieve the queue url and log when the processing queue service is initalised.', async () => {
      // Act
      const result = await processingQueueService.initialize();

      // Assert
      expect(configurationServiceMock.getParameter).toHaveBeenCalledWith(StringParameters.Queue.Processing.Url);
      expectTypeOf(result).toEqualTypeOf<ProcessingQueueService>();

      expect(loggerMock.info).toHaveBeenCalledWith('Processing Queue Service Initialised.');
    });

    it('should throw an error if queue url is undefined', async () => {
      // Arrange
      configurationServiceMock.getParameter = vi.fn().mockResolvedValueOnce(undefined);

      processingQueueService = new ProcessingQueueService(
        configurationServiceMock,
        loggerMock,
        metricsMock,
        tracerMock
      );

      // Act
      const result = processingQueueService.initialize();

      // Assert
      await expect(result).rejects.toThrow(new Error('Failed to fetch queueUrl'));
    });
  });
});
