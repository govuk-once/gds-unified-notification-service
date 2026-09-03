import { MetricUnit } from '@aws-lambda-powertools/metrics';
import { GroupProcessingQueueService } from '@common/services/groupProcessingQueueService';
import { MetricsLabels } from '@common/services/observabilityService';
import { StringParameters } from '@common/utils';
import { mockIGroupMessageMetadata } from '@project/lambdas';
import { iocSpies, mockDefaultConfig, mockServicesExpectedBehaviour } from '@test/mocks';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });
vi.mock('@aws-sdk/client-sqs', { spy: true });

vi.mock('@common/services/configurationService', { spy: true });

describe('GroupProcessingQueueService', () => {
  let groupProcessingQueueService: GroupProcessingQueueService;

  // Initialize mock services, clients, and repositories
  const { observabilityMocks, awsClientMocks, serviceMocks } = iocSpies();

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

    groupProcessingQueueService = new GroupProcessingQueueService(
      serviceMocks.configurationServiceMock,
      awsClientMocks.sqsClientMock,
      observabilityMocks
    );
    await groupProcessingQueueService.initialize();
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
      const result = await groupProcessingQueueService.initialize();

      // Assert
      expectTypeOf(result).toEqualTypeOf<GroupProcessingQueueService>();

      // Assert
      expect(observabilityMocks.logger.info).toHaveBeenCalledWith('Group Processing Queue Service Initialised.');
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
            QueueUrl: mockParameterStore[StringParameters.Queue.GroupProcessing.Url],
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
