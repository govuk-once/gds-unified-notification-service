import z from 'zod';

export const IIdentifieableMessageSchema = z.object({
  NotificationID: z.string(),
  UserID: z.string(),
  DepartmentID: z.string(),
});
export type IIdentifieableMessage = z.infer<typeof IIdentifieableMessageSchema>;

/**
 * Extracts ID fields from schema, useful when triggering atomic updates
 */
export const extractIdentifiers = (partial: IIdentifieableMessage) => ({
  NotificationID: partial.NotificationID,
  UserID: partial.UserID,
  DepartmentID: partial.DepartmentID,
});

export const IMessageSchema = IIdentifieableMessageSchema.extend({
  NotificationTitle: z.string(),
  NotificationBody: z.string(),
  MessageTitle: z.string().optional(),
  MessageBody: z.string().optional(),
});

export type IMessage = z.infer<typeof IMessageSchema>;
