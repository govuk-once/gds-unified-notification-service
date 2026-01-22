import { IMessageSchema } from '@project/lambdas/interfaces/IMessage';
import z from 'zod';

export const IProcessedMessagMessageSchema = IMessageSchema.extend({
  ExternalUserID: z.string(),
});

export type IProcessedMessage = z.infer<typeof IProcessedMessagMessageSchema>;
