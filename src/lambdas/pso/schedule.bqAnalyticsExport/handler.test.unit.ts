import { BqAnalyticsExportService } from '@common/services';
import {
  mockDefaultConfig,
  mockGetParameterImplementation,
} from '@common/utils/mockConfigurationImplementation.test.util';
import { awsClientSpies, observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import { BqAnalyticsExport } from '@project/lambdas/pso/schedule.bqAnalyticsExport/handler';
import { Context, ScheduledEvent } from 'aws-lambda';
import { Mocked } from 'vitest';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/services', { spy: true });
vi.mock('@common/repositories', { spy: true });

describe('BqAnalyticsExport Handler', () => {
  // Initialize the mock service and repository layers
  const observabilityMocks = observabilitySpies();
  const clientMocks = awsClientSpies();
  const serviceMocks = ServiceSpies(observabilityMocks);

  // TODO: Refactor this into service mock when implementing NOT-298
  const bqAnalyticsExportServiceMock = new BqAnalyticsExportService(
    observabilityMocks,
    serviceMocks.configurationServiceMock,
    serviceMocks.cacheServiceMock,
    clientMocks.cloudWatchLogsClientMock
  ) as Mocked<BqAnalyticsExportService>;

  let instance: BqAnalyticsExport;
  let handler: ReturnType<typeof BqAnalyticsExport.prototype.handler>;

  // Mocking implementation of the configuration service
  let mockParameterStore = mockDefaultConfig();

  const mockEvent: ScheduledEvent = {
    id: 'mockID',
    version: 'mockVersion',
    account: 'mockAccount',
    time: '2026-01-01T00:00:00',
    region: 'eu-west-2',
    resources: 'mockResources',
    source: 'mockResources',
  } as unknown as ScheduledEvent;

  // Mock AWS Lambda Context
  const mockContext = {
    functionName: 'bqAnalyticsExport',
    awsRequestId: '12345',
  } as unknown as Context;

  beforeEach(() => {
    // Reset all mock
    vi.resetAllMocks();

    // Mock SSM Values
    mockParameterStore = mockDefaultConfig();
    serviceMocks.configurationServiceMock.getParameter.mockImplementation(
      mockGetParameterImplementation(mockParameterStore)
    );

    bqAnalyticsExportServiceMock.logStreamToS3Bucket.mockResolvedValue(undefined)

    // Mocking retrieving store apiKey
    instance = new BqAnalyticsExport(
      serviceMocks.configurationServiceMock,
      observabilityMocks,
      () => ({
        bqAnalyticsExportService: Promise.resolve(bqAnalyticsExportServiceMock)
      })
    );
    handler = instance.handler();
  });

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('bqAnalyticsExport');
  });

  it('should call bqAnalyticsExportService.logStreamToS3Bucket with the time', async () => {
    // Act
    await handler(mockEvent, mockContext);

    // Assert
    expect(bqAnalyticsExportServiceMock.logStreamToS3Bucket).toHaveBeenCalledWith(mockEvent.time);
  });
});
