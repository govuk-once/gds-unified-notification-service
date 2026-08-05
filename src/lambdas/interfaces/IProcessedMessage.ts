import { IMessageSchema } from '@project/lambdas/interfaces/IMessage';
import z from 'zod';

export const IProcessedMessageSchema = IMessageSchema.extend({
  UserID: z.string().optional(),
  ExternalUserID: z.string(),
});

export type IProcessedMessage = z.infer<typeof IProcessedMessageSchema>;
