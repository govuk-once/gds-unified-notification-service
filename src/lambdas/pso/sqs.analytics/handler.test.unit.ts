import { FullBatchFailureError } from '@aws-lambda-powertools/batch';
import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import { QueueEvent } from '@common/operations';
import {
  mockDefaultConfig,
  mockGetParameterImplementation,
} from '@common/utils/mockConfigurationImplementation.test.util';
import { observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import { IAnalytics } from '@project/lambdas/interfaces/IAnalyticsSchema';
import { Analytics } from '@project/lambdas/pso/sqs.analytics/handler';
import { Context } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });
vi.mock('@common/services', { spy: true });
vi.mock('@common/repositories', { spy: true });

describe('Analytics QueueHandler', () => {
  // Initialize the mock service and repository layers
  const observabilityMocks = observabilitySpies();
  const serviceMocks = ServiceSpies(observabilityMocks);

  // Mocking implementation of the configuration service
  let mockParameterStore = mockDefaultConfig();

  let instance: Analytics;
  let handler: ReturnType<typeof Analytics.prototype.handler>;
  let mockContext: Context;

  // Re-useable test data
  const validAnalytics: IAnalytics = {
    EventID: '123',
    DepartmentID: 'DEP1',
    OrganisationID: 'ORG1',
    NotificationID: '7351e7c8-7314-4d2b-a590-4f053c6ef80f',
    CampaignID: 'CAM_ID',
    Event: NotificationStateEnum.RECEIVED,
    EventDateTime: '2026-01-22T00:00:01Z',
    APIGWExtendedID: 'testExample',
    EventReason: 'testing',
  };

  const invalidAnalytics = {
    DepartmentID: undefined,
    NotificationID: undefined,
    Event: NotificationStateEnum.READ,
    EventDateTime: '00000000',
    APIGWExtendedID: 'testExample',
    EventReason: 'testing',
  };

  const mockEvent: QueueEvent<IAnalytics> = {
    Records: [
      {
        messageId: 'mockMessageId',
        receiptHandle: 'mockReceiptHandle',
        attributes: {
          ApproximateReceiveCount: '2',
          SentTimestamp: '202601021513',
          SenderId: 'mockSenderId',
          ApproximateFirstReceiveTimestamp: '202601021513',
        },
        messageAttributes: {},
        md5OfBody: 'mockMd5OfBody',
        md5OfMessageAttributes: 'mockMd5OfMessageAttributes',
        eventSource: 'aws:sqs',
        eventSourceARN: 'mockEventSourceARN',
        awsRegion: 'eu-west2',
        body: validAnalytics,
      },
    ],
  };

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Mock SSM Values
    mockParameterStore = mockDefaultConfig();
    serviceMocks.configurationServiceMock.getParameter.mockImplementation(
      mockGetParameterImplementation(mockParameterStore)
    );

    // Mock SSM Values
    mockParameterStore = mockDefaultConfig();
    serviceMocks.configurationServiceMock.getParameter.mockImplementation(
      mockGetParameterImplementation(mockParameterStore)
    );

    // Mocking successful completion of service functions
    serviceMocks.notificationsDynamoRepositoryMock.addEvent.mockResolvedValue(undefined);
    serviceMocks.cacheServiceMock.store.mockResolvedValue(undefined);
    serviceMocks.campaignsDynamoRepositoryMock.incrementCampaigns.mockResolvedValue(undefined);

    instance = new Analytics(serviceMocks.configurationServiceMock, observabilityMocks, () => ({
      cache: Promise.resolve(serviceMocks.cacheServiceMock),
      notifications: Promise.resolve(serviceMocks.notificationsDynamoRepositoryMock),
      campaigns: Promise.resolve(serviceMocks.campaignsDynamoRepositoryMock),
    }));
    handler = instance.handler();

    // Mock AWS Lambda Context
    mockContext = {
      functionName: 'analytics',
      awsRequestId: '12345',
    } as unknown as Context;
  });

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('analytics');
  });

  it('should process valid records and store analytics events in DynamoDB', async () => {
    // Act
    await handler(mockEvent, mockContext);

    // Assert
    expect(serviceMocks.notificationsDynamoRepositoryMock.addEvent).toHaveBeenCalledTimes(1);
    expect(serviceMocks.notificationsDynamoRepositoryMock.addEvent).toHaveBeenCalledWith(mockEvent.Records[0].body);
  });

  it('should process valid records and update cache to processing', async () => {
    // Act
    await handler(mockEvent, mockContext);

    // Assert
    expect(serviceMocks.cacheServiceMock.store).toHaveBeenCalledTimes(1);
    expect(serviceMocks.cacheServiceMock.store).toHaveBeenCalledWith(
      '/DEP1/7351e7c8-7314-4d2b-a590-4f053c6ef80f/Status',
      mockEvent.Records[0].body.Event
    );
  });

  it('should process valid records and handle missing values', async () => {
    // Arrange
    const validAnalyticsWithMissingValue = {
      ...validAnalytics,
      Event: undefined,
    };
    const validDataWithMissingValue = {
      Records: [
        {
          ...mockEvent.Records[0],
          body: validAnalyticsWithMissingValue,
        },
      ],
    } as unknown as QueueEvent<IAnalytics>;
    const expectedCreatedTableRows = { ...validAnalyticsWithMissingValue, Event: NotificationStateEnum.UNKNOWN };

    // Act
    await handler(validDataWithMissingValue, mockContext);

    // Assert
    expect(serviceMocks.notificationsDynamoRepositoryMock.addEvent).toHaveBeenCalledTimes(1);
    expect(serviceMocks.notificationsDynamoRepositoryMock.addEvent).toHaveBeenCalledWith(expectedCreatedTableRows);
    expect(serviceMocks.cacheServiceMock.store).toHaveBeenCalledTimes(1);
    expect(serviceMocks.cacheServiceMock.store).toHaveBeenCalledWith(
      '/DEP1/7351e7c8-7314-4d2b-a590-4f053c6ef80f/Status',
      NotificationStateEnum.UNKNOWN
    );
  });

  it('should increment campaign if a campaignID is provided in the analytics', async () => {
    // Arrange
    const mockEventWithCampaign: QueueEvent<IAnalytics> = {
      Records: [
        {
          ...mockEvent.Records[0],
          body: {
            ...mockEvent.Records[0].body,
            CampaignID: 'CAMP01',
          },
        },
      ],
    };

    // Act
    await handler(mockEventWithCampaign, mockContext);

    // Assert
    expect(serviceMocks.campaignsDynamoRepositoryMock.incrementCampaigns).toHaveBeenCalledTimes(1);
    expect(serviceMocks.campaignsDynamoRepositoryMock.incrementCampaigns).toHaveBeenCalledWith(
      mockEventWithCampaign.Records[0].body.CampaignID,
      mockEventWithCampaign.Records[0].body.OrganisationID,
      mockEventWithCampaign.Records[0].body.DepartmentID,
      mockEventWithCampaign.Records[0].body.Event
    );
  });

  it('should process all valid analytics records and reject any that are invalid', async () => {
    // Arrange
    const mockEventWithPartialFailure = {
      Records: [
        mockEvent.Records[0],
        {
          ...mockEvent.Records[0],
          messageId: 'msg2',
          body: invalidAnalytics,
        },
      ],
    } as unknown as QueueEvent<IAnalytics>;

    //  Act
    const result = await handler(mockEventWithPartialFailure, mockContext);

    // Assert
    expect(result).toEqual({
      batchItemFailures: [
        {
          itemIdentifier: 'msg2',
        },
      ],
    });
    expect(serviceMocks.notificationsDynamoRepositoryMock.addEvent).toHaveBeenCalledTimes(1);
    expect(serviceMocks.cacheServiceMock.store).toHaveBeenCalledTimes(1);
  });

  it('should throw an error for invalid records', async () => {
    // Arrange
    const mockInvalidEvent = {
      Records: [
        {
          ...mockEvent.Records[0],
          body: invalidAnalytics,
        },
      ],
    } as unknown as QueueEvent<IAnalytics>;

    //  Act
    const result = handler(mockInvalidEvent, mockContext);

    // Assert
    await expect(result).rejects.toThrow(FullBatchFailureError);
    expect(serviceMocks.notificationsDynamoRepositoryMock.addEvent).toHaveBeenCalledTimes(0);
    expect(serviceMocks.cacheServiceMock.store).toHaveBeenCalledTimes(0);
  });
});
