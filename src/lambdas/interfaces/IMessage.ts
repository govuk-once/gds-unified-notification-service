import z from 'zod';

export const IMessageSchema = z.object({
  NotificationID: z.string(),
  UserID: z.string(),
  DepartmentID: z.string(),
  NotificationTitle: z.string(),
  NotificationBody: z.string(),
  MessageTitle: z.string().optional(),
  MessageBody: z.string().optional(),
});

export type IMessage = z.infer<typeof IMessageSchema>;

