import { v4 as uuid } from 'uuid'; // Assuming uuid import
import { z } from 'zod';

// Core Identifiable Fields Schema
export const IIdentifiableMessageSchema = z.object({
  // Generate NotificationIDs if not provided
  NotificationID: z.uuid({ version: 'v4' }).default(() => uuid()),
  OrganisationID: z.string(),
  DepartmentID: z.string().optional(),
  UserID: z.string().optional(),
  CampaignID: z.string().optional(),
});
export type IIdentifiableMessage = z.infer<typeof IIdentifiableMessageSchema>;

// Base Message Content Fields Schema
export const IMessageFields = z.object({
  NotificationTitle: z.string(),
  NotificationBody: z.string(),
  MessageTitle: z.string().optional(),
  MessageBody: z.string().optional(),
  DeeplinkURL: z.string().optional(),
  ExpiresInDays: z.int().positive().optional(),
});

// Pre-validated Message Schema
// Omits OrganisationID and makes content fields optional
export const IPrevalidatedMessageSchema = IIdentifiableMessageSchema.omit({ OrganisationID: true }).extend(
  IMessageFields.partial().shape
);
export type IPrevalidatedMessage = z.infer<typeof IPrevalidatedMessageSchema>;

// Validated Message Schema
// Merges identifier and content fields, making UserID strictly required
export const IValidateMessageSchema = IPrevalidatedMessageSchema.extend({
  ...IMessageFields.shape,
  UserID: z.string(),
});
export type IValidatedMessage = z.infer<typeof IValidateMessageSchema>;

// Message Schema
// Includes the organisation into the validated message after it has been retrieved from the mTLS
export const IMessageSchema = IValidateMessageSchema.extend({
  OrganisationID: z.string(),
});
export type IMessage = z.infer<typeof IMessageSchema>;

// Processed Message Schema
// Extends validated schema, restoring optional UserID for group message and adding ExternalUserID
export const IProcessedMessageSchema = IMessageSchema.extend({
  UserID: z.string().optional(),
  ExternalUserID: z.string(),
});
export type IProcessedMessage = z.infer<typeof IProcessedMessageSchema>;

/**
 * Extracts ID fields from schema, useful when triggering atomic updates
 */
export const extractIdentifiers = (partial: IIdentifiableMessage) => ({
  NotificationID: partial.NotificationID,
  UserID: partial.UserID,
  DepartmentID: partial.DepartmentID,
  CampaignID: partial.CampaignID,
  OrganisationID: partial.OrganisationID,
});
