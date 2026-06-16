import { NotificationDispatchedStateEnum, NotificationStateEnum } from '@common/models/NotificationStateEnum';
import { ObservabilityService } from '@common/services';
import { IMessageRecord, IMessageRecordSchema } from '@project/lambdas/interfaces/IMessageRecord';
import { IOrganisationRecord } from '@project/lambdas/interfaces/IOrganisationRecord';
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
  item: IMessageRecord,
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
    DispatchedDateTime: item.DispatchedDateTime,
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
