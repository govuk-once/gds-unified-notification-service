/* eslint-disable @typescript-eslint/unbound-method */
import { ValidationEnum } from '@common/models/ValidationEnum';
import { QueueEvent } from '@common/operations';
import { observabilitySpies, ServiceSpies } from '@common/utils/mockIocInstanceFactory';
import { IAnalytics } from '@project/lambdas/interfaces/IAnalyticsSchema';
import { Analytics } from '@project/lambdas/trigger/analytics/handler';
import { Context, SQSRecord } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });
vi.mock('@common/services', { spy: true });
vi.mock('@common/repositories', { spy: true });

describe('Analytics QueueHandler', () => {
  const observabilityMocks = observabilitySpies();
  const serviceMocks = ServiceSpies(observabilityMocks);

  let instance: Analytics;
  let mockContext: Context;

  // Re-useable test data
  const validData: IAnalytics = {
    EventID: '123',
    DepartmentID: 'DEP1',
    NotificationID: 'not1',
    Event: ValidationEnum.RECEIVED,
    EventDateTime: '2026-01-22T00:00:01Z',
    APIGWExtendedID: 'testExample',
    EventReason: 'testing',
  };
  const invalidData = {
    DepartmentID: undefined,
    NotificationID: undefined,
    Event: ValidationEnum.READ,
    EventDateTime: '00000000',
    APIGWExtendedID: 'testExample',
    EventReason: 'testing',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    instance = new Analytics(serviceMocks.configurationServiceMock, observabilityMocks, () => ({
      cache: Promise.resolve(serviceMocks.cacheServiceMock),
      events: Promise.resolve(serviceMocks.eventsDynamoRepositoryMock),
    }));

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

  it('should process VALID records: Update Cache to Processing, Publish to Queue, and Push to DynamoDB', async () => {
    // Arrange
    const expectedCreatedTableRows = [{ ...validData }];
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValue('queue/processing/url');
    serviceMocks.eventsDynamoRepositoryMock.createRecordBatch.mockResolvedValueOnce();
    serviceMocks.cacheServiceMock.store.mockResolvedValue('READ');

    const event = {
      Records: [{ body: validData as unknown as string, messageId: 'msg1' } as SQSRecord],
    } as unknown as QueueEvent<IAnalytics>;

    // Act
    await instance.implementation(event, mockContext);

    // Assert
    // - Entries have been created
    expect(serviceMocks.eventsDynamoRepositoryMock.createRecordBatch).toHaveBeenCalledTimes(1);
    expect(serviceMocks.eventsDynamoRepositoryMock.createRecordBatch).toHaveBeenCalledWith(expectedCreatedTableRows);
    // - Cached hashmap of status and notification ID has been triggered
    expect(serviceMocks.cacheServiceMock.store).toHaveBeenCalledTimes(1);
    expect(serviceMocks.cacheServiceMock.store).toHaveBeenCalledWith('/DEP1/not1/Status', validData.Event);
  });

  it('should process INVALID records: Update Cache to Read, Skip Queue, and Push to DyanmoDB', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValue('queue/processing/url');

    const event = {
      Records: [{ body: invalidData as unknown as string, messageId: 'msg2' } as SQSRecord],
    } as unknown as QueueEvent<IAnalytics>;

    //  ACT
    await instance.implementation(event, mockContext);

    // Assert
    expect(serviceMocks.eventsDynamoRepositoryMock.createRecordBatch).toHaveBeenCalledTimes(0);
    expect(serviceMocks.cacheServiceMock.store).toHaveBeenCalledTimes(0);
  });
});
