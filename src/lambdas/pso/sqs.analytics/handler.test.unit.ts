import { FullBatchFailureError } from '@aws-lambda-powertools/batch';
import { NotificationStateEnum } from '@common/models';
import { QueueEvent } from '@common/operations/queueOperation';
import { IAnalytics } from '@project/lambdas/interfaces';
import { Analytics } from '@project/lambdas/pso/sqs.analytics/handler';
import {
  iocSpies,
  mockEventContext,
  mockFailedIAnalytics,
  mockIAnalytics,
  mockQueueEvent,
  mockQueueMultiEvents,
  mockServicesExpectedBehaviour,
} from '@test/mocks';
import { Context } from 'aws-lambda';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/services', { spy: true });
vi.mock('@common/repositories', { spy: true });

describe('Analytics QueueHandler', async () => {
  // Initialize mock services, clients, and repositories
  const { observabilityMocks, serviceMocks } = await iocSpies();

  let instance: Analytics;
  let handler: ReturnType<typeof Analytics.prototype.handler>;

  // Test Fixtures
  let context: Context;
  let event: QueueEvent<IAnalytics>;

  const message = mockIAnalytics(NotificationStateEnum.RECEIVED);
  const failedMessage = mockFailedIAnalytics();

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Test Fixtures
    context = mockEventContext('analytics');
    event = mockQueueEvent(message);

    // Mock SSM store and services responses
    mockServicesExpectedBehaviour(serviceMocks);

    instance = new Analytics(serviceMocks.configurationServiceMock, observabilityMocks, () => ({
      cache: Promise.resolve(serviceMocks.cacheServiceMock),
      notifications: Promise.resolve(serviceMocks.notificationsDynamoRepositoryMock),
      campaigns: Promise.resolve(serviceMocks.campaignsDynamoRepositoryMock),
      analyticsExportService: Promise.resolve(serviceMocks.analyticsExportServiceMock),
    }));
    handler = instance.handler();
  });

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('analytics');
  });

  it('should process valid records and store analytics events in DynamoDB', async () => {
    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.notificationsDynamoRepositoryMock.addEvent).toHaveBeenCalledTimes(1);
    expect(serviceMocks.notificationsDynamoRepositoryMock.addEvent).toHaveBeenCalledWith(message);
  });

  it('should process valid records and update cache to processing', async () => {
    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.cacheServiceMock.store).toHaveBeenCalledTimes(1);
    expect(serviceMocks.cacheServiceMock.store).toHaveBeenCalledWith(
      '/DEP1/7351e7c8-7314-4d2b-a590-4f053c6ef80f/Status',
      message.Event
    );
  });

  it('should process valid records and handle missing values', async () => {
    // Arrange
    const missingEventBody = { ...message, Event: undefined } as unknown as IAnalytics;
    const missingEventEvent = mockQueueEvent(missingEventBody);

    // Act
    await handler(missingEventEvent, context);

    // Assert
    expect(serviceMocks.notificationsDynamoRepositoryMock.addEvent).toHaveBeenCalledTimes(1);
    expect(serviceMocks.notificationsDynamoRepositoryMock.addEvent).toHaveBeenCalledWith({
      ...missingEventBody,
      Event: NotificationStateEnum.UNKNOWN,
    });
    expect(serviceMocks.cacheServiceMock.store).toHaveBeenCalledTimes(1);
    expect(serviceMocks.cacheServiceMock.store).toHaveBeenCalledWith(
      '/DEP1/7351e7c8-7314-4d2b-a590-4f053c6ef80f/Status',
      NotificationStateEnum.UNKNOWN
    );
  });

  it('should export processed analytics to cloudwatch', async () => {
    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.analyticsExportServiceMock.logAnalytics).toHaveBeenCalledTimes(1);
    expect(serviceMocks.analyticsExportServiceMock.logAnalytics).toHaveBeenCalledWith(message);
  });

  it('should increment campaign if a campaignID is provided in the analytics', async () => {
    // Arrange
    const withCampaign = { ...message, CampaignID: 'CAMP01' };
    const campaignEvent = mockQueueEvent(withCampaign);

    // Act
    await handler(campaignEvent, context);

    // Assert
    expect(serviceMocks.campaignsDynamoRepositoryMock.incrementCampaigns).toHaveBeenCalledTimes(1);
    expect(serviceMocks.campaignsDynamoRepositoryMock.incrementCampaigns).toHaveBeenCalledWith(
      withCampaign.CampaignID,
      withCampaign.OrganisationID,
      withCampaign.DepartmentID,
      withCampaign.Event
    );
  });

  it('should process all valid analytics records and reject any that are invalid', async () => {
    // Arrange
    const event = mockQueueMultiEvents([message, failedMessage]);

    //  Act
    const result = await handler(event, context);

    // Assert
    expect(result).toEqual({
      batchItemFailures: [
        {
          itemIdentifier: 'mockMessageId_1',
        },
      ],
    });
    expect(serviceMocks.notificationsDynamoRepositoryMock.addEvent).toHaveBeenCalledTimes(1);
    expect(serviceMocks.cacheServiceMock.store).toHaveBeenCalledTimes(1);
  });

  it('should throw an error for invalid records', async () => {
    // Arrange
    const failedEvent = mockQueueEvent(failedMessage);

    //  Act
    const result = handler(failedEvent, context);

    // Assert
    await expect(result).rejects.toThrow(FullBatchFailureError);
    expect(serviceMocks.notificationsDynamoRepositoryMock.addEvent).not.toHaveBeenCalled();
    expect(serviceMocks.cacheServiceMock.store).not.toHaveBeenCalled();
  });
});
