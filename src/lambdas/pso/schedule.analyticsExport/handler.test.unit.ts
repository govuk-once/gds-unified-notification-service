import { AnalyticsExport } from '@project/lambdas/pso/schedule.analyticsExport/handler';
import { iocSpies, mockEventContext, mockScheduledEvent, mockServicesExpectedBehaviour } from '@test/mocks';
import { Context } from 'aws-lambda';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/services', { spy: true });
vi.mock('@common/repositories', { spy: true });

describe('AnalyticsExport Handler', () => {
  // Initialize mock services, clients, and repositories
  const { observabilityMocks, serviceMocks } = iocSpies();

  let instance: AnalyticsExport;
  let handler: ReturnType<typeof AnalyticsExport.prototype.handler>;

  // Test fixtures
  let context: Context;

  beforeEach(() => {
    // Reset all mock
    vi.resetAllMocks();

    // Test Fixtures
    context = mockEventContext('analyticsExport');

    // Mock SSM store and services responses
    mockServicesExpectedBehaviour(serviceMocks);

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
