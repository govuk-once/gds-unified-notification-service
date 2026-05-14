import { v4 as uuid } from 'uuid';
import z from 'zod';

export const IIdentifieableMessageSchema = z.object({
  // Generate NotificationIDs if not provided
  NotificationID: z.uuid({ version: 'v4' }).default(() => uuid()),
  UserID: z.string(),
  DepartmentID: z.string(),
  CampaignID: z.string().optional(),
});
export type IIdentifieableMessage = z.infer<typeof IIdentifieableMessageSchema>;

/**
 * Extracts ID fields from schema, useful when triggering atomic updates
 */
export const extractIdentifiers = (partial: IIdentifieableMessage) => ({
  NotificationID: partial.NotificationID,
  UserID: partial.UserID,
  DepartmentID: partial.DepartmentID,
  CampaignID: partial.CampaignID,
});

export const IMessageSchema = IIdentifieableMessageSchema.extend({
  NotificationTitle: z.string(),
  NotificationBody: z.string(),
  MessageTitle: z.string().optional(),
  MessageBody: z.string().optional(),
});

export type IMessage = z.infer<typeof IMessageSchema>;
