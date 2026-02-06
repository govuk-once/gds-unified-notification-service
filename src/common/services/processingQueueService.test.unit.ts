/* eslint-disable @typescript-eslint/unbound-method */
import { SendMessageBatchCommand, SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { ConfigurationService } from '@common/services/configurationService';
import { ProcessingQueueService } from '@common/services/processingQueueService';
import { StringParameters } from '@common/utils';
import { MockConfigurationImplementation } from '@common/utils/mockConfigurationImplementation.test.unit.utils';
import { observabilitySpies } from '@common/utils/mockInstanceFactory.test.util';
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

  // Initialize the mock service and repository layers
  const observabilityMock = observabilitySpies();
  const configurationServiceMock = vi.mocked(new ConfigurationService(observabilityMock));
  const sqsMock = mockClient(SQSClient);

  // Mocking implementation of the configuration service
  const mockConfigurationImplementation: MockConfigurationImplementation = new MockConfigurationImplementation();

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
    mockConfigurationImplementation.resetConfig();

    configurationServiceMock.getParameter = vi.fn().mockImplementation((namespace: string) => {
      return Promise.resolve(mockConfigurationImplementation.stringConfiguration[namespace]);
    });

    processingQueueService = new ProcessingQueueService(configurationServiceMock, observabilityMock);
    await processingQueueService.initialize();
  });

  describe('initialize', () => {
    it('should retrieve the queue url and log when the processing queue service is initalised.', async () => {
      // Act
      const result = await processingQueueService.initialize();

      // Assert
      expectTypeOf(result).toEqualTypeOf<ProcessingQueueService>();

      expect(observabilityMock.logger.info).toHaveBeenCalledWith('Processing Queue Service Initialised.');
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
          QueueUrl: mockConfigurationImplementation.stringConfiguration[StringParameters.Queue.Processing.Url],
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
        Successful: [{ MessageId: 'message_0', Id: mockMessageBody.NotificationID, MD5OfMessageBody: 'X' }],
      });

      // Act
      await processingQueueService.publishMessageBatch([mockMessageBody]);

      // Assert
      expect(sqsMock.calls()).toHaveLength(1);
      const command = sqsMock.call(0).args[0] as SendMessageCommand;
      expect(command.input).toEqual(
        expect.objectContaining({
          QueueUrl: mockConfigurationImplementation.stringConfiguration[StringParameters.Queue.Processing.Url],
          Entries: [
            {
              Id: mockMessageBody.NotificationID,
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
        Successful: [{ MessageId: 'message_0', Id: mockMessageBody.NotificationID, MD5OfMessageBody: 'X' }],
        Failed: [{ Id: mockMessageBody.NotificationID, SenderFault: false, Code: 'MockCode' }],
      });

      // Act
      await processingQueueService.publishMessageBatch([mockMessageBody_0, mockMessageBody_1]);

      // Assert
      expect(sqsMock).toHaveReceivedCommandWith(SendMessageBatchCommand, {
        QueueUrl: mockConfigurationImplementation.stringConfiguration[StringParameters.Queue.Processing.Url],
        Entries: [
          {
            Id: '1234',
            DelaySeconds: 0,
            MessageBody: JSON.stringify(mockMessageBody_0),
          },
          {
            Id: '1235',
            DelaySeconds: 0,
            MessageBody: JSON.stringify(mockMessageBody_1),
          },
        ],
      });
      expect(observabilityMock.logger.error).toHaveBeenCalledWith('Failed to publish 1 messages.');
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

    it('should use NotificationID from the message body as the batch entry Id', async () => {
      // Arrange
      sqsMock.on(SendMessageBatchCommand).resolves({
        Successful: [{ MessageId: 'message_0', Id: mockMessageBody.NotificationID, MD5OfMessageBody: 'X' }],
      });

      // Act
      await processingQueueService.publishMessageBatch([mockMessageBody]);

      // Assert
      expect(sqsMock).toHaveReceivedCommandWith(SendMessageBatchCommand, {
        QueueUrl: mockConfigurationImplementation.stringConfiguration[StringParameters.Queue.Processing.Url],
        Entries: [
          {
            Id: mockMessageBody.NotificationID,
            DelaySeconds: 0,
            MessageBody: JSON.stringify(mockMessageBody),
          },
        ],
      });
    });

    it('should split messages into batches of 10 when more than 10 messages are sent', async () => {
      // Arrange
      const mockMessageList: IMessage[] = Array.from({ length: 11 }, (_, i) => ({
        ...mockMessageBody,
        NotificationID: `notifiction-${i}`,
        UserId: i,
      }));

      sqsMock.on(SendMessageBatchCommand).resolves({
        Successful: [{ MessageId: 'message_0', Id: mockMessageBody.NotificationID, MD5OfMessageBody: 'X' }],
      });

      // Act
      await processingQueueService.publishMessageBatch(mockMessageList);

      // Assert
      expect(sqsMock.calls()).toHaveLength(2);
      const firstBatch = (sqsMock.call(0).args[0] as SendMessageBatchCommand).input;
      const secondBatch = (sqsMock.call(1).args[0] as SendMessageBatchCommand).input;

      expect(firstBatch.Entries).toHaveLength(10);
      expect(secondBatch.Entries).toHaveLength(1);

      expect(firstBatch.Entries![0].Id).toBe('notifiction-0');
      expect(secondBatch.Entries![0].Id).toBe('notifiction-10');
    });
  });
});
