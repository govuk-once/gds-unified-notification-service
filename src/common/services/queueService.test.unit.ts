import { SendMessageBatchCommand, SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { QueueService } from '@common/services/queueService';
import { mockClient } from 'aws-sdk-client-mock';
import { toHaveReceivedCommandWith } from 'aws-sdk-client-mock-vitest';

expect.extend({
  toHaveReceivedCommandWith,
});

const sqsMock = mockClient(SQSClient);
const config = new QueueService();

describe('QueueService', () => {
  beforeEach(() => {
    sqsMock.reset();
  });

  describe('publishMessage', () => {
    it('should send a message when given the message params.', async () => {
      // Arrange
      const mockQueueUrl = 'testQueueUrl';
      const mockMessageTitle = 'testMessageTitle';
      const mockMessageAuthor = 'testMessageAuthor';
      const mockMessageBody = 'testMessageBody';

      sqsMock.on(SendMessageCommand).resolves({
        MessageId: 'message-1',
      });

      // Act
      await config.publishMessage(mockQueueUrl, mockMessageTitle, mockMessageAuthor, mockMessageBody);

      // Assert
      expect(sqsMock).toHaveReceivedCommandWith(SendMessageCommand, {
        QueueUrl: mockQueueUrl,
        DelaySeconds: 0,
        MessageBody: mockMessageBody,
        MessageAttributes: {
          Title: { DataType: 'String', StringValue: mockMessageTitle },
          Author: { DataType: 'String', StringValue: mockMessageAuthor },
        },
      });
    });

    it('should throw an error and log when the send message command fails', async () => {
      // Arrange
      const mockQueueUrl = 'testQueueUrl';
      const mockMessageTitle = 'testMessageTitle';
      const mockMessageAuthor = 'testMessageAuthor';
      const mockMessageBody = 'testMessageBody';

      vi.spyOn(config.logger, 'trace');
      const error = new Error('SQS Error');
      sqsMock.on(SendMessageCommand).rejects(error);

      // Act
      const result = config.publishMessage(mockQueueUrl, mockMessageTitle, mockMessageAuthor, mockMessageBody);

      // Assert
      await expect(result).rejects.toThrow(error);
      expect(config.logger.trace).toHaveBeenCalledWith(`SQS Publish Error: ${error}`);
    });
  });

  describe('publishBatchMessage', () => {
    it('should send a batch of messages when given the message params.', async () => {
      // Arrange
      const mockQueueUrl = 'testQueueUrl';
      const mockMessageTitle = 'testMessageTitle';
      const mockMessageAuthor = 'testMessageAuthor';
      const mockMessageBody = 'testMessageBody';

      sqsMock.on(SendMessageBatchCommand).resolves({
        Successful: [{ MessageId: 'message_0', Id: 'msg_0', MD5OfMessageBody: 'X' }],
      });

      // Act
      await config.publishMessageBatch(mockQueueUrl, mockMessageTitle, mockMessageAuthor, [mockMessageBody]);

      // Assert
      expect(sqsMock).toHaveReceivedCommandWith(SendMessageBatchCommand, {
        QueueUrl: mockQueueUrl,
        Entries: [
          {
            Id: 'msg_0',
            DelaySeconds: 0,
            MessageBody: mockMessageBody,
            MessageAttributes: {
              Title: { DataType: 'String', StringValue: mockMessageTitle },
              Author: { DataType: 'String', StringValue: mockMessageAuthor },
            },
          },
        ],
      });
      expect(config.logger.trace).toHaveBeenCalledWith('Successfully published 1 messages.');
    });

    it('should send a batch of messages and log any that were failed to be sent.', async () => {
      // Arrange
      const mockQueueUrl = 'testQueueUrl';
      const mockMessageTitle = 'testMessageTitle';
      const mockMessageAuthor = 'testMessageAuthor';
      const mockMessageBody_0 = 'testMessageBody';
      const mockMessageBody_1 = 'testMessageBody';

      sqsMock.on(SendMessageBatchCommand).resolves({
        Successful: [{ MessageId: 'message_0', Id: 'msg_0', MD5OfMessageBody: 'X' }],
        Failed: [{ Id: 'msg_1', SenderFault: false, Code: 'MockCode' }],
      });

      // Act
      await config.publishMessageBatch(mockQueueUrl, mockMessageTitle, mockMessageAuthor, [
        mockMessageBody_0,
        mockMessageBody_1,
      ]);

      // Assert
      expect(sqsMock).toHaveReceivedCommandWith(SendMessageBatchCommand, {
        QueueUrl: mockQueueUrl,
        Entries: [
          {
            Id: 'msg_0',
            DelaySeconds: 0,
            MessageBody: mockMessageBody_0,
            MessageAttributes: {
              Title: { DataType: 'String', StringValue: mockMessageTitle },
              Author: { DataType: 'String', StringValue: mockMessageAuthor },
            },
          },
          {
            Id: 'msg_1',
            DelaySeconds: 0,
            MessageBody: mockMessageBody_1,
            MessageAttributes: {
              Title: { DataType: 'String', StringValue: mockMessageTitle },
              Author: { DataType: 'String', StringValue: mockMessageAuthor },
            },
          },
        ],
      });
      expect(config.logger.trace).toHaveBeenCalledWith('Failed to publish 1 messages.');
    });

    it('should throw an error when more than 10 messages are send in a batch.', async () => {
      // Arrange
      const mockQueueUrl = 'testQueueUrl';
      const mockMessageTitle = 'testMessageTitle';
      const mockMessageAuthor = 'testMessageAuthor';
      const mockMessageBodyList = Array(11).fill('testMessageBody');

      const errorMsg = 'A single message batch request can include a maximum of 10 messages.'

      // Act
      const result = config.publishMessageBatch(mockQueueUrl, mockMessageTitle, mockMessageAuthor, mockMessageBodyList);

      // Assert
      await expect(result).rejects.toThrow(Error(errorMsg));
      expect(config.logger.trace).toHaveBeenCalledWith(errorMsg);
    });

    it('should throw an error and log when the send batch message command fails', async () => {
      // Arrange
      const mockQueueUrl = 'testQueueUrl';
      const mockMessageTitle = 'testMessageTitle';
      const mockMessageAuthor = 'testMessageAuthor';
      const mockMessageBody = 'testMessageBody';

      vi.spyOn(config.logger, 'trace');
      const error = new Error('SQS Error');
      sqsMock.on(SendMessageBatchCommand).rejects(error);

      // Act
      const result = config.publishMessageBatch(mockQueueUrl, mockMessageTitle, mockMessageAuthor, [mockMessageBody]);

      // Assert
      await expect(result).rejects.toThrow(error);
      expect(config.logger.trace).toHaveBeenCalledWith(`SQS Publish Error: ${error}`);
    });
  });
});
