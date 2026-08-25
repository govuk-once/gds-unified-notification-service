import { MetricUnit } from '@aws-lambda-powertools/metrics';
import { MetricsLabels } from '@common/services/observabilityService';
import { ProcessingQueueService } from '@common/services/processingQueueService';
import { StringParameters } from '@common/utils';
import {
  mockDefaultConfig,
  mockGetParameterImplementation,
} from '@common/utils/mockConfigurationImplementation.test.util';
import { iocSpies } from '@common/utils/mockInstanceFactory.test.util';
import { IMessage } from '@project/lambdas/interfaces/IMessage';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });
vi.mock('@aws-sdk/client-sqs', { spy: true });
vi.mock('@common/services/configurationService', { spy: true });

describe('ProcessingQueueService', () => {
  let processingQueueService: ProcessingQueueService;

  // Initialize mock services, clients, and repositories
  const { observabilityMocks, awsClientMocks, serviceMocks } = iocSpies();

  // Mocking implementation of the configuration service
  let mockParameterStore = mockDefaultConfig();

  const mockMessageBody = {
    NotificationID: '2536bd9b-611b-453c-ba3d-e34783e4c9d1',
    DepartmentID: 'DVLA01',
    UserID: 'UserID',
    MessageTitle: 'You have a new Message',
    MessageBody: 'Open Notification Centre to read your notifications',
    NotificationTitle: 'You have a new medical driving license',
    NotificationBody: 'The DVLA has issued you a new license.',
    OrganisationID: 'ORD01',
  };

  beforeEach(async () => {
    // Reset all mock
    vi.clearAllMocks();

    // Mock SSM Values
    mockParameterStore = mockDefaultConfig();
    serviceMocks.configurationServiceMock.getParameter.mockImplementation(
      mockGetParameterImplementation(mockParameterStore)
    );

    processingQueueService = new ProcessingQueueService(
      serviceMocks.configurationServiceMock,
      awsClientMocks.sqsClientMock,
      observabilityMocks
    );
    await processingQueueService.initialize();
  });

  describe('getQueueName', () => {
    it('should return the correct queue name', () => {
      // Act
      const result = processingQueueService.getQueueName();

      // Assert
      expect(result).toBe('processing');
    });
  });

  describe('initialize', () => {
    it('should retrieve the queue url and log when the processing queue service is initialised.', async () => {
      // Act
      const result = await processingQueueService.initialize();

      // Assert
      expectTypeOf(result).toEqualTypeOf<ProcessingQueueService>();

      // Assert
      expect(observabilityMocks.logger.info).toHaveBeenCalledWith('Processing Queue Service Initialised.');
    });
  });

  describe('publishMessage', () => {
    it('should send a message when given the message params and adds a metric.', async () => {
      // Arrange
      awsClientMocks.sqsClientMock.send = vi.fn().mockResolvedValueOnce({
        MessageId: 'message-1',
      });

      // Act
      await processingQueueService.publishMessage(mockMessageBody);

      // Assert
      expect(awsClientMocks.sqsClientMock.send).toHaveBeenCalledTimes(1);
      expect(awsClientMocks.sqsClientMock.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            QueueUrl: mockParameterStore[StringParameters.Queue.Processing.Url],
            DelaySeconds: 0,
            MessageBody: JSON.stringify(mockMessageBody),
          }),
        })
      );
      expect(observabilityMocks.metrics.addMetric).toHaveBeenCalledWith(
        MetricsLabels.QUEUE_PROCESSING_PUBLISHED_SUCCESSFULLY,
        MetricUnit.Count,
        1
      );
    });

    it('should throw an error and log when the send message command fails and adds a metric', async () => {
      // Arrange
      const error = new Error('SQS Error');
      awsClientMocks.sqsClientMock.send = vi.fn().mockRejectedValueOnce(error);

      // Act
      const result = processingQueueService.publishMessage(mockMessageBody);

      // Assert
      await expect(result).rejects.toThrow(error);
      expect(observabilityMocks.logger.error).toHaveBeenCalledWith('Error publishing to SQS', { error: error.message });
      expect(observabilityMocks.metrics.addMetric).toHaveBeenCalledWith(
        MetricsLabels.QUEUE_PROCESSING_PUBLISHED_FAILED,
        MetricUnit.Count,
        1
      );
    });
  });

  describe('publishBatchMessage', () => {
    it('should send a batch of messages when given the message params and adds a metric.', async () => {
      // Arrange
      awsClientMocks.sqsClientMock.send = vi.fn().mockResolvedValueOnce({
        Successful: [{ MessageId: 'message_0', Id: mockMessageBody.NotificationID, MD5OfMessageBody: 'X' }],
      });

      // Act
      await processingQueueService.publishMessageBatch([mockMessageBody]);

      // Assert
      expect(awsClientMocks.sqsClientMock.send).toHaveBeenCalledTimes(1);
      expect(awsClientMocks.sqsClientMock.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            QueueUrl: mockParameterStore[StringParameters.Queue.Processing.Url],
            Entries: [
              {
                Id: '0',
                DelaySeconds: 0,
                MessageBody: JSON.stringify(mockMessageBody),
              },
            ],
          }),
        })
      );
      expect(observabilityMocks.logger.info).toHaveBeenCalledWith('Successfully published messages', {
        successfulMessageCount: 1,
      });
      expect(observabilityMocks.metrics.addMetric).toHaveBeenCalledWith(
        MetricsLabels.QUEUE_PROCESSING_PUBLISHED_SUCCESSFULLY,
        MetricUnit.Count,
        1
      );
    });

    it('should send a batch of messages, logs any that were failed to be sent, and adds a metric.', async () => {
      // Arrange
      const mockMessageBody_0 = {
        NotificationID: '2536bd9b-611b-453c-ba3d-e34783e4c9d1',
        DepartmentID: 'DVLA01',
        UserID: 'UserID',
        MessageTitle: 'You have a new Message',
        MessageBody: 'Open Notification Centre to read your notifications',
        NotificationTitle: 'You have a new medical driving license',
        NotificationBody: 'The DVLA has issued you a new license.',
        OrganisationID: 'ORD01',
      };
      const mockMessageBody_1 = {
        NotificationID: '2536bd9b-611b-453c-ba3d-e34783e4c9d1',
        DepartmentID: 'DVLA01',
        UserID: 'UserID-1',
        MessageTitle: 'You have a new Message',
        MessageBody: 'Open Notification Centre to read your notifications',
        NotificationTitle: 'You have a new medical driving license',
        NotificationBody: 'The DVLA has issued you a new license.',
        OrganisationID: 'ORD01',
      };

      awsClientMocks.sqsClientMock.send = vi.fn().mockResolvedValueOnce({
        Successful: [{ MessageId: 'message_0', Id: '0', MD5OfMessageBody: 'X' }],
        Failed: [{ Id: '1', SenderFault: false, Code: 'MockCode' }],
      });

      // Act
      await processingQueueService.publishMessageBatch([mockMessageBody_0, mockMessageBody_1]);

      // Assert
      expect(awsClientMocks.sqsClientMock.send).toHaveBeenCalledTimes(1);
      expect(awsClientMocks.sqsClientMock.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            QueueUrl: mockParameterStore[StringParameters.Queue.Processing.Url] as string,
            Entries: [
              {
                Id: '0',
                DelaySeconds: 0,
                MessageBody: JSON.stringify(mockMessageBody_0),
              },
              {
                Id: '1',
                DelaySeconds: 0,
                MessageBody: JSON.stringify(mockMessageBody_1),
              },
            ],
          }),
        })
      );
      expect(observabilityMocks.logger.error).toHaveBeenCalledWith('Failed to publish messages in batch', {
        failedMessageCount: 1,
        failures: [
          {
            Code: 'MockCode',
            Id: '1',
            SenderFault: false,
          },
        ],
      });
      expect(observabilityMocks.metrics.addMetric).toHaveBeenCalledWith(
        MetricsLabels.QUEUE_PROCESSING_PUBLISHED_FAILED,
        MetricUnit.Count,
        1
      );
    });

    it('should throw an error and log when the send batch message command fails', async () => {
      // Arrange
      const error = new Error('SQS Error');
      awsClientMocks.sqsClientMock.send = vi.fn().mockRejectedValueOnce(error);

      // Act
      const result = processingQueueService.publishMessageBatch([mockMessageBody]);

      // Assert
      await expect(result).rejects.toThrow(error);
      expect(observabilityMocks.logger.error).toHaveBeenCalledWith('Error publishing to SQS', { error: error.message });
    });

    it('should use the index of the for loop of the batch processing as the batch entry Id', async () => {
      // Arrange
      awsClientMocks.sqsClientMock.send = vi.fn().mockResolvedValueOnce({
        Successful: [{ MessageId: 'message_0', Id: '0', MD5OfMessageBody: 'X' }],
      });

      // Act
      await processingQueueService.publishMessageBatch([mockMessageBody]);

      // Assert
      expect(awsClientMocks.sqsClientMock.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            QueueUrl: mockParameterStore[StringParameters.Queue.Processing.Url] as string,
            Entries: expect.arrayContaining([
              expect.objectContaining({
                Id: '0',
              }),
            ]),
          }),
        })
      );
    });

    it('should split messages into batches of 10 when more than 10 messages are sent', async () => {
      // Arrange
      const mockMessageList: IMessage[] = Array.from({ length: 11 }, (_, i) => ({
        ...mockMessageBody,
        NotificationID: `notifiction-${i}`,
        UserId: i,
      }));
      awsClientMocks.sqsClientMock.send = vi.fn().mockResolvedValue({
        Successful: [{ MessageId: 'message_0', Id: '0', MD5OfMessageBody: 'X' }],
      });

      // Act
      await processingQueueService.publishMessageBatch(mockMessageList);

      // Assert
      expect(awsClientMocks.sqsClientMock.send).toHaveBeenCalledTimes(2);
      const firstCall = vi.mocked(awsClientMocks.sqsClientMock.send).mock.calls[0][0] as { input: { Entries: unknown[] } };
      const secondCall = vi.mocked(awsClientMocks.sqsClientMock.send).mock.calls[1][0] as {
        input: { Entries: unknown[] };
      };

      expect(firstCall.input.Entries).toHaveLength(10);
      expect(secondCall.input.Entries).toHaveLength(1);
    });
  });
});
