import {
  mockDefaultConfig,
  mockGetParameterImplementation,
} from '@common/utils/mockConfigurationImplementation.test.util';
import { mockEventContext, mockScheduledEvent } from '@common/utils/mockEvents.test.utils';
import { awsClientSpies, observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import { AnalyticsExport } from '@project/lambdas/pso/schedule.analyticsExport/handler';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/services', { spy: true });
vi.mock('@common/repositories', { spy: true });

describe('AnalyticsExport Handler', () => {
  // Initialize the mock service and repository layers
  const observabilityMocks = observabilitySpies();
  const clientMocks = awsClientSpies();
  const serviceMocks = ServiceSpies(observabilityMocks, clientMocks);

  let instance: AnalyticsExport;
  let handler: ReturnType<typeof AnalyticsExport.prototype.handler>;

  // Mocking implementation of the configuration service
  let mockParameterStore = mockDefaultConfig();

  // Test fixtures
  const context = mockEventContext('analyticsExport');

  beforeEach(() => {
    // Reset all mock
    vi.resetAllMocks();

    // Mock SSM Values
    mockParameterStore = mockDefaultConfig();
    serviceMocks.configurationServiceMock.getParameter.mockImplementation(
      mockGetParameterImplementation(mockParameterStore)
    );

    serviceMocks.analyticsExportServiceMock.logStreamToS3Bucket.mockResolvedValue(undefined);

    instance = new AnalyticsExport(serviceMocks.configurationServiceMock, observabilityMocks, () => ({
      analyticsExportService: Promise.resolve(serviceMocks.analyticsExportServiceMock),
    }));
    handler = instance.handler();
  });

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('analyticsExport');
  });

  it('should call analyticsExportService.logStreamToS3Bucket with the time', async () => {
    // Arrange
    const event = mockScheduledEvent();

    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.analyticsExportServiceMock.logStreamToS3Bucket).toHaveBeenCalledWith(event.time);
  });
});
