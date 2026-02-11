import z from 'zod';

export const IFlexNotificationSchema = z.object({
  NotificationID: z.string(),
  Status: z.string(),
  NotificationTitle: z.string(),
  NotificationBody: z.string(),
  MessageTitle: z.string(),
  MessageBody: z.string(),
  DispatchedAt: z.string(),
});

export type IFlexNotificationSchema = z.infer<typeof IFlexNotificationSchema>;
