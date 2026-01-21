import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { SendMessageBatchCommand, SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { QueueService } from '@common/services/queueService';
import { mockClient } from 'aws-sdk-client-mock';
import { toHaveReceivedCommandWith } from 'aws-sdk-client-mock-vitest';

expect.extend({
  toHaveReceivedCommandWith,
});

const sqsMock = mockClient(SQSClient);
const mockQueueUrl = 'testQueueUrl';

describe('QueueService', () => {
  const info = vi.fn();
  const error = vi.fn();

  let queueService: QueueService;

  beforeEach(() => {
    // Reset all mock
    vi.clearAllMocks();
    sqsMock.reset();

    queueService = new QueueService(
      mockQueueUrl,
      { info, error } as unknown as Logger,
      {} as unknown as Metrics,
      {} as unknown as Tracer
    );
  });

  describe('publishMessage', () => {
    it('should send a message when given the message params.', async () => {
      // Arrange
      const mockMessageBody = 'testMessageBody';

      sqsMock.on(SendMessageCommand).resolves({
        MessageId: 'message-1',
      });

      // Act
      await queueService.publishMessage(mockMessageBody);

      // Assert
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      expect(sqsMock).toHaveReceivedCommandWith(SendMessageCommand, {
        QueueUrl: mockQueueUrl,
        DelaySeconds: 0,
        MessageBody: mockMessageBody,
      });
    });

    it('should throw an error and log when the send message command fails', async () => {
      // Arrange
      const mockMessageBody = 'testMessageBody';

      const errorMsg = 'SQS Error';
      sqsMock.on(SendMessageCommand).rejects(new Error(errorMsg));

      // Act
      const result = queueService.publishMessage(mockMessageBody);

      // Assert
      await expect(result).rejects.toThrow(new Error(errorMsg));
      expect(error).toHaveBeenCalledWith(`Error publishing to SQS - Error: ${errorMsg}`);
    });
  });

  describe('publishBatchMessage', () => {
    it('should send a batch of messages when given the message params.', async () => {
      // Arrange
      const mockMessageBody = 'testMessageBody';

      sqsMock.on(SendMessageBatchCommand).resolves({
        Successful: [{ MessageId: 'message_0', Id: 'msg_0', MD5OfMessageBody: 'X' }],
      });

      // Act
      await queueService.publishMessageBatch([mockMessageBody]);

      // Assert
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      expect(sqsMock).toHaveReceivedCommandWith(SendMessageBatchCommand, {
        QueueUrl: mockQueueUrl,
        Entries: [
          {
            Id: 'msg_0',
            DelaySeconds: 0,
            MessageBody: mockMessageBody,
          },
        ],
      });
      expect(info).toHaveBeenCalledWith('Successfully published 1 messages.');
    });

    it('should send a batch of messages and log any that were failed to be sent.', async () => {
      // Arrange
      const mockMessageBody_0 = 'testMessageBody';
      const mockMessageBody_1 = 'testMessageBody';

      sqsMock.on(SendMessageBatchCommand).resolves({
        Successful: [{ MessageId: 'message_0', Id: 'msg_0', MD5OfMessageBody: 'X' }],
        Failed: [{ Id: 'msg_1', SenderFault: false, Code: 'MockCode' }],
      });

      // Act
      await queueService.publishMessageBatch([mockMessageBody_0, mockMessageBody_1]);

      // Assert
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      expect(sqsMock).toHaveReceivedCommandWith(SendMessageBatchCommand, {
        QueueUrl: mockQueueUrl,
        Entries: [
          {
            Id: 'msg_0',
            DelaySeconds: 0,
            MessageBody: mockMessageBody_0,
          },
          {
            Id: 'msg_1',
            DelaySeconds: 0,
            MessageBody: mockMessageBody_1,
          },
        ],
      });
      expect(info).toHaveBeenCalledWith('Failed to publish 1 messages.');
    });

    it('should throw an error when more than 10 messages are send in a batch.', async () => {
      // Arrange
      const mockMessageBody = 'testMessageBody';
      const mockMessageList: string[] = [
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
      const result = queueService.publishMessageBatch(mockMessageList);

      // Assert
      await expect(result).rejects.toThrow(Error(errorMsg));
      expect(error).toHaveBeenCalledWith(errorMsg);
    });

    it('should throw an error and log when the send batch message command fails', async () => {
      // Arrange
      const mockMessageBody = 'testMessageBody';

      const errorMsg = 'SQS Error';
      sqsMock.on(SendMessageBatchCommand).rejects(new Error(errorMsg));

      // Act
      const result = queueService.publishMessageBatch([[mockMessageBody]]);

      // Assert
      await expect(result).rejects.toThrow(new Error(errorMsg));
      expect(error).toHaveBeenCalledWith(`Error publishing to SQS - Error: ${errorMsg}`);
    });
  });
});
