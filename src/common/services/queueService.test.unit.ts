/* eslint-disable @typescript-eslint/unbound-method */
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { SendMessageBatchCommand, SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { ConfigurationService } from '@common/services/configurationService';
import { AnalyticsQueueService, DispatchQueueService, ProcessingQueueService } from '@common/services/queueService';
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

  describe('publishMessage', () => {
    it('should send a message when given the message params.', async () => {
      // Arrange
      sqsMock.on(SendMessageCommand).resolves({
        MessageId: 'message-1',
      });

      // Act
      await processingQueueService.publishMessage(mockMessageBody);

      // Assert
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      expect(sqsMock).toHaveReceivedCommandWith(SendMessageCommand, {
        QueueUrl: mockProcessingQueueUrl,
        DelaySeconds: 0,
        MessageBody: JSON.stringify(mockMessageBody),
      });
    });

    it('should throw an error and log when the send message command fails', async () => {
      // Arrange
      const errorMsg = 'SQS Error';
      sqsMock.on(SendMessageCommand).rejects(new Error(errorMsg));

      // Act
      await processingQueueService.publishMessage(mockMessageBody);

      // Assert
      expect(loggerMock.error).toHaveBeenCalledWith(`Error publishing to SQS - Error: ${errorMsg}`);
    });
  });

  describe('publishBatchMessage', () => {
    it('should send a batch of messages when given the message params.', async () => {
      // Arrange
      sqsMock.on(SendMessageBatchCommand).resolves({
        Successful: [{ MessageId: 'message_0', Id: 'msg_0', MD5OfMessageBody: 'X' }],
      });

      // Act
      await processingQueueService.publishMessageBatch([mockMessageBody]);

      // Assert
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      expect(sqsMock).toHaveReceivedCommandWith(SendMessageBatchCommand, {
        QueueUrl: mockProcessingQueueUrl,
        Entries: [
          {
            Id: 'msg_0',
            DelaySeconds: 0,
            MessageBody: JSON.stringify(mockMessageBody),
          },
        ],
      });
      expect(loggerMock.info).toHaveBeenCalledWith('Successfully published 1 messages.');
    });

    it('should send a batch of messages and log any that were failed to be sent.', async () => {
      // Arrange
      const mockMessageBody_0 = {
        NotificationID: '1234',
        DepartmentID: 'DVLA01',
        UserID: 'UserID',
        MessageTitle: 'You have a new Message',
        MessageBody: 'Open Notification Centre to read your notifications',
        NotificationTitle: 'You have a new medical driving license',
        NotificationBody: 'The DVLA has issued you a new license.',
      };
      const mockMessageBody_1 = {
        NotificationID: '1235',
        DepartmentID: 'DVLA01',
        UserID: 'UserID-1',
        MessageTitle: 'You have a new Message',
        MessageBody: 'Open Notification Centre to read your notifications',
        NotificationTitle: 'You have a new medical driving license',
        NotificationBody: 'The DVLA has issued you a new license.',
      };

      sqsMock.on(SendMessageBatchCommand).resolves({
        Successful: [{ MessageId: 'message_0', Id: 'msg_0', MD5OfMessageBody: 'X' }],
        Failed: [{ Id: 'msg_1', SenderFault: false, Code: 'MockCode' }],
      });

      // Act
      await processingQueueService.publishMessageBatch([mockMessageBody_0, mockMessageBody_1]);

      // Assert
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      expect(sqsMock).toHaveReceivedCommandWith(SendMessageBatchCommand, {
        QueueUrl: mockProcessingQueueUrl,
        Entries: [
          {
            Id: 'msg_0',
            DelaySeconds: 0,
            MessageBody: JSON.stringify(mockMessageBody_0),
          },
          {
            Id: 'msg_1',
            DelaySeconds: 0,
            MessageBody: JSON.stringify(mockMessageBody_1),
          },
        ],
      });
      expect(loggerMock.info).toHaveBeenCalledWith('Failed to publish 1 messages.');
    });

    it('should throw an error when more than 10 messages are send in a batch.', async () => {
      // Arrange
      const mockMessageList: IMessage[] = [
        mockMessageBody,
        mockMessageBody,
        mockMessageBody,
        mockMessageBody,
        mockMessageBody,
        mockMessageBody,
        mockMessageBody,
        mockMessageBody,
        mockMessageBody,
        mockMessageBody,
        mockMessageBody,
      ];

      const errorMsg = 'A single message batch request can include a maximum of 10 messages.';

      // Act
      await processingQueueService.publishMessageBatch(mockMessageList);

      // Assert
      expect(loggerMock.error).toHaveBeenCalledWith(errorMsg);
    });

    it('should throw an error and log when the send batch message command fails', async () => {
      // Arrange
      const errorMsg = 'SQS Error';
      sqsMock.on(SendMessageBatchCommand).rejects(new Error(errorMsg));

      // Act
      await processingQueueService.publishMessageBatch([mockMessageBody]);

      // Assert
      expect(loggerMock.error).toHaveBeenCalledWith(`Error publishing to SQS - Error: ${errorMsg}`);
    });
  });
});

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
