import z from 'zod';

export const IFlexNotificationSchema = z.object({
  NotificationID: z.string(),
  Status: z.string(),
  DispatchedAt: z.string().catch(() => new Date().toISOString()), // TODO: Temp fallback for querying notifications that have not been yet dispatched, probs want to filter these out
  NotificationTitle: z.string(),
  NotificationBody: z.string(),
  MessageTitle: z.string().optional(),
  MessageBody: z.string().optional(),
});

export type IFlexNotification = z.infer<typeof IFlexNotificationSchema>;
