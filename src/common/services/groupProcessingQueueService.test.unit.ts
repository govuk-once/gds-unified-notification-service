import { MetricUnit } from '@aws-lambda-powertools/metrics';
import { GroupProcessingQueueService } from '@common/services/groupProcessingQueueService';
import { MetricsLabels } from '@common/services/observabilityService';
import { StringParameters } from '@common/utils';
import {
  mockDefaultConfig,
  mockGetParameterImplementation,
} from '@common/utils/mockConfigurationImplementation.test.util';
import { awsClientSpies, observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import { IGroupMessage, IGroupMessageMetadata } from '@project/lambdas';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });
vi.mock('@aws-sdk/client-sqs', { spy: true });
vi.mock('@common/services/configurationService', { spy: true });

describe('GroupProcessingQueueService', () => {
  let groupProcessingQueueService: GroupProcessingQueueService;

  // Initialize the mock service and repository layers
  const observabilityMock = observabilitySpies();
  const clientMocks = awsClientSpies();
  const serviceMocks = ServiceSpies(observabilityMock, clientMocks);

  // Mocking implementation of the configuration service
  let mockParameterStore = mockDefaultConfig();

  const mockGroupMessage: IGroupMessage = {
    Namespace: 'travel',
    Group: 'france',
    Subgroup: 'immediate',
    GroupNotificationID: 'TO_GROUP_ID',
    OrganisationID: 'ORG_01',
    CampaignID: 'CAM_ID',
    MessageTitle: 'You have a new Message',
    MessageBody: 'Open Notification Centre to read your notifications',
    NotificationTitle: 'You have a new Notification',
    NotificationBody: 'Here is the Notification body.',
  };
  const mockGroupMessageMetadata: IGroupMessageMetadata = {
    GroupMessage: mockGroupMessage,
    GroupNotificationID: mockGroupMessage.GroupNotificationID,
    WorkerID: 0,
    CacheKey: `Worker/GroupProcessingWorker/${mockGroupMessage.GroupNotificationID}/0`,
  };

  beforeEach(async () => {
    // Reset all mock
    vi.clearAllMocks();

    // Mock SSM Values
    mockParameterStore = mockDefaultConfig();
    serviceMocks.configurationServiceMock.getParameter.mockImplementation(
      mockGetParameterImplementation(mockParameterStore)
    );

    groupProcessingQueueService = new GroupProcessingQueueService(
      serviceMocks.configurationServiceMock,
      clientMocks.sqsClientMock,
      observabilityMock
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
      expect(observabilityMock.logger.info).toHaveBeenCalledWith('Group Processing Queue Service Initialised.');
    });
  });

  describe('publishMessage', () => {
    it('should send a message when given the message params and adds a metric.', async () => {
      // Arrange
      clientMocks.sqsClientMock.send = vi.fn().mockResolvedValueOnce({
        MessageId: 'message-1',
      });

      // Act
      await groupProcessingQueueService.publishMessage(mockGroupMessageMetadata);

      // Assert
      expect(clientMocks.sqsClientMock.send).toHaveBeenCalledTimes(1);
      expect(clientMocks.sqsClientMock.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            QueueUrl: mockParameterStore[StringParameters.Queue.GroupProcessing.Url],
            DelaySeconds: 0,
            MessageBody: JSON.stringify(mockGroupMessageMetadata),
          }),
        })
      );
      expect(observabilityMock.metrics.addMetric).toHaveBeenCalledWith(
        MetricsLabels.QUEUE_GROUP_PROCESSING_PUBLISHED_SUCCESSFULLY,
        MetricUnit.Count,
        1
      );
    });

    it('should throw an error and log when the send message command fails and adds a metric', async () => {
      // Arrange
      const error = new Error('SQS Error');
      clientMocks.sqsClientMock.send = vi.fn().mockRejectedValueOnce(error);

      // Act
      const result = groupProcessingQueueService.publishMessage(mockGroupMessageMetadata);

      // Assert
      await expect(result).rejects.toThrow(error);
      expect(observabilityMock.logger.error).toHaveBeenCalledWith('Error publishing to SQS', { error: error.message });
      expect(observabilityMock.metrics.addMetric).toHaveBeenCalledWith(
        MetricsLabels.QUEUE_GROUP_PROCESSING_PUBLISHED_FAILED,
        MetricUnit.Count,
        1
      );
    });
  });
});
