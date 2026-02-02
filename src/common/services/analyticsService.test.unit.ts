/* eslint-disable @typescript-eslint/unbound-method */
import { MetricUnit } from '@aws-lambda-powertools/metrics';
import { ValidationEnum } from '@common/models/ValidationEnum';
import { AnalyticsEventFromIMessage, AnalyticsService } from '@common/services/analyticsService';
import { observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import { v4 as uuid } from 'uuid';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });
vi.mock('@common/services/configurationService', { spy: true });
vi.mock('@common/services/analyticsQueueService', { spy: true });

vi.mock('uuid', () => ({ v4: vi.fn() }));

describe('analyticsService', () => {
  let instance: AnalyticsService;

  const observabilityMock = observabilitySpies();
  const serviceMocks = ServiceSpies(observabilityMock);

  beforeEach(() => {
    // Reset all mock
    vi.resetAllMocks();
    vi.useRealTimers();

    instance = new AnalyticsService(observabilityMock, serviceMocks.analyticsQueueServiceMock);
  });

  describe('publishMultipleEvents', () => {
    const mockAnalyticsEvents: AnalyticsEventFromIMessage[] = [
      {
        NotificationID: '7351e7c8-7314-4d2b-a590-4f053c6ef80f',
        DepartmentID: 'Dev',
        APIGWExtendedID: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
      },
      {
        NotificationID: '7351e7c8-7314-4d2b-a590-4f053c6ef80g',
        DepartmentID: 'Dev',
        APIGWExtendedID: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeg',
      },
    ];

    const mockEventID_1 = 'b7e239f7-b354-4fe6-8aaf-04eba8331f6a';
    const mockEventID_2 = 'b7e239f7-b354-4fe6-8aaf-04eba8331f6a';

    it('should publish multiple events to the event dynamo table', async () => {
      // Arrange
      vi.useFakeTimers();
      const date = new Date();
      vi.setSystemTime(date);

      vi.mocked(uuid as () => string).mockReturnValueOnce(mockEventID_1);
      vi.mocked(uuid as () => string).mockReturnValue(mockEventID_2);

      // Act
      await instance.publishMultipleEvents(mockAnalyticsEvents, ValidationEnum.VALIDATED);

      // Assert
      expect(serviceMocks.analyticsQueueServiceMock.publishMessageBatch).toHaveBeenCalledWith([
        {
          EventID: mockEventID_1,
          NotificationID: mockAnalyticsEvents[0].NotificationID,
          DepartmentID: mockAnalyticsEvents[0].DepartmentID,
          APIGWExtendedID: mockAnalyticsEvents[0].APIGWExtendedID,
          EventDateTime: date.toISOString(),
          Event: 'VALIDATED',
        },
        {
          EventID: mockEventID_2,
          NotificationID: mockAnalyticsEvents[1].NotificationID,
          DepartmentID: mockAnalyticsEvents[1].DepartmentID,
          APIGWExtendedID: mockAnalyticsEvents[1].APIGWExtendedID,
          EventDateTime: date.toISOString(),
          Event: 'VALIDATED',
        },
      ]);
    });

    it('should add a metric after publishing events', async () => {
      // Act
      await instance.publishMultipleEvents(mockAnalyticsEvents, ValidationEnum.VALIDATED);

      // Assert
      expect(observabilityMock.metrics.addMetric).toHaveBeenCalledWith(
        `ANALYTIC_EVENTS_${ValidationEnum.VALIDATED.toUpperCase()}`,
        MetricUnit.Count,
        mockAnalyticsEvents.length
      );
    });

    it('should ignore empty arrays.', async () => {
      // Act
      await instance.publishMultipleEvents([], ValidationEnum.VALIDATED);

      // Assert
      expect(serviceMocks.analyticsQueueServiceMock.publishMessageBatch).not.toHaveBeenCalled();
    });
  });

  describe('publishEvent', () => {
    const mockAnalyticsEvent: AnalyticsEventFromIMessage = {
      NotificationID: '7351e7c8-7314-4d2b-a590-4f053c6ef80f',
      DepartmentID: 'Dev',
      APIGWExtendedID: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
    };

    const mockEventID = 'b7e239f7-b354-4fe6-8aaf-04eba8331f6a';

    it('should publish an event to the event dynamo table', async () => {
      // Arrange
      vi.useFakeTimers();
      const date = new Date();
      vi.setSystemTime(date);

      vi.mocked(uuid as () => string).mockReturnValueOnce(mockEventID);

      // Act
      await instance.publishEvent(mockAnalyticsEvent, ValidationEnum.VALIDATED);

      // Assert
      expect(serviceMocks.analyticsQueueServiceMock.publishMessage).toHaveBeenCalledWith({
        EventID: mockEventID,
        NotificationID: mockAnalyticsEvent.NotificationID,
        DepartmentID: mockAnalyticsEvent.DepartmentID,
        APIGWExtendedID: mockAnalyticsEvent.APIGWExtendedID,
        EventDateTime: date.toISOString(),
        Event: 'VALIDATED',
      });
    });

    it('should add a metric after publishing events', async () => {
      // Act
      await instance.publishEvent(mockAnalyticsEvent, ValidationEnum.VALIDATED);

      // Assert
      expect(observabilityMock.metrics.addMetric).toHaveBeenCalledWith(
        `ANALYTIC_EVENTS_${ValidationEnum.VALIDATED.toUpperCase()}`,
        MetricUnit.Count,
        1
      );
    });
  });
});
