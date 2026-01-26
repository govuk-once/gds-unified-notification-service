import { IMessageSchema } from '@project/lambdas/interfaces/IMessage';
import z from 'zod';

export const IProcessedMessageMessageSchema = IMessageSchema.extend({
  ExternalUserID: z.string(),
});

export type IProcessedMessage = z.infer<typeof IProcessedMessageMessageSchema>;
