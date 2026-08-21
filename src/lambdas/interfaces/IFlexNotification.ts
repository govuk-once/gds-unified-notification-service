import { NotificationDispatchedStateEnum, NotificationStateEnum } from '@common/models/NotificationStateEnum';
import { IMessageRecordSchema, IProcessedMessageRecord } from '@common/repositories/interfaces/IMessageRecord';
import { IOrganisationRecord } from '@common/repositories/interfaces/IOrganisationRecord';
import { ObservabilityService } from '@common/services';
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
  observability: ObservabilityService
): IFlexNotification | undefined => {
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

/**
 * Test Fixtures
 */
export const mockIFlexNotification = (): IFlexNotification => ({
  DispatchedDateTime: '2026-01-01T12:00:03.000Z',
  MessageBody: 'Open Notification Centre to read your notifications',
  MessageTitle: 'You have a new Message',
  NotificationBody: 'Here is the Notification body.',
  NotificationID: 'efe72235-d02a-45a9-b9d4-a04ff992fcc3',
  NotificationTitle: 'You have a new Notification',
  Status: NotificationStateEnum.RECEIVED,
  Metadata: {
    Sender: {
      DisplayName: 'ORG',
    },
  },
});
