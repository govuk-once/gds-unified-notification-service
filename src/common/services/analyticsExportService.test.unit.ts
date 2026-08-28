import { InvalidCharacterError, NotificationStateEnum, ParsingFailedError } from '@common/models';
import { AnalyticsExportService } from '@common/services/analyticsExportService';
import { StringParameters } from '@common/utils';
import {
  iocSpies,
  mockAnalyticsLog,
  mockDefaultConfig,
  mockIAnalytics,
  mockServicesExpectedBehaviour,
} from '@test/mocks';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });
vi.mock('@aws-sdk/client-cloudwatch-logs', { spy: true });

vi.mock('@common/services/configurationService', { spy: true });
vi.mock('@common/services/cacheService', { spy: true });

describe('AnalyticsExportService', async () => {
  let instance: AnalyticsExportService;

  // Initialize mock services, clients, and repositories
  const { observabilityMocks, awsClientMocks, serviceMocks } = await iocSpies();

  // Mocking implementation of the configuration service
  let mockParameterStore = mockDefaultConfig();

  // Test Fixtures
  const analytics = mockIAnalytics(NotificationStateEnum.RECEIVED);
  const analyticsLog = mockAnalyticsLog(NotificationStateEnum.RECEIVED);

  beforeEach(async () => {
    // Reset all mock
    vi.clearAllMocks();
    vi.useRealTimers();

    // Mock SSM store and services responses
    const { resetMockParameterStore } = mockServicesExpectedBehaviour(serviceMocks);
    mockParameterStore = resetMockParameterStore;

    // Mock successful response from the client
    awsClientMocks.cloudWatchLogsClientMock.send.mockResolvedValue(undefined);

    instance = await AnalyticsExportService.create(
      observabilityMocks,
      serviceMocks.configurationServiceMock,
      serviceMocks.cacheServiceMock,
      awsClientMocks.cloudWatchLogsClientMock
    );
  });

  describe('logAnalytics', () => {
    const date = new Date('2026-01-01T12:30:00.000Z');
    const logStreamName = date.toISOString().split(':').shift();

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(date);

      serviceMocks.cacheServiceMock.get.mockResolvedValueOnce(logStreamName);
    });

    it('should get log stream name from cache and push the analytic to the log group.', async () => {
      // Act
      await instance.logAnalytics(analytics);

      // Assert
      expect(awsClientMocks.cloudWatchLogsClientMock.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            logGroupName: mockParameterStore[StringParameters.AnalyticsExport.LogGroup.Name],
            logStreamName: logStreamName,
            logEvents: [
              {
                timestamp: date.getTime(),
                message: [
                  '',
                  '123',
                  '2026-01-22T00:00:01Z',
                  'ORG01',
                  'DEP1',
                  '7351e7c8-7314-4d2b-a590-4f053c6ef80f',
                  'CAM_ID',
                  NotificationStateEnum.RECEIVED,
                ].join(','),
              },
            ],
          },
        })
      );
    });

    it('should handle optional values when converting to csv.', async () => {
      // Arrange
      const analyticsNoDepID = { ...analytics, DepartmentID: undefined };
      const mockCsvNoDepID = [
        '',
        '123',
        '2026-01-22T00:00:01Z',
        'ORG01',
        undefined,
        '7351e7c8-7314-4d2b-a590-4f053c6ef80f',
        'CAM_ID',
        NotificationStateEnum.RECEIVED,
      ].join(',');

      // Act
      await instance.logAnalytics(analyticsNoDepID);

      // Assert
      expect(awsClientMocks.cloudWatchLogsClientMock.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            logGroupName: mockParameterStore[StringParameters.AnalyticsExport.LogGroup.Name],
            logStreamName: logStreamName,
            logEvents: [
              {
                timestamp: date.getTime(),
                message: mockCsvNoDepID,
              },
            ],
          },
        })
      );
    });

    it('should throw an error if an analytics object contain an invalid char , .', async () => {
      // Arrange
      const invalidAnalytics = { ...analytics, CampaignID: 'invalid-camp,' };
      const invalidAnalyticsLog = { ...analyticsLog, CampaignID: 'invalid-camp,' };

      // Act
      const result = instance.logAnalytics(invalidAnalytics);

      // Assert
      await expect(result).rejects.toThrow(
        new InvalidCharacterError(['Analytics contains invalid char , or " for csv format.'])
      );
      expect(observabilityMocks.logger.warn).toHaveBeenCalledWith(
        'Analytics contains invalid char , or " for csv format.',
        {
          field: 'CampaignID',
          analyticsLog: invalidAnalyticsLog,
        }
      );
    });

    it('should throw an error if an analytics object contain an invalid char " .', async () => {
      // Arrange
      const invalidAnalytics = { ...analytics, CampaignID: 'invalid-camp"' };
      const invalidAnalyticsLog = { ...analyticsLog, CampaignID: 'invalid-camp"' };

      // Act
      const result = instance.logAnalytics(invalidAnalytics);

      // Assert
      await expect(result).rejects.toThrow(
        new InvalidCharacterError(['Analytics contains invalid char , or " for csv format.'])
      );
      expect(observabilityMocks.logger.warn).toHaveBeenCalledWith(
        'Analytics contains invalid char , or " for csv format.',
        {
          field: 'CampaignID',
          analyticsLog: invalidAnalyticsLog,
        }
      );
    });
  });

  describe('logStreamToS3Bucket', () => {
    it('should export the log stream from cloudwatch using the previous hours log group to s3.', async () => {
      // Arrange
      vi.useFakeTimers();
      const date = new Date('2026-01-01T12:30:00Z');
      vi.setSystemTime(date);
      const logStreamName = '2026-01-01T11';
      const fromTime = new Date('2026-01-01T10:30:00Z');
      const toTime = new Date('2026-01-01T12:30:00Z');

      // Act
      await instance.logStreamToS3Bucket(date.toISOString());

      // Assert
      expect(awsClientMocks.cloudWatchLogsClientMock.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            taskName: `analytics-export-${logStreamName}`,
            logGroupName: mockParameterStore[StringParameters.AnalyticsExport.LogGroup.Name],
            logStreamNamePrefix: logStreamName,
            from: fromTime.getTime(),
            to: toTime.getTime(),
            destination: mockParameterStore[StringParameters.AnalyticsExport.Bucket.Name],
            destinationPrefix: logStreamName,
          },
        })
      );
    });

    it('should export the log stream from cloudwatch using the previous hours log when it occurs across midnight.', async () => {
      // Arrange
      vi.useFakeTimers();
      const date = new Date('2026-01-01T00:30:00Z');
      vi.setSystemTime(date);
      const logStreamName = '2025-12-31T23';
      const fromTime = new Date('2025-12-31T22:30:00Z');
      const toTime = new Date('2026-01-01T00:30:00Z');

      // Act
      await instance.logStreamToS3Bucket(date.toISOString());

      // Assert
      expect(awsClientMocks.cloudWatchLogsClientMock.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            taskName: `analytics-export-${logStreamName}`,
            logGroupName: mockParameterStore[StringParameters.AnalyticsExport.LogGroup.Name],
            logStreamNamePrefix: logStreamName,
            from: fromTime.getTime(),
            to: toTime.getTime(),
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
