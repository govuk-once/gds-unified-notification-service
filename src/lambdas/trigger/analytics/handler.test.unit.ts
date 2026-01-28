/* eslint-disable @typescript-eslint/unbound-method */
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { ValidationEnum } from '@common/models/ValidationEnum';
import { QueueEvent } from '@common/operations';
import { EventsDynamoRepository } from '@common/repositories';
import { CacheService, ConfigurationService } from '@common/services';
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
  // Observability mocks
  const loggerMock = vi.mocked(new Logger());
  const tracerMock = vi.mocked(new Tracer());
  const metricsMock = vi.mocked(new Metrics());

  // Service mocks
  const mockConfigurationService = vi.mocked(new ConfigurationService(loggerMock, metricsMock, tracerMock));
  const mockDynamoRepo = vi.mocked(
    new EventsDynamoRepository(mockConfigurationService, loggerMock, metricsMock, tracerMock)
  );
  const mockCacheService = vi.mocked(new CacheService(mockConfigurationService));

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
    instance = new Analytics(mockConfigurationService, loggerMock, metricsMock, tracerMock, () => ({
      analytics: Promise.resolve(mockDynamoRepo),
      cache: Promise.resolve(mockCacheService),
      events: Promise.resolve(mockDynamoRepo),
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
    mockConfigurationService.getParameter.mockResolvedValue('queue/processing/url');
    mockDynamoRepo.createRecordBatch.mockResolvedValueOnce();
    mockCacheService.store.mockResolvedValue('READ');

    const event = {
      Records: [{ body: validData as unknown as string, messageId: 'msg1' } as SQSRecord],
    } as unknown as QueueEvent<IAnalytics>;

    // Act
    await instance.implementation(event, mockContext);

    // Assert
    // - Entries have been created
    expect(mockDynamoRepo.createRecordBatch).toHaveBeenCalledTimes(1);
    expect(mockDynamoRepo.createRecordBatch).toHaveBeenCalledWith(expectedCreatedTableRows);
    // - Cached hashmap of status and notification ID has been triggered
    expect(mockCacheService.store).toHaveBeenCalledTimes(1);
    expect(mockCacheService.store).toHaveBeenCalledWith('/DEP1/not1/Status', validData.Event);
  });

  it('should process INVALID records: Update Cache to Read, Skip Queue, and Push to DyanmoDB', async () => {
    // Arrange
    mockConfigurationService.getParameter.mockResolvedValue('queue/processing/url');

    const event = {
      Records: [{ body: invalidData as unknown as string, messageId: 'msg2' } as SQSRecord],
    } as unknown as QueueEvent<IAnalytics>;

    //  ACT
    await instance.implementation(event, mockContext);

    // Assert
    expect(mockDynamoRepo.createRecordBatch).toHaveBeenCalledTimes(0);
    expect(mockCacheService.store).toHaveBeenCalledTimes(0);
  });
});
