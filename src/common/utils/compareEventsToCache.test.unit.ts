import { NotificationStateEnum } from '@common/models';
import { ObservabilityService } from '@common/services';
import { compareEventsToCache } from '@common/utils/compareEventsToCache';
import { IAnalytics } from '@project/lambdas';
import { mockIMessageRecord, mockIProcessedMessage, observabilitySpies } from '@test/mocks';
import { Mocked } from 'vitest';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

describe('compareEventsToCache', () => {
  let observabilityMocks: Mocked<ObservabilityService>;

  beforeEach(() => {
    vi.resetAllMocks();
    observabilityMocks = observabilitySpies();
  });

  it('should return notification events when cached events are all present in notification', () => {
    // Arrange
    const message = mockIProcessedMessage();
    const events: IAnalytics[] = [
      {
        EventID: 'Event_1',
        OrganisationID: 'ORG01',
        NotificationID: message.NotificationID,
        Event: NotificationStateEnum.VALIDATED_API_CALL,
        EventDateTime: '2026-01-22T00:00:01Z',
        APIGWExtendedID: 'testExample',
      },
      {
        EventID: 'Event_2',
        OrganisationID: 'ORG01',
        NotificationID: message.NotificationID,
        Event: NotificationStateEnum.PROCESSING,
        EventDateTime: '2026-01-22T00:00:02Z',
        APIGWExtendedID: 'testExample',
      },
    ];
    const notification = mockIMessageRecord(message, { Events: events });
    const cachedEvents = events;

    // Act
    const result = compareEventsToCache(observabilityMocks, notification, cachedEvents);

    // Assert
    expect(result).toEqual(events);
  });

  it('should merge missing cached events into notification events', () => {
    // Arrange
    const message = mockIProcessedMessage();
    const notificationEvents = [
      {
        EventID: 'Event_1',
        OrganisationID: 'ORG01',
        NotificationID: message.NotificationID,
        Event: NotificationStateEnum.VALIDATED_API_CALL,
        EventDateTime: '2026-01-22T00:00:01Z',
        APIGWExtendedID: 'testExample',
      },
    ];
    const notification = mockIMessageRecord(message, { Events: notificationEvents });
    const cachedEvents: IAnalytics[] = [
      {
        EventID: 'Event_1',
        OrganisationID: 'ORG01',
        NotificationID: message.NotificationID,
        Event: NotificationStateEnum.VALIDATED_API_CALL,
        EventDateTime: '2026-01-22T00:00:01Z',
        APIGWExtendedID: 'testExample',
      },
      {
        EventID: 'Event_2',
        OrganisationID: 'ORG01',
        NotificationID: message.NotificationID,
        Event: NotificationStateEnum.PROCESSING,
        EventDateTime: '2026-01-22T00:00:02Z',
        APIGWExtendedID: 'testExample',
      },
    ];

    // Act
    const result = compareEventsToCache(observabilityMocks, notification, cachedEvents);

    // Assert
    expect(result).toHaveLength(2);
    expect(result).toEqual([
      {
        EventID: 'Event_1',
        OrganisationID: 'ORG01',
        NotificationID: message.NotificationID,
        Event: NotificationStateEnum.VALIDATED_API_CALL,
        EventDateTime: '2026-01-22T00:00:01Z',
        APIGWExtendedID: 'testExample',
      },
      {
        EventID: 'Event_2',
        OrganisationID: 'ORG01',
        NotificationID: message.NotificationID,
        Event: NotificationStateEnum.PROCESSING,
        EventDateTime: '2026-01-22T00:00:02Z',
        APIGWExtendedID: 'testExample',
      },
    ]);
  });

  it('should log retrieved cached event IDs', () => {
    // Arrange
    const message = mockIProcessedMessage();
    const notificationEvents = [
      {
        EventID: 'Event_1',
        OrganisationID: 'ORG01',
        NotificationID: message.NotificationID,
        Event: NotificationStateEnum.VALIDATED_API_CALL,
        EventDateTime: '2026-01-22T00:00:01Z',
        APIGWExtendedID: 'testExample',
      },
    ];
    const notification = mockIMessageRecord(message, { Events: notificationEvents });
    const cachedEvents: IAnalytics[] = [
      {
        EventID: 'Event_2',
        OrganisationID: 'ORG01',
        NotificationID: message.NotificationID,
        Event: NotificationStateEnum.VALIDATED_API_CALL,
        EventDateTime: '2026-01-22T00:00:01Z',
        APIGWExtendedID: 'testExample',
      },
    ];

    // Act
    compareEventsToCache(observabilityMocks, notification, cachedEvents);

    // Assert
    expect(observabilityMocks.logger.info).toHaveBeenCalledWith('Retrieved events from cache', {
      EventIDs: ['Event_2'],
    });
  });

  it('should log missing event IDs when cached events are not in notification', () => {
    // Arrange
    const message = mockIProcessedMessage();
    const notificationEvents = [
      {
        EventID: 'Event_1',
        OrganisationID: 'ORG01',
        NotificationID: message.NotificationID,
        Event: NotificationStateEnum.VALIDATED_API_CALL,
        EventDateTime: '2026-01-22T00:00:01Z',
        APIGWExtendedID: 'testExample',
      },
    ];
    const notification = mockIMessageRecord(message, { Events: notificationEvents });
    const cachedEvents: IAnalytics[] = [
      {
        EventID: 'Event_2',
        OrganisationID: 'ORG01',
        NotificationID: message.NotificationID,
        Event: NotificationStateEnum.PROCESSING,
        EventDateTime: '2026-01-22T00:00:01Z',
        APIGWExtendedID: 'testExample',
      },
    ];

    compareEventsToCache(observabilityMocks, notification, cachedEvents);

    expect(observabilityMocks.logger.info).toHaveBeenCalledWith('Events missing from dynamo records', {
      MissingEventIDs: ['Event_2'],
    });
  });

  it('should not log missing events when all cached events exist in notification', () => {
    // Arrange
    const message = mockIProcessedMessage();
    const notificationEvents = [
      {
        EventID: 'Event_1',
        OrganisationID: 'ORG01',
        NotificationID: message.NotificationID,
        Event: NotificationStateEnum.VALIDATED_API_CALL,
        EventDateTime: '2026-01-22T00:00:01Z',
        APIGWExtendedID: 'testExample',
      },
    ];
    const notification = mockIMessageRecord(message, { Events: notificationEvents });
    const cachedEvents: IAnalytics[] = [
      {
        EventID: 'Event_1',
        OrganisationID: 'ORG01',
        NotificationID: message.NotificationID,
        Event: NotificationStateEnum.VALIDATED_API_CALL,
        EventDateTime: '2026-01-22T00:00:01Z',
        APIGWExtendedID: 'testExample',
      },
    ];

    compareEventsToCache(observabilityMocks, notification, cachedEvents);

    expect(observabilityMocks.logger.info).toHaveBeenCalledTimes(1);
    expect(observabilityMocks.logger.info).not.toHaveBeenCalledWith(
      'Events missing from dynamo records',
      expect.anything()
    );
  });

  it('should return all cached events when notification has no events', () => {
    // Arrange
    const message = mockIProcessedMessage();
    const notification = mockIMessageRecord(message);
    const cachedEvents: IAnalytics[] = [
      {
        EventID: 'Event_1',
        OrganisationID: 'ORG01',
        NotificationID: message.NotificationID,
        Event: NotificationStateEnum.VALIDATED_API_CALL,
        EventDateTime: '2026-01-22T00:00:01Z',
        APIGWExtendedID: 'testExample',
      },
    ];

    const result = compareEventsToCache(observabilityMocks, notification, cachedEvents);

    expect(result).toEqual(cachedEvents);
  });
});
