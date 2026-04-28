import { NotificationDispatchedStateEnum, NotificationStateEnum } from '@common/models/NotificationStateEnum';
import { IMessageRecord, IMessageRecordSchema } from '@project/lambdas/interfaces/IMessageRecord';
import z from 'zod';

export const IFlexNotificationSchema = IMessageRecordSchema.pick({
  NotificationID: true,
  NotificationTitle: true,
  NotificationBody: true,
  MessageTitle: true,
  MessageBody: true,
  DispatchedDateTime: true,
})
  .extend({ Status: z.enum(NotificationDispatchedStateEnum) })
  .transform((record) => ({
    ...record,
    // Backfill message title and body from notification fields as a fallback
    MessageTitle: record.MessageTitle ?? record.NotificationTitle,
    MessageBody: record.MessageBody ?? record.NotificationBody,
  }));

export type IFlexNotification = z.infer<typeof IFlexNotificationSchema>;

export const IMessageRecordToIFlexNotification = (item: IMessageRecord): IFlexNotification => {
  const latestEvent = [...(item.Events ?? [])]
    .filter((e) => Object.values(NotificationDispatchedStateEnum).includes(e.Event as NotificationDispatchedStateEnum))
    .sort((a, b) => a.EventDateTime.localeCompare(b.EventDateTime))
    .pop()?.Event as NotificationDispatchedStateEnum | undefined;

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
    Status: latestEvent == undefined ? NotificationStateEnum.RECEIVED : latestEvent,
  });
};
