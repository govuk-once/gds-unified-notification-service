import z from 'zod';

export const IMessageSchema = z.object({
  NotificationID: z.string(),
  DepartmentID: z.string(),
  UserID: z.string(),
  NotificationTitle: z.string(),
  NotificationBody: z.string(),
  MessageTitle: z.string(),
  MessageBody: z.string(),
});

export type IMessage = z.infer<typeof IMessageSchema>;
