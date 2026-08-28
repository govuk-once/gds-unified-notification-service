import { InvalidCharacterError, NotificationStateEnum, ParsingFailedError } from '@common/models';
import { AnalyticsExportService, AnalyticsLog } from '@common/services/analyticsExportService';
import { StringParameters } from '@common/utils';
import { IAnalytics } from '@project/lambdas';
import { iocSpies, mockDefaultConfig, mockServicesExpectedBehaviour } from '@test/mocks';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });
vi.mock('@aws-sdk/client-cloudwatch-logs', { spy: true });

vi.mock('@common/services/configurationService', { spy: true });
vi.mock('@common/services/cacheService', { spy: true });

describe('AnalyticsExportService', () => {
  let instance: AnalyticsExportService;

  // Initialize mock services, clients, and repositories
  const { observabilityMocks, awsClientMocks, serviceMocks } = iocSpies();

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
    EventReason: JSON.stringify(['testing']),
  };

  const mockAnalyticsLog: AnalyticsLog = {
    EventID: '123',
    DepartmentID: 'DEP1',
    OrganisationID: 'ORG01',
    NotificationID: '7351e7c8-7314-4d2b-a590-4f053c6ef80f',
    CampaignID: 'CAM_ID',
    EventStatus: NotificationStateEnum.RECEIVED,
    EventTimestamp: '2026-01-22T00:00:01Z',
  };

  const mockCsv = [
    '',
    '123',
    '2026-01-22T00:00:01Z',
    'ORG01',
    'DEP1',
    '7351e7c8-7314-4d2b-a590-4f053c6ef80f',
    'CAM_ID',
    NotificationStateEnum.RECEIVED,
  ].join(',');

  beforeEach(async () => {
    // Reset all mock
    vi.clearAllMocks();
    vi.useRealTimers();

    // Mock SSM store and services responses
    const { resetMockParameterStore } = mockServicesExpectedBehaviour(serviceMocks);
    mockParameterStore = resetMockParameterStore;

    // Mock successful response from the client
    awsClientMocks.cloudWatchLogsClientMock.send.mockResolvedValue(undefined);

    instance = new AnalyticsExportService(
      observabilityMocks,
      serviceMocks.configurationServiceMock,
      serviceMocks.cacheServiceMock,
      awsClientMocks.cloudWatchLogsClientMock
    );
    await instance.initialize();
  });

  describe('logAnalytics', () => {
    const date = new Date(2026, 1, 1, 12, 30, 0);
    const logStreamName = date.toISOString().split(':').shift() ?? '';

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(date);

      serviceMocks.cacheServiceMock.get.mockResolvedValue(logStreamName);
    });

    it('should get log stream name from cache and push the analytic to the log group.', async () => {
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
                message: mockCsv,
              },
            ],
          },
        })
      );
    });

    it('should handle optional values when converting to csv.', async () => {
      // Arrange
      const mockAnalyticsNoDepID = { ...mockAnalytics, DepartmentID: undefined };
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
      await instance.logAnalytics(mockAnalyticsNoDepID);

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
      const mockInvalidAnalytics = { ...mockAnalytics, CampaignID: 'invalid-camp,' };
      const mockInvalidAnalyticsLog = { ...mockAnalyticsLog, CampaignID: 'invalid-camp,' };

      // Act
      const result = instance.logAnalytics(mockInvalidAnalytics);

      // Assert
      await expect(result).rejects.toThrow(
        new InvalidCharacterError(['Analytics contains invalid char , or " for csv format.'])
      );
      expect(observabilityMocks.logger.warn).toHaveBeenCalledWith(
        'Analytics contains invalid char , or " for csv format.',
        {
          field: 'CampaignID',
          analyticsLog: mockInvalidAnalyticsLog,
        }
      );
    });

    it('should throw an error if an analytics object contain an invalid char " .', async () => {
      // Arrange
      const mockInvalidAnalytics = { ...mockAnalytics, CampaignID: 'invalid-camp"' };
      const mockInvalidAnalyticsLog = { ...mockAnalyticsLog, CampaignID: 'invalid-camp"' };

      // Act
      const result = instance.logAnalytics(mockInvalidAnalytics);

      // Assert
      await expect(result).rejects.toThrow(
        new InvalidCharacterError(['Analytics contains invalid char , or " for csv format.'])
      );
      expect(observabilityMocks.logger.warn).toHaveBeenCalledWith(
        'Analytics contains invalid char , or " for csv format.',
        {
          field: 'CampaignID',
          analyticsLog: mockInvalidAnalyticsLog,
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
