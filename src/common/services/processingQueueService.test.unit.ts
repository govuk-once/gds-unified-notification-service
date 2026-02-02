/* eslint-disable @typescript-eslint/unbound-method */
import { SendMessageBatchCommand, SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { ConfigurationService } from '@common/services/configurationService';
import { ProcessingQueueService } from '@common/services/processingQueueService';
import { observabilitySpies } from '@common/utils/mockIocInstanceFactory';
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

  const observabilityMock = observabilitySpies();
  const sqsMock = mockClient(SQSClient);

  const mockProcessingQueueUrl = 'mockProcessingQueueUrl';
  const mockMessageBody = {
    NotificationID: '1234',
    DepartmentID: 'DVLA01',
    UserID: 'UserID',
    MessageTitle: 'You have a new Message',
    MessageBody: 'Open Notification Centre to read your notifications',
    NotificationTitle: 'You have a new medical driving license',
    NotificationBody: 'The DVLA has issued you a new license.',
  };

  beforeEach(async () => {
    // Reset all mock
    vi.clearAllMocks();
    sqsMock.reset();

    configurationServiceMock = vi.mocked(new ConfigurationService(observabilityMock));
    configurationServiceMock.getParameter = vi.fn().mockResolvedValue(mockProcessingQueueUrl);
    processingQueueService = new ProcessingQueueService(configurationServiceMock, observabilityMock);
    await processingQueueService.initialize();
  });

  describe('initialize', () => {
    it('should retrieve the queue url and log when the processing queue service is initalised.', async () => {
      // Act
      const result = await processingQueueService.initialize();

      // Assert
      expect(configurationServiceMock.getParameter).toHaveBeenCalledWith(StringParameters.Queue.Processing.Url);
      expectTypeOf(result).toEqualTypeOf<ProcessingQueueService>();

      expect(observabilityMock.logger.info).toHaveBeenCalledWith('Processing Queue Service Initialised.');
    });

    it('should throw an error if queue url is undefined', async () => {
      // Arrange
      configurationServiceMock.getParameter = vi.fn().mockResolvedValueOnce(undefined);

      processingQueueService = new ProcessingQueueService(configurationServiceMock, observabilityMock);

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
      expect(sqsMock.calls()).toHaveLength(1);
      const command = sqsMock.call(0).args[0] as SendMessageCommand;
      expect(command.input).toEqual(
        expect.objectContaining({
          QueueUrl: mockProcessingQueueUrl,
          DelaySeconds: 0,
          MessageBody: JSON.stringify(mockMessageBody),
        })
      );
    });

    it('should throw an error and log when the send message command fails', async () => {
      // Arrange
      const errorMsg = 'SQS Error';
      sqsMock.on(SendMessageCommand).rejects(new Error(errorMsg));

      // Act
      await processingQueueService.publishMessage(mockMessageBody);

      // Assert
      expect(observabilityMock.logger.error).toHaveBeenCalledWith(`Error publishing to SQS - Error: ${errorMsg}`);
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
      expect(sqsMock.calls()).toHaveLength(1);
      const command = sqsMock.call(0).args[0] as SendMessageCommand;
      expect(command.input).toEqual(
        expect.objectContaining({
          QueueUrl: mockProcessingQueueUrl,
          Entries: [
            {
              Id: 'msg_0',
              DelaySeconds: 0,
              MessageBody: JSON.stringify(mockMessageBody),
            },
          ],
        })
      );
      expect(observabilityMock.logger.info).toHaveBeenCalledWith('Successfully published 1 messages.');
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
      expect(observabilityMock.logger.error).toHaveBeenCalledWith('Failed to publish 1 messages.');
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

      const errorMsg = 'A single message batch request can include a maximum of 10 messages';

      // Act
      await processingQueueService.publishMessageBatch(mockMessageList);

      // Assert
      expect(observabilityMock.logger.error).toHaveBeenCalledWith(errorMsg);
    });

    it('should throw an error and log when the send batch message command fails', async () => {
      // Arrange
      const errorMsg = 'SQS Error';
      sqsMock.on(SendMessageBatchCommand).rejects(new Error(errorMsg));

      // Act
      await processingQueueService.publishMessageBatch([mockMessageBody]);

      // Assert
      expect(observabilityMock.logger.error).toHaveBeenCalledWith(`Error publishing to SQS - Error: ${errorMsg}`);
    });
  });
});
