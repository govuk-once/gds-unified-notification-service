import { FullBatchFailureError } from '@aws-lambda-powertools/batch';
import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import {
  mockDefaultConfig,
  mockGetParameterImplementation,
} from '@common/utils/mockConfigurationImplementation.test.util';
import { mockEventContext, mockQueueEvent, mockQueueMultiEvents } from '@common/utils/mockEvents.test.utils';
import { awsClientSpies, observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import { IAnalytics, mockFailedIAnalytics, mockIAnalytics } from '@project/lambdas/interfaces/IAnalyticsSchema';
import { Analytics } from '@project/lambdas/pso/sqs.analytics/handler';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });
vi.mock('@common/services', { spy: true });
vi.mock('@common/repositories', { spy: true });

describe('Analytics QueueHandler', () => {
  // Initialize the mock service and repository layers
  const observabilityMocks = observabilitySpies();
  const clientMocks = awsClientSpies();
  const serviceMocks = ServiceSpies(observabilityMocks, clientMocks);

  // Mocking implementation of the configuration service
  let mockParameterStore = mockDefaultConfig();

  let instance: Analytics;
  let handler: ReturnType<typeof Analytics.prototype.handler>;

  // Test Fixtures
  const context = mockEventContext('analytics');
  const messageBody = mockIAnalytics(NotificationStateEnum.RECEIVED);
  const failedMessageBody = mockFailedIAnalytics();

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Mock SSM Values
    mockParameterStore = mockDefaultConfig();
    serviceMocks.configurationServiceMock.getParameter.mockImplementation(
      mockGetParameterImplementation(mockParameterStore)
    );

    // Mocking successful completion of service functions
    serviceMocks.notificationsDynamoRepositoryMock.addEvent.mockResolvedValue(undefined);
    serviceMocks.cacheServiceMock.store.mockResolvedValue(undefined);
    serviceMocks.campaignsDynamoRepositoryMock.incrementCampaigns.mockResolvedValue(undefined);
    serviceMocks.analyticsExportServiceMock.logAnalytics.mockResolvedValue(undefined);

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
    // Arrange
    const event = mockQueueEvent(messageBody);

    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.notificationsDynamoRepositoryMock.addEvent).toHaveBeenCalledTimes(1);
    expect(serviceMocks.notificationsDynamoRepositoryMock.addEvent).toHaveBeenCalledWith(messageBody);
  });

  it('should process valid records and update cache to processing', async () => {
    // Arrange
    const event = mockQueueEvent(messageBody);

    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.cacheServiceMock.store).toHaveBeenCalledTimes(1);
    expect(serviceMocks.cacheServiceMock.store).toHaveBeenCalledWith(
      '/DEP1/7351e7c8-7314-4d2b-a590-4f053c6ef80f/Status',
      messageBody.Event
    );
  });

  it('should process valid records and handle missing values', async () => {
    // Arrange
    const validAnalyticsWithMissingValue = {
      ...messageBody,
      Event: undefined,
    } as unknown as IAnalytics;
    const event = mockQueueEvent(validAnalyticsWithMissingValue);
    const expectedCreatedTableRows = { ...validAnalyticsWithMissingValue, Event: NotificationStateEnum.UNKNOWN };

    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.notificationsDynamoRepositoryMock.addEvent).toHaveBeenCalledTimes(1);
    expect(serviceMocks.notificationsDynamoRepositoryMock.addEvent).toHaveBeenCalledWith(expectedCreatedTableRows);
    expect(serviceMocks.cacheServiceMock.store).toHaveBeenCalledTimes(1);
    expect(serviceMocks.cacheServiceMock.store).toHaveBeenCalledWith(
      '/DEP1/7351e7c8-7314-4d2b-a590-4f053c6ef80f/Status',
      NotificationStateEnum.UNKNOWN
    );
  });

  it('should export processed analytics to cloudwatch', async () => {
    // Arrange
    const event = mockQueueEvent(messageBody);

    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.analyticsExportServiceMock.logAnalytics).toHaveBeenCalledTimes(1);
    expect(serviceMocks.analyticsExportServiceMock.logAnalytics).toHaveBeenCalledWith(messageBody);
  });

  it('should increment campaign if a campaignID is provided in the analytics', async () => {
    // Arrange
    const analyticsWithCampaignID = {
      ...messageBody,
      CampaignID: 'CAMP01',
    };
    const event = mockQueueEvent(analyticsWithCampaignID);

    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.campaignsDynamoRepositoryMock.incrementCampaigns).toHaveBeenCalledTimes(1);
    expect(serviceMocks.campaignsDynamoRepositoryMock.incrementCampaigns).toHaveBeenCalledWith(
      analyticsWithCampaignID.CampaignID,
      analyticsWithCampaignID.OrganisationID,
      analyticsWithCampaignID.DepartmentID,
      analyticsWithCampaignID.Event
    );
  });

  it('should process all valid analytics records and reject any that are invalid', async () => {
    // Arrange
    const event = mockQueueMultiEvents([messageBody, failedMessageBody]);

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
    const event = mockQueueEvent(failedMessageBody);

    //  Act
    const result = handler(event, context);

    // Assert
    await expect(result).rejects.toThrow(FullBatchFailureError);
    expect(serviceMocks.notificationsDynamoRepositoryMock.addEvent).toHaveBeenCalledTimes(0);
    expect(serviceMocks.cacheServiceMock.store).toHaveBeenCalledTimes(0);
  });
});
