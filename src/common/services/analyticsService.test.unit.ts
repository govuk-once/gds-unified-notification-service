import { MetricUnit } from '@aws-lambda-powertools/metrics';
import { NotificationStateEnum } from '@common/models';
import { AnalyticsEventFromIMessage, AnalyticsService } from '@common/services/analyticsService';
import { MetricsLabels } from '@common/services/observabilityService';
import {
  iocSpies,
  mockAnalyticsEvents,
  mockAnalyticsWithCampaignEvents,
  mockServicesExpectedBehaviour,
} from '@test/mocks';
import z from 'zod';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/services/configurationService', { spy: true });
vi.mock('@common/services/analyticsQueueService', { spy: true });

describe('analyticsService', () => {
  let instance: AnalyticsService;

  // Initialize mock services, clients, and repositories
  const { observabilityMocks, serviceMocks } = iocSpies();

  // Test Fixtures
  const analyticsEvents = mockAnalyticsEvents();
  const analyticsWithCampaignEvents = mockAnalyticsWithCampaignEvents();

  beforeEach(() => {
    // Reset all mock
    vi.resetAllMocks();
    vi.useRealTimers();

    // Mock expected aws clients responses
    mockServicesExpectedBehaviour(serviceMocks);

    instance = new AnalyticsService(observabilityMocks, serviceMocks.analyticsQueueServiceMock);
  });

  describe('publishMultipleEvents', () => {
    it('should publish multiple events to the event dynamo table', async () => {
      // Act
      await instance.publishMultipleEvents(analyticsEvents, NotificationStateEnum.VALIDATED);

      // Assert
      expect(serviceMocks.analyticsQueueServiceMock.publishMessageBatch).toHaveBeenCalledWith([
        {
          EventID: expect.schemaMatching(z.uuid()),
          NotificationID: analyticsEvents[0].NotificationID,
          DepartmentID: analyticsEvents[0].DepartmentID,
          APIGWExtendedID: analyticsEvents[0].APIGWExtendedID,
          EventDateTime: expect.schemaMatching(z.coerce.date()),
          Event: 'VALIDATED',
          CampaignID: analyticsEvents[0].CampaignID,
          OrganisationID: analyticsEvents[0].OrganisationID,
        },
        {
          EventID: expect.schemaMatching(z.uuid()),
          NotificationID: analyticsEvents[1].NotificationID,
          DepartmentID: analyticsEvents[1].DepartmentID,
          APIGWExtendedID: analyticsEvents[1].APIGWExtendedID,
          EventDateTime: expect.schemaMatching(z.coerce.date()),
          Event: 'VALIDATED',
          CampaignID: analyticsEvents[1].CampaignID,
          OrganisationID: analyticsEvents[1].OrganisationID,
        },
      ]);
    });

    it('should publish multiple analytics events to analytics queue with campaignID when provided.', async () => {
      // Act
      await instance.publishMultipleEvents(analyticsWithCampaignEvents, NotificationStateEnum.VALIDATED);

      // Assert
      expect(serviceMocks.analyticsQueueServiceMock.publishMessageBatch).toHaveBeenCalledWith([
        {
          EventID: expect.schemaMatching(z.uuid()),
          NotificationID: analyticsWithCampaignEvents[0].NotificationID,
          DepartmentID: analyticsWithCampaignEvents[0].DepartmentID,
          CampaignID: analyticsWithCampaignEvents[0].CampaignID,
          APIGWExtendedID: analyticsWithCampaignEvents[0].APIGWExtendedID,
          EventDateTime: expect.schemaMatching(z.coerce.date()),
          Event: 'VALIDATED',
          OrganisationID: analyticsWithCampaignEvents[0].OrganisationID,
        },
        {
          EventID: expect.schemaMatching(z.uuid()),
          NotificationID: analyticsWithCampaignEvents[1].NotificationID,
          DepartmentID: analyticsWithCampaignEvents[1].DepartmentID,
          APIGWExtendedID: analyticsWithCampaignEvents[1].APIGWExtendedID,
          CampaignID: analyticsWithCampaignEvents[1].CampaignID,
          EventDateTime: expect.schemaMatching(z.coerce.date()),
          Event: 'VALIDATED',
          OrganisationID: analyticsWithCampaignEvents[1].OrganisationID,
        },
      ]);
    });

    it('should add a metric after publishing events', async () => {
      // Act
      await instance.publishMultipleEvents(analyticsEvents, NotificationStateEnum.VALIDATED);

      // Assert
      expect(observabilityMocks.metrics.addMetric).toHaveBeenCalledWith(
        MetricsLabels.ANALYTICS_EVENT_VALIDATED,
        MetricUnit.Count,
        analyticsEvents.length
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
      expect(observabilityMocks.metrics.addMetric).toHaveBeenCalledWith(
        MetricsLabels.ANALYTICS_EVENT_VALIDATED,
        MetricUnit.Count,
        1
      );
    });
  });

  describe('createEvent', () => {
    it('should return an event object when given a message and notification state.', () => {
      // Act
      const result = instance.createEvent(analyticsWithCampaignEvents[0], NotificationStateEnum.VALIDATED);

      // Assert
      expect(result).toEqual({
        EventID: expect.schemaMatching(z.uuid()),
        NotificationID: analyticsWithCampaignEvents[0].NotificationID,
        DepartmentID: analyticsWithCampaignEvents[0].DepartmentID,
        CampaignID: analyticsWithCampaignEvents[0].CampaignID,
        APIGWExtendedID: analyticsWithCampaignEvents[0].APIGWExtendedID,
        EventDateTime: expect.schemaMatching(z.coerce.date()),
        Event: 'VALIDATED',
        OrganisationID: analyticsWithCampaignEvents[0].OrganisationID,
      });
    });
  });
});
