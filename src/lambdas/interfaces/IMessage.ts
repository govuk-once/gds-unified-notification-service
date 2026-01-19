import z from 'zod';

export const IMessageSchema = z.object({
  NotificationID: z.string(),
  DepartmentID: z.string(),
  UserID: z.string(),
  MessageTitle: z.string(),
  MessageBody: z.string(),
  MessageTitleFull: z.string(),
  MessageBodyFull: z.string(),
});

export type IMessage = z.infer<typeof IMessageSchema>;
