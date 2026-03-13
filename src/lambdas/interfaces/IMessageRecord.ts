import { IAnalyticsSchema } from '@project/lambdas/interfaces/IAnalyticsSchema';
import * as z from 'zod';

export const IMessageRecordSchema = z.object({
  // IDs
  NotificationID: z.string(),
  DepartmentID: z.string(),
  UserID: z.string(),

  // External ids
  TraceID: z.string().optional(),
  ExternalResponseID: z.string().optional(),
  OneSignalID: z.string().optional(),
  APIGWExtendedID: z.string().optional(),
  ExternalUserID: z.string().optional(),

  // Contents
  NotificationTitle: z.string(),
  NotificationBody: z.string(),
  MessageTitle: z.string().optional(),
  MessageBody: z.string().optional(),

  // Events
  ReceivedDateTime: z.string().optional(),
  ValidatedDateTime: z.string().optional(),
  ProcessedDateTime: z.string().optional(),
  DispatchedAt: z.string().optional(),
  SentDateTime: z.string().optional(),

  // Events
  Events: z.array(IAnalyticsSchema),
});

export type IMessageRecord = z.infer<typeof IMessageRecordSchema>;
