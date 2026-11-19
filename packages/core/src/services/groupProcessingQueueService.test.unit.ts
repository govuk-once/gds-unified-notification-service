import { MetricUnit } from '@aws-lambda-powertools/metrics';
import { InternalServerError } from '@common/models/Errors/InternalServerError';
import { GroupProcessingQueueService } from '@common/services/groupProcessingQueueService';
import { MetricsLabels } from '@common/services/observabilityService';
import { mockIGroupMessageMetadata } from '@common/models/interfaces';
import SSMParameters from '@shared/ssmParameter';
import { iocSpies, mockDefaultConfig, mockServicesExpectedBehaviour } from '@test/mocks';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });
vi.mock('@aws-sdk/client-sqs', { spy: true });

vi.mock('@common/services/configurationService', { spy: true });
vi.mock('@common/services/smConfigurationService', { spy: true });

describe('GroupProcessingQueueService', async () => {
  let groupProcessingQueueService: GroupProcessingQueueService;

  // Initialize mock services, clients, and repositories
  const { observabilityMocks, awsClientMocks, serviceMocks } = await iocSpies();

  // Mocking implementation of the configuration service
  let mockParameterStore = mockDefaultConfig();

  // Test Fixtures
  const groupMessageMetadata = mockIGroupMessageMetadata();

  beforeEach(async () => {
    // Reset all mock
    vi.clearAllMocks();

    // Mock SSM store and services responses
    const { resetMockParameterStore } = mockServicesExpectedBehaviour(serviceMocks);
    mockParameterStore = resetMockParameterStore;

    groupProcessingQueueService = await GroupProcessingQueueService.create(
      serviceMocks.configurationServiceMock,
      observabilityMocks,
      awsClientMocks.sqsClientMock
    );
  });

  describe('getQueueName', () => {
    it('should return the correct queue name', () => {
      // Act
      const result = groupProcessingQueueService.getQueueName();

      // Assert
      expect(result).toBe('groupprocessing');
    });
  });

  describe('initialize', () => {
    it('should retrieve the queue url and log when the processing queue service is initialised.', async () => {
      // Act
      const result = await GroupProcessingQueueService.create(
        serviceMocks.configurationServiceMock,
        observabilityMocks,
        awsClientMocks.sqsClientMock
      );

      // Assert
      expect(serviceMocks.configurationServiceMock.getParameter).toHaveBeenCalledWith(
        SSMParameters.Queue.GroupProcessing.Url
      );
      expect(result).toBeInstanceOf(GroupProcessingQueueService);
    });
  });

  describe('publishMessageBatch', () => {
    type SentCall = [{ input: { Entries: { Id: string; MessageBody: string }[] } }];
    const sentBatches = () =>
      (awsClientMocks.sqsClientMock.send.mock.calls as unknown as SentCall[]).map(([command]) => command.input.Entries);

    it('should send at most 10 entries per SendMessageBatch call', async () => {
      // Arrange
      awsClientMocks.sqsClientMock.send = vi.fn().mockResolvedValue({ Successful: [] });
      const messages = Array.from({ length: 25 }, () => groupMessageMetadata);

      // Act
      await groupProcessingQueueService.publishMessageBatch(messages);

      // Assert
      expect(sentBatches().map((entries) => entries.length)).toEqual([10, 10, 5]);
    });

    it('should split batches so that the total payload of each call stays under the 256 KiB SQS limit', async () => {
      // Arrange
      awsClientMocks.sqsClientMock.send = vi.fn().mockResolvedValue({ Successful: [] });
      const largeMessage = { ...groupMessageMetadata, PushIDs: Array.from({ length: 6000 }, () => 'a'.repeat(36)) };
      const messageBytes = Buffer.byteLength(JSON.stringify(largeMessage), 'utf8');
      const messages = Array.from({ length: 10 }, () => largeMessage);

      // Act
      await groupProcessingQueueService.publishMessageBatch(messages);

      // Assert
      const batches = sentBatches();
      expect(batches.length).toBeGreaterThan(1);
      expect(batches.flat()).toHaveLength(10);
      for (const entries of batches) {
        expect(entries.length * messageBytes).toBeLessThanOrEqual(262144);
      }
    });

    describe('when SQS rejects some entries in a send call', () => {
      beforeEach(() => {
        vi.useFakeTimers();
      });
      afterEach(() => {
        vi.useRealTimers();
      });

      const publish = async (messages: (typeof groupMessageMetadata)[]) => {
        const outcome = groupProcessingQueueService.publishMessageBatch(messages).then(
          () => 'resolved' as const,
          (error: unknown) => error
        );
        await vi.runAllTimersAsync();
        return outcome;
      };

      it('should resend only the failed entries and resolve once they succeed', async () => {
        // Arrange
        awsClientMocks.sqsClientMock.send = vi
          .fn()
          .mockResolvedValueOnce({
            Successful: [{ Id: '0' }, { Id: '2' }],
            Failed: [{ Id: '1', SenderFault: false, Code: 'ServiceUnavailable' }],
          })
          .mockResolvedValueOnce({ Successful: [{ Id: '1' }] });

        // Act
        const outcome = await publish([groupMessageMetadata, groupMessageMetadata, groupMessageMetadata]);

        // Assert
        expect(outcome).toBe('resolved');
        expect(sentBatches()).toHaveLength(2);
        expect(sentBatches()[1].map((entry) => entry.Id)).toEqual(['1']);
        expect(observabilityMocks.metrics.addMetric).not.toHaveBeenCalledWith(
          MetricsLabels.QUEUE_GROUP_PROCESSING_PUBLISHED_FAILED,
          MetricUnit.Count,
          expect.anything()
        );
      });

      it('should throw and add a failed metric when entries still fail after all attempts', async () => {
        // Arrange
        awsClientMocks.sqsClientMock.send = vi.fn().mockResolvedValue({
          Failed: [{ Id: '0', SenderFault: false, Code: 'ServiceUnavailable' }],
        });

        // Act
        const outcome = await publish([groupMessageMetadata]);

        // Assert
        expect(outcome).toBeInstanceOf(InternalServerError);
        expect(awsClientMocks.sqsClientMock.send).toHaveBeenCalledTimes(3);
        expect(observabilityMocks.metrics.addMetric).toHaveBeenCalledWith(
          MetricsLabels.QUEUE_GROUP_PROCESSING_PUBLISHED_FAILED,
          MetricUnit.Count,
          1
        );
      });

      it('should not retry entries rejected because of a sender fault', async () => {
        // Arrange
        awsClientMocks.sqsClientMock.send = vi.fn().mockResolvedValue({
          Failed: [{ Id: '0', SenderFault: true, Code: 'InvalidParameterValue' }],
        });

        // Act
        const outcome = await publish([groupMessageMetadata]);

        // Assert
        expect(outcome).toBeInstanceOf(InternalServerError);
        expect(awsClientMocks.sqsClientMock.send).toHaveBeenCalledTimes(1);
      });
    });

    it('should attempt every send call and still throw when one of them fails', async () => {
      // Arrange
      awsClientMocks.sqsClientMock.send = vi
        .fn()
        .mockRejectedValueOnce(new Error('SQS down'))
        .mockResolvedValue({ Successful: [] });
      const messages = Array.from({ length: 25 }, () => groupMessageMetadata);

      // Act
      const outcome = await groupProcessingQueueService.publishMessageBatch(messages).catch((error: unknown) => error);

      // Assert
      expect(outcome).toEqual(new Error('SQS down'));
      expect(awsClientMocks.sqsClientMock.send).toHaveBeenCalledTimes(3);
    });

    it('should send calls concurrently, with a limit on how many are in flight', async () => {
      // Arrange
      let inFlight = 0;
      let maxInFlight = 0;
      awsClientMocks.sqsClientMock.send = vi.fn().mockImplementation(async () => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight--;
        return { Successful: [] };
      });

      // Act
      await groupProcessingQueueService.publishMessageBatch(Array.from({ length: 200 }, () => groupMessageMetadata));

      // Assert
      expect(awsClientMocks.sqsClientMock.send).toHaveBeenCalledTimes(20);
      expect(maxInFlight).toBeGreaterThan(1);
      expect(maxInFlight).toBeLessThanOrEqual(5);
    });

    it('should number entry ids from 0 within each batch', async () => {
      // Arrange
      awsClientMocks.sqsClientMock.send = vi.fn().mockResolvedValue({ Successful: [] });

      // Act
      await groupProcessingQueueService.publishMessageBatch(Array.from({ length: 12 }, () => groupMessageMetadata));

      // Assert
      expect(sentBatches().map((entries) => entries[0].Id)).toEqual(['0', '0']);
    });
  });

  describe('publishMessage', () => {
    it('should send a message when given the message params and adds a metric.', async () => {
      // Arrange
      awsClientMocks.sqsClientMock.send = vi.fn().mockResolvedValueOnce({
        MessageId: 'message-1',
      });

      // Act
      await groupProcessingQueueService.publishMessage(groupMessageMetadata);

      // Assert
      expect(awsClientMocks.sqsClientMock.send).toHaveBeenCalledTimes(1);
      expect(awsClientMocks.sqsClientMock.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            QueueUrl: mockParameterStore[SSMParameters.Queue.GroupProcessing.Url.Path],
            DelaySeconds: 0,
            MessageBody: JSON.stringify(groupMessageMetadata),
          }),
        })
      );
      expect(observabilityMocks.metrics.addMetric).toHaveBeenCalledWith(
        MetricsLabels.QUEUE_GROUP_PROCESSING_PUBLISHED_SUCCESSFULLY,
        MetricUnit.Count,
        1
      );
    });

    it('should throw an error and log when the send message command fails and adds a metric', async () => {
      // Arrange
      const error = new Error('SQS Error');
      awsClientMocks.sqsClientMock.send = vi.fn().mockRejectedValueOnce(error);

      // Act
      const result = groupProcessingQueueService.publishMessage(groupMessageMetadata);

      // Assert
      await expect(result).rejects.toThrow(error);
      expect(observabilityMocks.logger.error).toHaveBeenCalledWith('Error publishing to SQS', { error: error.message });
      expect(observabilityMocks.metrics.addMetric).toHaveBeenCalledWith(
        MetricsLabels.QUEUE_GROUP_PROCESSING_PUBLISHED_FAILED,
        MetricUnit.Count,
        1
      );
    });
  });
});
