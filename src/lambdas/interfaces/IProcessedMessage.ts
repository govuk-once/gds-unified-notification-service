import { SqsRecordSchema } from '@aws-lambda-powertools/parser/schemas';
import { IMessageSchema } from '@project/lambdas/interfaces/IMessage';
import z from 'zod';

export const IProcessedMessageSchema = IMessageSchema.extend({
  ExternalUserID: z.string(),
});

export type IProcessedMessage = z.infer<typeof IProcessedMessageSchema>;

export const ISQSProcessedMessageSchema = SqsRecordSchema.extend({ body: IProcessedMessageSchema });
