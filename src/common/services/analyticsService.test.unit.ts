import { MetricUnit } from '@aws-lambda-powertools/metrics';
import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import { AnalyticsEventFromIMessage, AnalyticsService } from '@common/services/analyticsService';
import { MetricsLabels } from '@common/services/observabilityService';
import { observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import z from 'zod';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });
vi.mock('@common/services/configurationService', { spy: true });
vi.mock('@common/services/analyticsQueueService', { spy: true });

describe('analyticsService', () => {
  let instance: AnalyticsService;

  // Observability and Service mocks
  const observabilityMock = observabilitySpies();
  const serviceMocks = ServiceSpies(observabilityMock);

  beforeEach(() => {
    // Reset all mock
    vi.resetAllMocks();
    vi.useRealTimers();

    serviceMocks.analyticsQueueServiceMock.publishMessage.mockResolvedValue(undefined);
    serviceMocks.analyticsQueueServiceMock.publishMessageBatch.mockResolvedValue(undefined);

    instance = new AnalyticsService(observabilityMock, serviceMocks.analyticsQueueServiceMock);
  });

  describe('publishMultipleEvents', () => {
    const mockAnalyticsEvents: AnalyticsEventFromIMessage[] = [
      {
        NotificationID: '7351e7c8-7314-4d2b-a590-4f053c6ef80f',
        DepartmentID: 'Dev',
        APIGWExtendedID: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
        OrganisationID: 'ORD01',
      },
      {
        NotificationID: '7351e7c8-7314-4d2b-a590-4f053c6ef80g',
        DepartmentID: 'Dev',
        APIGWExtendedID: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeg',
        OrganisationID: 'ORD01',
      },
    ];

    const mockAnalyticsWithCampaignEvents: AnalyticsEventFromIMessage[] = [
      {
        NotificationID: '7351e7c8-7314-4d2b-a590-4f053c6ef80h',
        DepartmentID: 'Dev',
        CampaignID: 'CAMP01',
        APIGWExtendedID: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
        OrganisationID: 'ORD01',
      },
      {
        NotificationID: '7351e7c8-7314-4d2b-a590-4f053c6ef80i',
        DepartmentID: 'Dev',
        CampaignID: 'CAMP01',
        APIGWExtendedID: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeg',
        OrganisationID: 'ORD01',
      },
    ];

    it('should publish multiple events to the event dynamo table', async () => {
      // Arrange

      // Act
      await instance.publishMultipleEvents(mockAnalyticsEvents, NotificationStateEnum.VALIDATED);

      // Assert
      expect(serviceMocks.analyticsQueueServiceMock.publishMessageBatch).toHaveBeenCalledWith([
        {
          EventID: expect.schemaMatching(z.uuid()),
          NotificationID: mockAnalyticsEvents[0].NotificationID,
          DepartmentID: mockAnalyticsEvents[0].DepartmentID,
          APIGWExtendedID: mockAnalyticsEvents[0].APIGWExtendedID,
          EventDateTime: expect.schemaMatching(z.coerce.date()),
          Event: 'VALIDATED',
          CampaignID: mockAnalyticsEvents[0].CampaignID,
          OrganisationID: mockAnalyticsEvents[0].OrganisationID,
        },
        {
          EventID: expect.schemaMatching(z.uuid()),
          NotificationID: mockAnalyticsEvents[1].NotificationID,
          DepartmentID: mockAnalyticsEvents[1].DepartmentID,
          APIGWExtendedID: mockAnalyticsEvents[1].APIGWExtendedID,
          EventDateTime: expect.schemaMatching(z.coerce.date()),
          Event: 'VALIDATED',
          CampaignID: mockAnalyticsEvents[1].CampaignID,
          OrganisationID: mockAnalyticsEvents[1].OrganisationID,
        },
      ]);
    });

    it('should publish multiple analytics events to analytics queue with campaignID when provided.', async () => {
      // Arrange

      // Act
      await instance.publishMultipleEvents(mockAnalyticsWithCampaignEvents, NotificationStateEnum.VALIDATED);

      // Assert
      expect(serviceMocks.analyticsQueueServiceMock.publishMessageBatch).toHaveBeenCalledWith([
        {
          EventID: expect.schemaMatching(z.uuid()),
          NotificationID: mockAnalyticsWithCampaignEvents[0].NotificationID,
          DepartmentID: mockAnalyticsWithCampaignEvents[0].DepartmentID,
          CampaignID: mockAnalyticsWithCampaignEvents[0].CampaignID,
          APIGWExtendedID: mockAnalyticsWithCampaignEvents[0].APIGWExtendedID,
          EventDateTime: expect.schemaMatching(z.coerce.date()),
          Event: 'VALIDATED',
          OrganisationID: mockAnalyticsWithCampaignEvents[0].OrganisationID,
        },
        {
          EventID: expect.schemaMatching(z.uuid()),
          NotificationID: mockAnalyticsWithCampaignEvents[1].NotificationID,
          DepartmentID: mockAnalyticsWithCampaignEvents[1].DepartmentID,
          APIGWExtendedID: mockAnalyticsWithCampaignEvents[1].APIGWExtendedID,
          CampaignID: mockAnalyticsWithCampaignEvents[1].CampaignID,
          EventDateTime: expect.schemaMatching(z.coerce.date()),
          Event: 'VALIDATED',
          OrganisationID: mockAnalyticsWithCampaignEvents[1].OrganisationID,
        },
      ]);
    });

    it('should add a metric after publishing events', async () => {
      // Act
      await instance.publishMultipleEvents(mockAnalyticsEvents, NotificationStateEnum.VALIDATED);

      // Assert
      expect(observabilityMock.metrics.addMetric).toHaveBeenCalledWith(
        MetricsLabels.ANALYTICS_EVENT_VALIDATED,
        MetricUnit.Count,
        mockAnalyticsEvents.length
      );
    });

    it('should ignore empty arrays.', async () => {
      // Act
      await instance.publishMultipleEvents([], NotificationStateEnum.VALIDATED);

      // Assert
      expect(serviceMocks.analyticsQueueServiceMock.publishMessageBatch).not.toHaveBeenCalled();
    });
  });

  describe('publishEvent', () => {
    const mockAnalyticsEvent: AnalyticsEventFromIMessage = {
      NotificationID: '7351e7c8-7314-4d2b-a590-4f053c6ef80f',
      DepartmentID: 'Dev',
      APIGWExtendedID: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
      OrganisationID: 'ORD01',
    };

    const mockAnalyticsWithCampaignIDEvent: AnalyticsEventFromIMessage = {
      NotificationID: '7351e7c8-7314-4d2b-a590-4f053c6ef80f',
      DepartmentID: 'Dev',
      CampaignID: 'CAMP01',
      APIGWExtendedID: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
      OrganisationID: 'ORD01',
    };

    it('should publish an event to the event dynamo table', async () => {
      // Arrange

      // Act
      await instance.publishEvent(mockAnalyticsEvent, NotificationStateEnum.VALIDATED);

      // Assert
      expect(serviceMocks.analyticsQueueServiceMock.publishMessage).toHaveBeenCalledWith({
        EventID: expect.schemaMatching(z.uuid()),
        NotificationID: mockAnalyticsEvent.NotificationID,
        DepartmentID: mockAnalyticsEvent.DepartmentID,
        APIGWExtendedID: mockAnalyticsEvent.APIGWExtendedID,
        EventDateTime: expect.schemaMatching(z.coerce.date()),
        Event: 'VALIDATED',
        OrganisationID: mockAnalyticsEvent.OrganisationID,
      });
    });

    it('should publish an event to the analytics queue with campaignID when provided', async () => {
      // Arrange

      // Act
      await instance.publishEvent(mockAnalyticsWithCampaignIDEvent, NotificationStateEnum.VALIDATED);

      // Assert
      expect(serviceMocks.analyticsQueueServiceMock.publishMessage).toHaveBeenCalledWith({
        EventID: expect.schemaMatching(z.uuid()),
        NotificationID: mockAnalyticsWithCampaignIDEvent.NotificationID,
        DepartmentID: mockAnalyticsWithCampaignIDEvent.DepartmentID,
        CampaignID: mockAnalyticsWithCampaignIDEvent.CampaignID,
        APIGWExtendedID: mockAnalyticsWithCampaignIDEvent.APIGWExtendedID,
        EventDateTime: expect.schemaMatching(z.coerce.date()),
        Event: 'VALIDATED',
        OrganisationID: mockAnalyticsWithCampaignIDEvent.OrganisationID,
      });
    });

    it('should add a metric after publishing events', async () => {
      // Act
      await instance.publishEvent(mockAnalyticsEvent, NotificationStateEnum.VALIDATED);

      // Assert
      expect(observabilityMock.metrics.addMetric).toHaveBeenCalledWith(
        MetricsLabels.ANALYTICS_EVENT_VALIDATED,
        MetricUnit.Count,
        1
      );
    });
  });

  describe('createEvent', () => {
    const mockMessage = {
      NotificationID: '7351e7c8-7314-4d2b-a590-4f053c6ef80g',
      DepartmentID: 'Dev',
      CampaignID: 'CAMP01',
      APIGWExtendedID: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeg',
      OrganisationID: 'ORD01',
    };

    it('should return an event object when given a message and notification state.', () => {
      // Arrange

      // Act
      const result = instance.createEvent(mockMessage, NotificationStateEnum.VALIDATED);

      // Assert
      expect(result).toEqual({
        EventID: expect.schemaMatching(z.uuid()),
        NotificationID: mockMessage.NotificationID,
        DepartmentID: mockMessage.DepartmentID,
        CampaignID: mockMessage.CampaignID,
        APIGWExtendedID: mockMessage.APIGWExtendedID,
        EventDateTime: expect.schemaMatching(z.coerce.date()),
        Event: 'VALIDATED',
        OrganisationID: mockMessage.OrganisationID,
      });
    });
  });
});
