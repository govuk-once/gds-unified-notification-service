import { IGroupMessageSchema } from '@project/lambdas/interfaces/IGroupMessage';
import z from 'zod';

export const IGroupMessageMetadataSchema = z.object({
  GroupMessage: IGroupMessageSchema.extend({ GroupNotificationID: z.string() }),
  GroupNotificationID: z.string(),
  WorkerID: z.number(),
  CacheKey: z.string(),
  APIGWExtendedID: z.string().optional(),
  ReceivedDateTime: z.string().optional(),
  ValidatedDateTime: z.string().optional(),
});

export type IGroupMessageMetadata = z.infer<typeof IGroupMessageMetadataSchema>;
