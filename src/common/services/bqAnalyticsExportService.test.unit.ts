import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import { NotificationStateEnum } from "@common/models/NotificationStateEnum";
import { BqAnalyticsExportService } from "@common/services/bqAnalyticsExportService";
import { IAnalyticsLog } from "@common/services/interfaces/analyticsLog";
import { StringParameters } from "@common/utils";
import { mockDefaultConfig, mockGetParameterImplementation } from "@common/utils/mockConfigurationImplementation.test.util";
import { observabilitySpies, ServiceSpies } from "@common/utils/mockInstanceFactory.test.util";
import { IAnalytics } from "@project/lambdas/interfaces/IAnalyticsSchema";
import { Mocked } from "vitest";

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });
vi.mock('@aws-sdk/client-cloudwatch-logs', { spy: true });
vi.mock('@common/services/configurationService', { spy: true });
vi.mock('@common/services/cacheService', { spy: true });

describe('BqAnalyticsExportService', () => {
  let instance: BqAnalyticsExportService;

  // Observability and Service mocks
  const observabilityMock = observabilitySpies();
  const serviceMocks = ServiceSpies(observabilityMock);

  // Mock Cloudwatch client
  const client = new CloudWatchLogsClient() as Mocked<CloudWatchLogsClient>;

  // Mocking implementation of the configuration service
  let mockParameterStore = mockDefaultConfig();

  const mockAnalytics: IAnalytics = {
    EventID: '123',
    DepartmentID: 'DEP1',
    OrganisationID: 'ORG01',
    NotificationID: '7351e7c8-7314-4d2b-a590-4f053c6ef80f',
    CampaignID: 'CAM_ID',
    Event: NotificationStateEnum.RECEIVED,
    EventDateTime: '2026-01-22T00:00:01Z',
    APIGWExtendedID: 'testExample',
    EventReason: 'testing',
  };

  const mockAnalyticsLog: IAnalyticsLog = {
    EventID: '123',
    EventTimestamp: '2026-01-22T00:00:01Z',
    OrganisationID: 'ORG01',
    DepartmentID: 'DEP1',
    NotificationID: '7351e7c8-7314-4d2b-a590-4f053c6ef80f',
    CampaignID: 'CAM_ID',
    EventStatus: NotificationStateEnum.RECEIVED,
  }

  beforeEach(async () => {
    // Reset all mock
    vi.clearAllMocks();

    // Mock SSM Values
    mockParameterStore = mockDefaultConfig();
    serviceMocks.configurationServiceMock.getParameter.mockImplementation(mockGetParameterImplementation(mockParameterStore));

    instance = new BqAnalyticsExportService(observabilityMock, serviceMocks.configurationServiceMock, serviceMocks.cacheServiceMock);
    await instance.initialize();
  });


  // TODO: Add unit tests for BqAnalyticsExportService that involve mocking aws client
  describe('initialize', () => {
    it.skip('should call super.initialize with correct parameters and return this', async () => {
      // Arrange
      const superInitialize = vi
        .spyOn(Object.getPrototypeOf(BqAnalyticsExportService.prototype), 'initialize')
        .mockResolvedValue(undefined);

      // Act
      const result = await instance.initialize();

      // Assert
      expect(superInitialize).toHaveBeenCalledWith(StringParameters.BigQuery.LogGroup.Name);
      expect(result).toBe(instance);
    });
  });

  describe('logAnalytics', () => {
    it.skip('should get log stream name from cache and push the analytic to the log group.', async () => {
      // Arrange
      vi.useFakeTimers();
      const date = new Date(2026, 1, 1, 12, 30, 0);
      vi.setSystemTime(date);
      vi.useRealTimers();
      const logStreamName = date.toISOString().split(':').shift() ?? '';

      serviceMocks.cacheServiceMock.get.mockResolvedValue(logStreamName);

      // Act
      await instance.logAnalytics(mockAnalytics);

      // Assert
      expect(client).toHaveBeenCalledWith({
        logGroupName: mockParameterStore[StringParameters.BigQuery.LogGroup.Name],
        logStreamName: logStreamName,
        logEvents: [
          {
            timestamp: date,
            message: JSON.stringify(mockAnalyticsLog),
          },
        ],
      });
    });
  });
})
