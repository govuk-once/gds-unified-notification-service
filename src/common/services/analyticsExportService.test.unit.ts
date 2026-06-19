import { ParsingFailedError } from '@common/models/Errors/InternalServerError';
import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import { AnalyticsExportService } from '@common/services/analyticsExportService';
import { IAnalyticsLog } from '@common/services/interfaces/analyticsLog';
import { StringParameters } from '@common/utils';
import {
  mockDefaultConfig,
  mockGetParameterImplementation,
} from '@common/utils/mockConfigurationImplementation.test.util';
import { awsClientSpies, observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import { IAnalytics } from '@project/lambdas/interfaces/IAnalyticsSchema';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });
vi.mock('@aws-sdk/client-cloudwatch-logs', { spy: true });
vi.mock('@common/services/configurationService', { spy: true });
vi.mock('@common/services/cacheService', { spy: true });

describe('AnalyticsExportService', () => {
  let instance: AnalyticsExportService;

  // Observability and Service mocks
  const observabilityMock = observabilitySpies();
  const awsClientMocks = awsClientSpies();
  const serviceMocks = ServiceSpies(observabilityMock);

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
  };

  beforeEach(async () => {
    // Reset all mock
    vi.clearAllMocks();
    vi.useRealTimers();

    // Mock SSM Values
    mockParameterStore = mockDefaultConfig();

    // Mock successful response from external services
    serviceMocks.configurationServiceMock.getParameter.mockImplementation(
      mockGetParameterImplementation(mockParameterStore)
    );

    // Mock successful response from the client
    awsClientMocks.cloudWatchLogsClientMock.send.mockResolvedValue(undefined);

    instance = new AnalyticsExportService(
      observabilityMock,
      serviceMocks.configurationServiceMock,
      serviceMocks.cacheServiceMock,
      awsClientMocks.cloudWatchLogsClientMock
    );
    await instance.initialize();
  });

  describe('logAnalytics', () => {
    it('should get log stream name from cache and push the analytic to the log group.', async () => {
      // Arrange
      vi.useFakeTimers();
      const date = new Date(2026, 1, 1, 12, 30, 0);
      vi.setSystemTime(date);
      const logStreamName = date.toISOString().split(':').shift() ?? '';

      serviceMocks.cacheServiceMock.get.mockResolvedValue(logStreamName);

      // Act
      await instance.logAnalytics(mockAnalytics);

      // Assert
      expect(awsClientMocks.cloudWatchLogsClientMock.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            logGroupName: mockParameterStore[StringParameters.AnalyticsExport.LogGroup.Name],
            logStreamName: logStreamName,
            logEvents: [
              {
                timestamp: date.getTime(),
                message: JSON.stringify(mockAnalyticsLog),
              },
            ],
          },
        })
      );
    });
  });

  describe('logStreamToS3Bucket', () => {
    it('should export the log stream from cloudwatch log group to s3.', async () => {
      // Arrange
      vi.useFakeTimers();
      const date = new Date(2026, 1, 1, 12, 30, 0);
      vi.setSystemTime(date);
      const logStreamName = date.toISOString().split(':').shift() ?? '';

      // Act
      await instance.logStreamToS3Bucket(date.toISOString());

      // Assert
      expect(awsClientMocks.cloudWatchLogsClientMock.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            taskName: `analytics-export-${logStreamName}`,
            logGroupName: mockParameterStore[StringParameters.AnalyticsExport.LogGroup.Name],
            logStreamNamePrefix: logStreamName,
            from: date.getTime() - 2 * 60 * 60 * 1000,
            to: date.getTime(),
            destination: mockParameterStore[StringParameters.AnalyticsExport.Bucket.Name],
            destinationPrefix: logStreamName,
          },
        })
      );
    });

    it('should throw an error if called with a string that is not a timestamp.', async () => {
      // Act
      const result = instance.logStreamToS3Bucket('time');

      // Assert
      await expect(result).rejects.toThrow(ParsingFailedError);
    });
  });
});
