import { SqsRecordSchema } from '@aws-lambda-powertools/parser/schemas';
import { v4 as uuid } from 'uuid';
import z from 'zod';

// Identifiable Fields Schemas
export const IIdentifiableMessageSchema = z.object({
  // Generate NotificationIDs if not provided
  NotificationID: z.uuid({ version: 'v4' }).default(() => uuid()),
  UserID: z.string(),
  DepartmentID: z.string(),
});
export type IIdentifiableMessage = z.infer<typeof IIdentifiableMessageSchema>;

export const ISQSIdentifiableSchema = SqsRecordSchema.extend({
  body: IIdentifiableMessageSchema,
});

/**
 * Extracts ID fields from schema, useful when triggering atomic updates
 */
export const extractIdentifiers = (partial: IIdentifiableMessage) => ({
  NotificationID: partial.NotificationID,
  UserID: partial.UserID,
  DepartmentID: partial.DepartmentID,
});

// Message Fields Schemas
export const IMessageSchema = IIdentifiableMessageSchema.extend({
  NotificationTitle: z.string(),
  NotificationBody: z.string(),
  MessageTitle: z.string().optional(),
  MessageBody: z.string().optional(),
});
export type IMessage = z.infer<typeof IMessageSchema>;

export const ISQSMessageSchema = SqsRecordSchema.extend({
  body: IMessageSchema,
});

// Message fields schema with strict validation and contents validation
export const ISQSStrictMessageSchema = SqsRecordSchema.extend({ body: IMessageSchema.strict() });
