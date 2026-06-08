import { v4 as uuid } from 'uuid';
import z from 'zod';

// Identifiable Fields Schemas
export const IIdentifiableMessageSchema = z.object({
  // Generate NotificationIDs if not provided
  NotificationID: z.uuid({ version: 'v4' }).default(() => uuid()),
  DepartmentID: z.string(),
  UserID: z.string().optional(),
  CampaignID: z.string().optional(),
});
export type IIdentifiableMessage = z.infer<typeof IIdentifiableMessageSchema>;

/**
 * Extracts ID fields from schema, useful when triggering atomic updates
 */
export const extractIdentifiers = (partial: IIdentifiableMessage) => ({
  NotificationID: partial.NotificationID,
  UserID: partial.UserID,
  DepartmentID: partial.DepartmentID,
  CampaignID: partial.CampaignID,
});

// Message Fields Schemas
export const IMessageSchema = IIdentifiableMessageSchema.extend({
  UserID: z.string(),
  NotificationTitle: z.string(),
  NotificationBody: z.string(),
  MessageTitle: z.string().optional(),
  MessageBody: z.string().optional(),
});
export type IMessage = z.infer<typeof IMessageSchema>;
