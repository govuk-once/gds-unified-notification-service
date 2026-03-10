import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import { IMessageRecord, IMessageRecordSchema } from '@project/lambdas/interfaces/IMessageRecord';
import z from 'zod';

const fields = {
  NotificationID: true,
  NotificationTitle: true,
  NotificationBody: true,
  MessageTitle: true,
  MessageBody: true,
  DispatchedAt: true,
} as const;

export const IFlexNotificationSchemaWithEvents = IMessageRecordSchema.pick({
  ...fields,
  // Not part of schema but used when inferring status, then dropped
  Events: true,
})
  .extend({ Status: z.enum(NotificationStateEnum).optional() })
  .transform((record) => ({
    ...record,
    // Backfill message title and body from notification fields as a fallback
    MessageTitle: record.MessageTitle ?? record.NotificationTitle,
    MessageBody: record.MessageBody ?? record.NotificationBody,
    // Infer status based on most recent event
    Status:
      [...(record.Events ?? [])].sort((a, b) => a.EventDateTime.localeCompare(b.EventDateTime)).pop()?.Event ??
      NotificationStateEnum.UNKNOWN,
    // Drop events from schema
    Events: [],
  }));

export const IFlexNotificationSchema = IMessageRecordSchema.extend({
  Status: z.enum(NotificationStateEnum).optional(),
}).pick({
  ...fields,
  Status: true,
});

export type IFlexNotification = z.infer<typeof IFlexNotificationSchema>;

export const IMessageRecordToIFlexNotification = (item: IMessageRecord) => {
  // Process the payloads, backfil message title & body, infer status
  const initial = IFlexNotificationSchemaWithEvents.parse(item);

  // Drop unnecessary properties
  return IFlexNotificationSchema.parse(initial);
};
