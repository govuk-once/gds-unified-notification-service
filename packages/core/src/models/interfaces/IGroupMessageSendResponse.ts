import z from 'zod';

export const IGroupMessageSendResponseSchema = z.array(
  z.object({
    GroupNotificationID: z.string(),
    UsersInGroup: z.int().min(0),
  })
);

export type IGroupMessageSendResponse = z.infer<typeof IGroupMessageSendResponseSchema>;
