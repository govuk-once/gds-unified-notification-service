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
import { Context, SQSRecord } from 'aws-lambda';
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
  const validData: IAnalytics = {
    EventID: '123',
    DepartmentID: 'DEP1',
    NotificationID: 'not1',
    Event: NotificationStateEnum.RECEIVED,
    EventDateTime: '2026-01-22T00:00:01Z',
    APIGWExtendedID: 'testExample',
    EventReason: 'testing',
  };

  const invalidData = {
    DepartmentID: undefined,
    NotificationID: undefined,
    Event: NotificationStateEnum.READ,
    EventDateTime: '00000000',
    APIGWExtendedID: 'testExample',
    EventReason: 'testing',
  };

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

    instance = new Analytics(serviceMocks.configurationServiceMock, observabilityMocks, () => ({
      cache: Promise.resolve(serviceMocks.cacheServiceMock),
      notifications: Promise.resolve(serviceMocks.notificationsDynamoRepositoryMock),
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
    // Arrange
    const event = {
      Records: [{ body: validData as unknown as string, messageId: 'msg1' } as SQSRecord],
    } as unknown as QueueEvent<IAnalytics>;

    // Act
    await handler(event, mockContext);

    // Assert
    expect(serviceMocks.notificationsDynamoRepositoryMock.addEvent).toHaveBeenCalledTimes(1);
    expect(serviceMocks.notificationsDynamoRepositoryMock.addEvent).toHaveBeenCalledWith(validData);
  });

  it('should process valid records and update cache to processing', async () => {
    // Arrange
    const event = {
      Records: [{ body: validData as unknown as string, messageId: 'msg1' } as SQSRecord],
    } as unknown as QueueEvent<IAnalytics>;

    // Act
    await handler(event, mockContext);

    // Assert
    expect(serviceMocks.cacheServiceMock.store).toHaveBeenCalledTimes(1);
    expect(serviceMocks.cacheServiceMock.store).toHaveBeenCalledWith('/DEP1/not1/Status', validData.Event);
  });

  it('should process valid records and handle missing values', async () => {
    // Arrange
    const validDataWithMissingValue = {
      ...validData,
      Event: undefined,
    };
    const expectedCreatedTableRows = { ...validDataWithMissingValue, Event: NotificationStateEnum.UNKNOWN };

    const event = {
      Records: [{ body: validDataWithMissingValue as unknown as string, messageId: 'msg1' } as SQSRecord],
    } as unknown as QueueEvent<IAnalytics>;

    // Act
    await handler(event, mockContext);

    // Assert
    expect(serviceMocks.notificationsDynamoRepositoryMock.addEvent).toHaveBeenCalledTimes(1);
    expect(serviceMocks.notificationsDynamoRepositoryMock.addEvent).toHaveBeenCalledWith(expectedCreatedTableRows);
    expect(serviceMocks.cacheServiceMock.store).toHaveBeenCalledTimes(1);
    expect(serviceMocks.cacheServiceMock.store).toHaveBeenCalledWith(
      '/DEP1/not1/Status',
      NotificationStateEnum.UNKNOWN
    );
  });

  it('should process all valid analytics records and reject any that are invalid', async () => {
    // Arrange
    const event = {
      Records: [
        { body: validData as unknown as string, messageId: 'msg1' } as SQSRecord,
        { body: invalidData as unknown as string, messageId: 'msg2' } as SQSRecord,
      ],
    } as unknown as QueueEvent<IAnalytics>;

    //  Act
    const result = await handler(event, mockContext);

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
    const event = {
      Records: [{ body: invalidData as unknown as string, messageId: 'msg2' } as SQSRecord],
    } as unknown as QueueEvent<IAnalytics>;

    //  Act
    const result = handler(event, mockContext);

    // Assert
    await expect(result).rejects.toThrow(FullBatchFailureError);
    expect(serviceMocks.notificationsDynamoRepositoryMock.addEvent).toHaveBeenCalledTimes(0);
    expect(serviceMocks.cacheServiceMock.store).toHaveBeenCalledTimes(0);
  });
});
