import { IAnalyticsSchema } from '@project/lambdas/interfaces/IAnalyticsSchema';
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
