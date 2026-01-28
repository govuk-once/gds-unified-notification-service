export interface IMessageRecord {
  // IDs
  NotificationID: string;
  DepartmentID: string;
  UserID: string;

  // External ids
  TraceID?: string;
  ExternalResponseID?: string;
  OneSignalID?: string;
  APIGWExtendedID?: string;
  ExternalUserID?: string;

  // Contents
  NotificationTitle: string;
  NotificationBody: string;
  MessageTitle?: string;
  MessageBody?: string;

  // Events
  ReceivedDateTime?: string;
  ValidatedDateTime?: string;
  ProcessedDateTime?: string;
  DispatchedStartDateTime?: string;
  SentDateTime?: string;
}
