import z from 'zod';

export const IFlexNotificationSchema = z
  .object({
    NotificationID: z.string(),
    Status: z.string().optional(),
    NotificationTitle: z.string(),
    NotificationBody: z.string(),
    MessageTitle: z.string().optional(),
    MessageBody: z.string().optional(),
    DispatchedAt: z.string().optional(),
  })
  .transform((record) => ({
    ...record,
    MessageTitle: record.MessageTitle ?? record.NotificationTitle,
    MessageBody: record.MessageBody ?? record.NotificationBody,
  }));

export type IFlexNotification = z.infer<typeof IFlexNotificationSchema>;
