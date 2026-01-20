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

export const IMessageArraySchema = z.array(z.object({ body: IMessageSchema }));

export type IMessage = z.infer<typeof IMessageSchema>;
export type IMessageArray = z.infer<typeof IMessageArraySchema>;
