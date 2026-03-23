import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import { GetNotificationByIDResponse as IFlexNotificationBase } from '@generated/flex';
import { IMessageRecord } from '@project/lambdas/interfaces/IMessageRecord';
import z from 'zod';

export const IFlexNotificationSchema = IFlexNotificationBase.transform((record) => ({
  ...record,
  // Backfill message title and body from notification fields as a fallback
  MessageTitle: record.MessageTitle ?? record.NotificationTitle,
  MessageBody: record.MessageBody ?? record.NotificationBody,
}));

export type IFlexNotification = z.infer<typeof IFlexNotificationSchema>;

export const IMessageRecordToIFlexNotification = (item: IMessageRecord): IFlexNotification => {
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
    Status:
      [...(item.Events ?? [])].sort((a, b) => a.EventDateTime.localeCompare(b.EventDateTime)).pop()?.Event ??
      NotificationStateEnum.UNKNOWN,
  });
};
