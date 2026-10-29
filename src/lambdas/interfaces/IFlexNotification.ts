import { NotificationDispatchedStateEnum, NotificationStateEnum } from '@common/models/NotificationStateEnum';
import { IMessageRecordSchema, IProcessedMessageRecord } from '@common/repositories/interfaces/IMessageRecord';
import { IOrganisationRecord } from '@common/repositories/interfaces/IOrganisationRecord';
import { ObservabilityService } from '@common/services';
import { IAnalytics } from '@project/lambdas/interfaces/IAnalyticsSchema';
import z from 'zod';

export const IFlexNotificationSchema = IMessageRecordSchema.pick({
  NotificationID: true,
  NotificationTitle: true,
  NotificationBody: true,
  MessageTitle: true,
  MessageBody: true,
  DispatchedDateTime: true,
})
  .extend({
    Status: z.enum(NotificationDispatchedStateEnum),
    Metadata: z.object({ Sender: z.object({ DisplayName: z.string() }) }),
  })
  .transform((record) => ({
    ...record,
    // Backfill message title and body from notification fields as a fallback
    MessageTitle: record.MessageTitle ?? record.NotificationTitle,
    MessageBody: record.MessageBody ?? record.NotificationBody,
  }));

export type IFlexNotification = z.infer<typeof IFlexNotificationSchema>;

export const IMessageRecordToIFlexNotification = (
  item: IProcessedMessageRecord,
  organisations: IOrganisationRecord[],
  observability: ObservabilityService,
  cachedEvents: IAnalytics[]
): IFlexNotification | undefined => {
  // Compared dynamo record to cached events and adds any missing events to response
  if (cachedEvents?.length > 0) {
    observability.logger.info(`Retrieved events from cache`, {
      EventIDs: cachedEvents.map(({ EventID }) => EventID),
    });
    const notificationEventIDs = new Set(item.Events.map((n) => n.EventID));
    const missingEvents = cachedEvents.filter((e) => !notificationEventIDs.has(e.EventID));

    if (missingEvents.length > 0) {
      observability.logger.info(`Events missing from dynamo records`, {
        MissingEventIDs: missingEvents.map(({ EventID }) => EventID),
      });
    }

    item.Events = [...item.Events, ...missingEvents];
  }

  const latestEvent = [...(item.Events ?? [])]
    .filter((e) => Object.values(NotificationDispatchedStateEnum).includes(e.Event as NotificationDispatchedStateEnum))
    .sort((a, b) => a.EventDateTime.localeCompare(b.EventDateTime))
    .pop()?.Event as NotificationDispatchedStateEnum | undefined;

  const organisation = organisations.find((x) => x.OrganisationID === item.OrganisationID);

  if (!organisation) {
    observability.logger.warn('No organisation matches the DepartmentID in the notification.', {
      OrganisationID: item.OrganisationID,
    });
    return undefined;
  }

  // Drop unnecessary properties
  return IFlexNotificationSchema.parse({
    // Explicitly map
    NotificationID: item.NotificationID,
    NotificationTitle: item.NotificationTitle,
    NotificationBody: item.NotificationBody,
    MessageTitle: item.MessageTitle,
    MessageBody: item.MessageBody,
    DispatchedDateTime: item.DispatchedDateTime ?? item.ReceivedDateTime ?? new Date().toISOString(),
    // Infer status from Events
    Status: latestEvent ?? NotificationStateEnum.RECEIVED,
    // Fetch display name from DynamoDB
    Metadata: {
      Sender: {
        DisplayName: organisation.DisplayName,
      },
    },
  });
};
