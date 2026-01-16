import z from 'zod';

export const IMessageSchema = z.object({
  NotificationID: z.string(),
  DepartmentID: z.string(),
  UserID: z.string(),
  MessageTitle: z.string(),
  MessageBody: z.string(),
  MessageTitleFull: z.string(),
  MessageBodyFull: z.string(),
});

export type IMessage = z.infer<typeof IMessageSchema>;

export interface IMessageRecord {
  NotificationID: string;
  UserID: string;
  OneSignalID?: string;
  APIGWExtendedID?: string;
  MessageTitle?: string;
  MessageBody?: string;
  MessageTitleFull?: string;
  MessageBodyFull?: string;
  DepartmentID?: string;
  ReceivedDateTime?: string;
  ValidatedDateTime?: string;
  ProcessedDateTime?: string;
  DispatchedStartDateTime?: string;
  OneSignalResponseID?: string;
  SentDateTime?: string;
  TraceID?: string;
}
