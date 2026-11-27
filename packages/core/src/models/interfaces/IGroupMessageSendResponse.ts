import z from 'zod';

export const PostGroupMessageResponseSchema = z.array(
  z.object({
    GroupNotificationID: z.string(),
    UsersInGroup: z.int().min(0),
  })
);

export type PostGroupMessageResponse = z.infer<typeof PostGroupMessageResponseSchema>;
