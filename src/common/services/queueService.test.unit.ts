import { MessageAttributeValue, SendMessageBatchCommand, SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { QueueService } from '@common/services/queueService';
import { mockClient } from 'aws-sdk-client-mock';
import { toHaveReceivedCommandWith } from 'aws-sdk-client-mock-vitest';

expect.extend({
  toHaveReceivedCommandWith,
});

const sqsMock = mockClient(SQSClient);
const mockQueueUrl = 'testQueueUrl';
const config = new QueueService(mockQueueUrl);

describe('QueueService', () => {
  beforeEach(() => {
    sqsMock.reset();
  });

  describe('publishMessage', () => {
    it('should send a message when given the message params.', async () => {
      // Arrange
      const mockMessageAttribute = { Title: { DataType: 'String', StringValue: 'testMessageTitle' } };
      const mockMessageBody = 'testMessageBody';

      sqsMock.on(SendMessageCommand).resolves({
        MessageId: 'message-1',
      });

      // Act
      await config.publishMessage(mockMessageAttribute, mockMessageBody);

      // Assert
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      expect(sqsMock).toHaveReceivedCommandWith(SendMessageCommand, {
        QueueUrl: mockQueueUrl,
        DelaySeconds: 0,
        MessageBody: mockMessageBody,
        MessageAttributes: mockMessageAttribute,
      });
    });

    it('should throw an error and log when the send message command fails', async () => {
      // Arrange
      const trace = vi.spyOn(config.logger, 'trace');
      const mockMessageAttribute = { Title: { DataType: 'String', StringValue: 'testMessageTitle' } };
      const mockMessageBody = 'testMessageBody';

      vi.spyOn(config.logger, 'trace');
      const error = new Error('SQS Error');
      sqsMock.on(SendMessageCommand).rejects(error);

      // Act
      const result = config.publishMessage(mockMessageAttribute, mockMessageBody);

      // Assert
      await expect(result).rejects.toThrow(error);
      expect(trace).toHaveBeenCalledWith(`SQS Publish Error: ${error}`);
    });
  });

  describe('publishBatchMessage', () => {
    it('should send a batch of messages when given the message params.', async () => {
      // Arrange
      const trace = vi.spyOn(config.logger, 'trace');
      const mockMessageAttribute = { Title: { DataType: 'String', StringValue: 'testMessageTitle' } };
      const mockMessageBody = 'testMessageBody';

      sqsMock.on(SendMessageBatchCommand).resolves({
        Successful: [{ MessageId: 'message_0', Id: 'msg_0', MD5OfMessageBody: 'X' }],
      });

      // Act
      await config.publishMessageBatch([[mockMessageAttribute, mockMessageBody]]);

      // Assert
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      expect(sqsMock).toHaveReceivedCommandWith(SendMessageBatchCommand, {
        QueueUrl: mockQueueUrl,
        Entries: [
          {
            Id: 'msg_0',
            DelaySeconds: 0,
            MessageBody: mockMessageBody,
            MessageAttributes: mockMessageAttribute,
          },
        ],
      });
      expect(trace).toHaveBeenCalledWith('Successfully published 1 messages.');
    });

    it('should send a batch of messages and log any that were failed to be sent.', async () => {
      // Arrange
      const trace = vi.spyOn(config.logger, 'trace');
      const mockMessageAttribute = { Title: { DataType: 'String', StringValue: 'testMessageTitle' } };
      const mockMessageBody_0 = 'testMessageBody';
      const mockMessageBody_1 = 'testMessageBody';

      sqsMock.on(SendMessageBatchCommand).resolves({
        Successful: [{ MessageId: 'message_0', Id: 'msg_0', MD5OfMessageBody: 'X' }],
        Failed: [{ Id: 'msg_1', SenderFault: false, Code: 'MockCode' }],
      });

      // Act
      await config.publishMessageBatch([
        [mockMessageAttribute, mockMessageBody_0],
        [mockMessageAttribute, mockMessageBody_1],
      ]);

      // Assert
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      expect(sqsMock).toHaveReceivedCommandWith(SendMessageBatchCommand, {
        QueueUrl: mockQueueUrl,
        Entries: [
          {
            Id: 'msg_0',
            DelaySeconds: 0,
            MessageBody: mockMessageBody_0,
            MessageAttributes: mockMessageAttribute,
          },
          {
            Id: 'msg_1',
            DelaySeconds: 0,
            MessageBody: mockMessageBody_1,
            MessageAttributes: mockMessageAttribute,
          },
        ],
      });
      expect(trace).toHaveBeenCalledWith('Failed to publish 1 messages.');
    });

    it('should throw an error when more than 10 messages are send in a batch.', async () => {
      // Arrange
      const trace = vi.spyOn(config.logger, 'trace');
      const mockMessageAttribute = { Title: { DataType: 'String', StringValue: 'testMessageTitle' } };
      const mockMessageBody = 'testMessageBody';
      const mockMessageList: [Record<string, MessageAttributeValue>, string][] = [
        [mockMessageAttribute, mockMessageBody],
        [mockMessageAttribute, mockMessageBody],
        [mockMessageAttribute, mockMessageBody],
        [mockMessageAttribute, mockMessageBody],
        [mockMessageAttribute, mockMessageBody],
        [mockMessageAttribute, mockMessageBody],
        [mockMessageAttribute, mockMessageBody],
        [mockMessageAttribute, mockMessageBody],
        [mockMessageAttribute, mockMessageBody],
        [mockMessageAttribute, mockMessageBody],
        [mockMessageAttribute, mockMessageBody],
      ];

      const errorMsg = 'A single message batch request can include a maximum of 10 messages.';

      // Act
      const result = config.publishMessageBatch(mockMessageList);

      // Assert
      await expect(result).rejects.toThrow(Error(errorMsg));
      expect(trace).toHaveBeenCalledWith(errorMsg);
    });

    it('should throw an error and log when the send batch message command fails', async () => {
      // Arrange
      const trace = vi.spyOn(config.logger, 'trace');
      const mockMessageAttribute = { Title: { DataType: 'String', StringValue: 'testMessageTitle' } };
      const mockMessageBody = 'testMessageBody';

      vi.spyOn(config.logger, 'trace');
      const error = new Error('SQS Error');
      sqsMock.on(SendMessageBatchCommand).rejects(error);

      // Act
      const result = config.publishMessageBatch([[mockMessageAttribute, mockMessageBody]]);

      // Assert
      await expect(result).rejects.toThrow(error);
      expect(trace).toHaveBeenCalledWith(`SQS Publish Error: ${error}`);
    });
  });
});
