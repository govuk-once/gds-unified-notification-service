import { AnalyticsExportService } from '@common/services';
import {
  mockDefaultConfig,
  mockGetParameterImplementation,
} from '@common/utils/mockConfigurationImplementation.test.util';
import { awsClientSpies, observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import { AnalyticsExport } from '@project/lambdas/pso/schedule.analyticsExport/handler';
import { Context, ScheduledEvent } from 'aws-lambda';
import { Mocked } from 'vitest';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/services', { spy: true });
vi.mock('@common/repositories', { spy: true });

describe('AnalyticsExport Handler', () => {
  // Initialize the mock service and repository layers
  const observabilityMocks = observabilitySpies();
  const clientMocks = awsClientSpies();
  const serviceMocks = ServiceSpies(observabilityMocks);

  // TODO: Refactor this into service mock when implementing NOT-298
  const analyticsExportServiceMock = new AnalyticsExportService(
    observabilityMocks,
    serviceMocks.configurationServiceMock,
    serviceMocks.cacheServiceMock,
    clientMocks.cloudWatchLogsClientMock
  ) as Mocked<AnalyticsExportService>;

  let instance: AnalyticsExport;
  let handler: ReturnType<typeof AnalyticsExport.prototype.handler>;

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
    functionName: 'analyticsExport',
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

    analyticsExportServiceMock.logStreamToS3Bucket.mockResolvedValue(undefined);

    // Mocking retrieving store apiKey
    instance = new AnalyticsExport(serviceMocks.configurationServiceMock, observabilityMocks, () => ({
      analyticsExportService: Promise.resolve(analyticsExportServiceMock),
    }));
    handler = instance.handler();
  });

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('analyticsExport');
  });

  it('should call analyticsExportService.logStreamToS3Bucket with the time', async () => {
    // Act
    await handler(mockEvent, mockContext);

    // Assert
    expect(analyticsExportServiceMock.logStreamToS3Bucket).toHaveBeenCalledWith(mockEvent.time);
  });
});
