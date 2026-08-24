import { ChannelsEnum } from '@common/models';
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
export const IMessageFieldsSchema = z.object({
  NotificationTitle: z.string(),
  NotificationBody: z.string(),
  MessageTitle: z.string().optional(),
  MessageBody: z.string().optional(),
  DeeplinkURL: z.string().optional(),
  Channel: z.enum(ChannelsEnum).optional(),
  ExpiresInDays: z.int().positive().optional(),
});
export type IMessageFields = z.infer<typeof IMessageFieldsSchema>;

// Pre-validated Message Schema
// Omits OrganisationID and makes content fields optional
export const IPrevalidatedMessageSchema = IIdentifiableMessageSchema.omit({ OrganisationID: true }).extend(
  IMessageFieldsSchema.partial().shape
);
export type IPrevalidatedMessage = z.infer<typeof IPrevalidatedMessageSchema>;

// Validated Message Schema
// Merges identifier and content fields, making UserID strictly required
export const IValidateMessageSchema = IPrevalidatedMessageSchema.extend({
  ...IMessageFieldsSchema.shape,
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

/**
 * Test Fixtures
 */
export const mockIMessage = (): IMessage => ({
  NotificationID: uuid(),
  DepartmentID: 'TEST01',
  UserID: 'UserID',
  CampaignID: 'CAM_ID',
  NotificationTitle: 'Hi there',
  NotificationBody: 'You have a new message in the message center',
  MessageTitle: 'Hi there',
  MessageBody: 'MOCK_LONG_MESSAGE',
  OrganisationID: 'ORG01',
});

export const mockIMessage_NoOrgID = (): Omit<IMessage, 'OrganisationID'> => ({
  NotificationID: uuid(),
  DepartmentID: 'TEST01',
  UserID: 'UserID',
  CampaignID: 'CAM_ID',
  NotificationTitle: 'Hi there',
  NotificationBody: 'You have a new message in the message center',
  MessageTitle: 'Hi there',
  MessageBody: 'MOCK_LONG_MESSAGE',
});

export const mockFailedIMessage = (): IMessage =>
  ({
    NotificationID: uuid(),
    UserID: 'invalid-id',
    DepartmentID: 'invalid-id',
    CampaignID: 'CAMP01',
    OrganisationID: 'ORG01',
  }) as unknown as IMessage;

export const mockUnidentifiableIMessage = (): IMessage =>
  ({
    NotificationID: 'invalid-notification-id',
    UserID: 'invalid-id',
    NotificationTitle: 'Boom',
    NotificationBody: 'psst',
  }) as unknown as IMessage;

export const mockIProcessedMessage = (): IProcessedMessage => {
  const message = mockIMessage();
  return {
    ...message,
    ExternalUserID: 'test_2',
  };
};

export const mockFailedIProcessedMessage = (): IProcessedMessage => {
  const failedMessageBody = mockFailedIMessage();
  return {
    ...failedMessageBody,
    ExternalUserID: 'test_2',
  };
};
