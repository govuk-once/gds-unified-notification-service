export interface IMessageRecord {
  NotificationID: string;
  UserID?: string;
  MessageTitle?: string;
  MessageBody?: string;
  NotificationTitle?: string;
  NotificationBody?: string;
  DepartmentID?: string;
  ReceivedDateTime?: string;
  ValidatedDateTime?: string;
  ProcessedDateTime?: string;
  DispatchedStartDateTime?: string;
  SentDateTime?: string;
  ExternalResponseID?: string;
  ExternalUserID?: string;
  APIGWExtendedID?: string;
  TraceID?: string;
}
