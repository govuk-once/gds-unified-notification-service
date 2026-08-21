import { IProcessedMessage } from '@project/lambdas';
import { IAnalytics, IAnalyticsSchema } from '@project/lambdas/interfaces/IAnalyticsSchema';
import * as z from 'zod';

export const IMessageRecordSchema = z.object({
  // IDs
  NotificationID: z.string(),
  OrganisationID: z.string(), // Derived from the mTLS certificate
  DepartmentID: z.string().optional(),
  UserID: z.string().optional(), // ID Supplied by PSO's
  ExternalUserID: z.string().optional(), // ID Resolved via UDP using PSO's UserID
  CampaignID: z.string().optional(),

  // Tracing IDs
  ExternalResponseID: z.string().optional(),
  APIGWExtendedID: z.string().optional(),

  // Contents
  NotificationTitle: z.string(),
  NotificationBody: z.string(),
  MessageTitle: z.string().optional(),
  MessageBody: z.string().optional(),
  DeeplinkURL: z.string().optional(),

  // Event timestamps - triggered during handler logic
  ReceivedDateTime: z.string().optional(),
  ValidatedDateTime: z.string().optional(),
  ProcessedDateTime: z.string().optional(),
  DispatchedDateTime: z.string().optional(),
  ExpirationDateTime: z.string().optional(),

  // Configurations
  RequestedDaysToExpire: z.int().positive().optional(),

  // Events - appended via analytics handler
  Events: z.array(IAnalyticsSchema),
});
export type IMessageRecord = z.infer<typeof IMessageRecordSchema>;

export const IProcessedMessageRecordSchema = IMessageRecordSchema.extend({
  ExternalUserID: z.string(),
  ReceivedDateTime: z.string(),
  ValidatedDateTime: z.string(),
  ProcessedDateTime: z.string(),
  ExpirationDateTime: z.string(),
});
export type IProcessedMessageRecord = z.infer<typeof IProcessedMessageRecordSchema>;

/**
 * Test Fixtures
 */
export const mockIMessageRecord = (
  message: Omit<IProcessedMessage, 'UserID'>,
  metadata?: {
    APIGWExtendedID?: boolean;
    ReceivedDateTime?: boolean;
    ValidatedDateTime?: boolean;
    ProcessedDateTime?: boolean;
    DispatchedDateTime?: boolean;
    ExpirationDateTime?: boolean;
    Events?: IAnalytics[];
  }
): IMessageRecord => ({
  NotificationID: message.NotificationID,
  CampaignID: message.CampaignID,
  OrganisationID: message.OrganisationID,
  ExternalUserID: message?.ExternalUserID,
  NotificationTitle: message.NotificationTitle,
  NotificationBody: message.NotificationBody,
  MessageTitle: message.MessageTitle,
  MessageBody: message.MessageBody,
  Events: metadata?.Events ?? [],
  APIGWExtendedID: metadata?.APIGWExtendedID ? 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef' : undefined,
  ReceivedDateTime: metadata?.ReceivedDateTime ? '2026-01-01T12:00:00.000Z' : undefined,
  ValidatedDateTime: metadata?.ReceivedDateTime ? '2026-01-01T12:00:01.000Z' : undefined,
  ProcessedDateTime: metadata?.ReceivedDateTime ? '2026-01-01T12:00:02.000Z' : undefined,
  DispatchedDateTime: metadata?.DispatchedDateTime ? '2026-01-01T12:00:03.000Z' : undefined,
  ExpirationDateTime: metadata?.ExpirationDateTime ? '2100-01-31T12:00:00.000Z' : undefined,
});

export const mockIProcessedMessageRecord = (
  message: IProcessedMessage,
  metadata?: {
    DispatchedDateTime?: boolean;
    Events?: IAnalytics[];
  }
): IProcessedMessageRecord => ({
  NotificationID: message.NotificationID,
  CampaignID: message.CampaignID,
  OrganisationID: message.OrganisationID,
  ExternalUserID: message.ExternalUserID,
  NotificationTitle: message.NotificationTitle,
  NotificationBody: message.NotificationBody,
  MessageTitle: message.MessageTitle,
  MessageBody: message.MessageBody,
  Events: metadata?.Events ?? [],
  APIGWExtendedID: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
  ReceivedDateTime: '2026-01-01T12:00:00.000Z',
  ValidatedDateTime: '2026-01-01T12:00:01.000Z',
  ProcessedDateTime: '2026-01-01T12:00:02.000Z',
  DispatchedDateTime: metadata?.DispatchedDateTime ? '2026-01-01T12:00:03.000Z' : undefined,
  ExpirationDateTime: '2100-01-31T12:00:00.000Z',
});
