import { IMessageRecord } from '@common/repositories';
import { ObservabilityService } from '@common/services';
import { IAnalytics } from '@project/lambdas';

export const compareEventsToCache = (
  observability: ObservabilityService,
  notification: IMessageRecord,
  cachedEvents: IAnalytics[]
): IAnalytics[] => {
  observability.logger.info(`Retrieved events from cache`, {
    EventIDs: cachedEvents.map(({ EventID }) => EventID),
  });
  const notificationEventIDs = new Set(notification.Events.map((n) => n.EventID));
  const missingEvents = cachedEvents.filter((e) => !notificationEventIDs.has(e.EventID));

  if (missingEvents.length > 0) {
    observability.logger.info(`Events missing from dynamo records`, {
      MissingEventIDs: missingEvents.map(({ EventID }) => EventID),
    });
  }

  return [...notification.Events, ...missingEvents];
};
