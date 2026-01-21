import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { toIAnalyticsRecord } from '@common/builders/toIAnalyticsRecord';
import { iocGetCacheService, iocGetDynamoRepository, iocGetQueueService } from '@common/ioc';
import { ValidationEnum } from '@common/models/ValidationEnum';
import { QueueEvent } from '@common/operations';
import { Configuration } from '@common/services';
import { IAnalytics, IAnalyticsSchema } from '@project/lambdas/interfaces/IAnalyticsSchema';
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
  iocGetDynamoRepository: vi.fn(),
}));

vi.mock('@project/lambdas/interfaces/IAnalyticsSchema', () => ({
  IAnalyticsSchema: {
    safeParse: vi.fn(),
    partial: vi.fn(),
  },
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
    { getParameter } as unknown as Configuration,
    { info, trace, error } as unknown as Logger,
    {} as unknown as Metrics,
    {} as unknown as Tracer
  );

  let mockContext: Context;

  const mockCacheService = { store: vi.fn(), get: vi.fn(), set: vi.fn() };
  const mockQueueService = { publishMessageBatch: vi.fn() };
  const mockDynamoRepo = { createRecordBatch: vi.fn() };

  const mockedIocGetCacheService = vi.mocked(iocGetCacheService);
  const mockedIocGetQueueService = vi.mocked(iocGetQueueService);
  const mockedIocGetDynamoRepository = vi.mocked(iocGetDynamoRepository);

  const mockedSchema = vi.mocked(IAnalyticsSchema);
  const mockedToAnalyticsRecord = vi.mocked(toIAnalyticsRecord);

  beforeEach(() => {
    vi.clearAllMocks();

    mockedIocGetCacheService.mockReturnValue(mockCacheService as unknown as ReturnType<typeof iocGetCacheService>);
    mockedIocGetQueueService.mockReturnValue(mockQueueService as unknown as ReturnType<typeof iocGetQueueService>);
    mockedIocGetDynamoRepository.mockReturnValue(
      mockDynamoRepo as unknown as ReturnType<typeof iocGetDynamoRepository>
    );

    mockContext = {
      functionName: 'analytics',
      awsRequestId: '12345',
    } as unknown as Context;
  });

  it('should have the correct operationId', () => {
    expect(instance.operationId).toBe('analytics');
  });

  it('should process VALID records: Update Cache to Processing, Publish to Queue, and Push to DynamoDB', async () => {
    const validData: IAnalytics = {
      DepartmentID: 'DVLA',
      NotificationID: 'not1',
      Event: ValidationEnum.RECEIVED,
      EventDateTime: '00000000',
      APIGWExtendedID: '',
      Message: 'testing',
    };

    const dbRecord = { ...validData };

    mockedSchema.safeParse.mockReturnValue({
      success: true,
      data: validData,
    } as unknown as ReturnType<typeof IAnalyticsSchema.safeParse>);

    mockedToAnalyticsRecord.mockReturnValue(dbRecord as unknown as ReturnType<typeof toIAnalyticsRecord>);
    getParameter.mockResolvedValue('queue/processing/url');

    const event = {
      Records: [{ body: JSON.stringify(validData), messageId: 'msg1' } as SQSRecord],
    } as QueueEvent<string>;

    await instance.implementation(event, mockContext);

    expect(mockCacheService.store).toHaveBeenCalledWith('/DVLA/not1/Status', ValidationEnum.PROCESSING);
    expect(mockQueueService.publishMessageBatch).toHaveBeenCalledWith([validData]);
    expect(mockDynamoRepo.createRecordBatch).toHaveBeenCalledWith([dbRecord]);
  });

  it('should process INVALID records: Update Cache to Read, Skip Queue, and Push to DyanmoDB', async () => {
    const invalidData: IAnalytics = {
      DepartmentID: 'NOTDVLA',
      NotificationID: 'NOT2',
      Event: ValidationEnum.READ,
      EventDateTime: '00000000',
      APIGWExtendedID: '',
      Message: 'testing',
    };

    const dbRecord = { ...invalidData };

    mockedSchema.safeParse.mockReturnValue({
      success: false,
      error: { issues: [] },
    } as unknown as ReturnType<typeof IAnalyticsSchema.safeParse>);

    const partialSchemaMock = {
      safeParse: vi.fn().mockReturnValue({ success: true, data: invalidData }),
    };

    mockedSchema.partial.mockReturnValue(partialSchemaMock as unknown as ReturnType<typeof IAnalyticsSchema.partial>);

    mockedToAnalyticsRecord.mockReturnValue(dbRecord as unknown as ReturnType<typeof toIAnalyticsRecord>);
    getParameter.mockResolvedValue('queue/processing/url');

    const event = {
      Records: [{ body: JSON.stringify(invalidData), messageId: 'msg2' } as SQSRecord],
    } as QueueEvent<string>;

    await instance.implementation(event, mockContext);

    expect(mockQueueService.publishMessageBatch).not.toHaveBeenCalled();
    expect(mockCacheService.store).not.toHaveBeenCalled();
  });

  it('should handle MIXED batches', async () => {
    const validData: IAnalytics = {
      DepartmentID: 'DVLA',
      NotificationID: '1',
      Event: ValidationEnum.RECEIVED,
      EventDateTime: '00000000',
      APIGWExtendedID: '',
      Message: 'testing',
    };

    const invalidData: IAnalytics = {
      DepartmentID: 'NOTDVLA',
      NotificationID: '2',
      Event: ValidationEnum.RECEIVED,
      EventDateTime: '00000000',
      APIGWExtendedID: '',
      Message: 'testing',
    };

    const event = {
      Records: [
        { body: JSON.stringify(validData), messageId: 'msg1' } as SQSRecord,
        { body: JSON.stringify(invalidData), messageId: 'msg2' } as SQSRecord,
      ],
    } as QueueEvent<string>;

    mockedSchema.safeParse.mockReturnValueOnce({
      success: true,
      data: validData,
    } as unknown as ReturnType<typeof IAnalyticsSchema.safeParse>);

    mockedSchema.safeParse.mockReturnValueOnce({
      success: false,
      error: { issues: [] },
    } as unknown as ReturnType<typeof IAnalyticsSchema.safeParse>);

    const partialSchemaMock = {
      safeParse: vi.fn().mockReturnValue({ success: true, data: invalidData }),
    };
    mockedSchema.partial.mockReturnValue(partialSchemaMock as unknown as ReturnType<typeof IAnalyticsSchema.partial>);

    mockedToAnalyticsRecord.mockImplementation((d) => d as unknown as ReturnType<typeof toIAnalyticsRecord>);

    await instance.implementation(event, mockContext);

    expect(mockQueueService.publishMessageBatch).toHaveBeenCalledTimes(1);
    expect(mockQueueService.publishMessageBatch).toHaveBeenCalledWith([validData]);
    expect(mockDynamoRepo.createRecordBatch).toHaveBeenCalledTimes(1);
  });
});
