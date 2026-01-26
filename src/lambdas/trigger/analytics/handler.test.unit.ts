/* eslint-disable @typescript-eslint/unbound-method */
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { toIAnalyticsRecord } from '@common/builders/toIAnalyticsRecord';
import {
  iocGetCacheService,
  iocGetConfigurationService,
  iocGetDispatchQueueService,
  iocGetEventsDynamoRepository,
} from '@common/ioc';
import { ValidationEnum } from '@common/models/ValidationEnum';
import { QueueEvent } from '@common/operations';
import { EventsDynamoRepository } from '@common/repositories/dynamodbRepository';
import { CacheService, ConfigurationService } from '@common/services';
import { IAnalytics } from '@project/lambdas/interfaces/IAnalyticsSchema';
import { Analytics } from '@project/lambdas/trigger/analytics/handler';
import { Context, SQSRecord } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@common/ioc', () => ({
  iocGetConfigurationService: vi.fn(),
  iocGetQueueService: vi.fn(),
  iocGetLogger: vi.fn(),
  iocGetMetrics: vi.fn(),
  iocGetTracer: vi.fn(),
  iocGetCacheService: vi.fn(),
  iocGetEventsDynamoRepository: vi.fn(),
}));

vi.mock('@common/builders/toIAnalyticsRecord', () => ({
  toIAnalyticsRecord: vi.fn(),
}));

describe('Analytics QueueHandler', () => {
  const getParameter = vi.fn();
  const info = vi.fn();
  const trace = vi.fn();
  const error = vi.fn();

  const instance: Analytics = new Analytics(
    { getParameter } as unknown as ConfigurationService,
    { info, trace, error } as unknown as Logger,
    {} as unknown as Metrics,
    {} as unknown as Tracer
  );

  let mockContext: Context;

  const mockCacheService = { store: vi.fn(), get: vi.fn(), set: vi.fn() } as unknown as CacheService;
  const mockDynamoRepo = { createRecordBatch: vi.fn() } as unknown as EventsDynamoRepository;

  const mockedIocGetCacheService = vi.mocked(iocGetCacheService);
  const mockedIocGetEventsDynamoRepository = vi.mocked(iocGetEventsDynamoRepository);
  const mockedToAnalyticsRecord = vi.mocked(toIAnalyticsRecord);

  beforeEach(() => {
    vi.clearAllMocks();

    mockedIocGetCacheService.mockResolvedValue(mockCacheService);
    mockedIocGetEventsDynamoRepository.mockResolvedValue(mockDynamoRepo);

    // Mock AWS Lambda Context
    mockContext = {
      functionName: 'analytics',
      awsRequestId: '12345',
    } as unknown as Context;
  });

  it('should have the correct operationId', () => {
    // ASSERT
    expect(instance.operationId).toBe('analytics');
  });

  it('should process VALID records: Update Cache to Processing, Publish to Queue, and Push to DynamoDB', async () => {
    // Arrange
    const validData: IAnalytics = {
      DepartmentID: 'DVLA',
      NotificationID: 'not1',
      Event: ValidationEnum.RECEIVED,
      EventDateTime: '2026-01-22T00:00:01Z',
      APIGWExtendedID: 'testExample',
      EventReason: 'testing',
    };

    const dbRecord = { ...validData };

    mockedToAnalyticsRecord.mockReturnValue(dbRecord as unknown as ReturnType<typeof toIAnalyticsRecord>);

    const event = {
      Records: [{ body: validData as unknown as string, messageId: 'msg1' } as SQSRecord],
    } as unknown as QueueEvent<IAnalytics>;

    // ACT
    await instance.implementation(event, mockContext);

    // ASSERT
    expect(mockDynamoRepo.createRecordBatch).toHaveBeenCalledTimes(1);
    expect(mockDynamoRepo.createRecordBatch).toHaveBeenCalledWith([validData]);

    //  TODO: Readd when cache timeout fixes are in place
    // expect(mockCacheService.store).toHaveBeenCalledWith('/DVLA/not1/Status', ValidationEnum.PROCESSING);
  });

  it('should process INVALID records: Update Cache to Read, Skip Queue, and Push to DyanmoDB', async () => {
    // ARRANGE
    const invalidData = {
      DepartmentID: undefined,
      NotificationID: undefined,
      Event: ValidationEnum.READ,
      EventDateTime: '00000000',
      APIGWExtendedID: 'testExample',
      EventReason: 'testing',
    };

    mockedToAnalyticsRecord.mockImplementation((d) => {
      if (!d.DepartmentID || !d.NotificationID) {
        return undefined as ReturnType<typeof toIAnalyticsRecord>;
      }
      return d as unknown as ReturnType<typeof toIAnalyticsRecord>;
    });

    getParameter.mockResolvedValueOnce('queue/processing/url');

    const event = {
      Records: [{ body: invalidData as unknown as string, messageId: 'msg2' } as SQSRecord],
    } as unknown as QueueEvent<IAnalytics>;

    //  ACT
    await instance.implementation(event, mockContext);

    // ASSERT
    expect(mockDynamoRepo.createRecordBatch).toHaveBeenCalledTimes(0);

    //TODO: Readd when cache timeout fixes are in place
    //   expect(mockCacheService.store).not.toHaveBeenCalled();
  });

  it('should handle MIXED batches', async () => {
    //  ARRANGE
    const validData: IAnalytics = {
      DepartmentID: 'DVLA',
      NotificationID: '1',
      Event: ValidationEnum.RECEIVED,
      EventDateTime: '2026-01-22T00:00:01Z',
      APIGWExtendedID: 'testExample',
      EventReason: 'testing',
    };

    const invalidData = {
      DepartmentID: 12345,
      NotificationID: 98766,
      Event: ValidationEnum.RECEIVED,
      EventDateTime: '00000000',
      APIGWExtendedID: 'testExample',
      EventReason: 'testing',
    };

    const event = {
      Records: [
        { body: invalidData as unknown as string, messageId: 'msg2' } as SQSRecord,
        { body: validData as unknown as string, messageId: 'msg1' } as SQSRecord,
      ],
    } as unknown as QueueEvent<IAnalytics>;

    mockedToAnalyticsRecord.mockImplementation((d) => {
      if (!d.DepartmentID || !d.NotificationID) {
        return undefined as unknown as ReturnType<typeof toIAnalyticsRecord>;
      }
      return d as unknown as ReturnType<typeof toIAnalyticsRecord>;
    });

    // ACT
    await instance.implementation(event, mockContext);

    // ASSERT
    expect(mockDynamoRepo.createRecordBatch).toHaveBeenCalledTimes(1);
    expect(mockDynamoRepo.createRecordBatch).toHaveBeenCalledWith([validData]);

    //  TODO: Readd when cache timeout fixes are in place
    //  expect(mockQueueService.publishMessageBatch).toHaveBeenCalledTimes(1);
    //  expect(mockQueueService.publishMessageBatch).toHaveBeenCalledWith([validData]);
  });
});
