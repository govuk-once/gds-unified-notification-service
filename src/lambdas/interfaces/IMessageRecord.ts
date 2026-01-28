export interface IMessageRecord {
  NotificationID: string;
  UserID?: string;
  MessageTitle?: string;
  MessageBody?: string;
  NotificationTitle?: string;
  NotificationBody?: string;
  DepartmentID?: string;
  ReceivedDateTime?: Date;
  ValidatedDateTime?: Date;
  ProcessedDateTime?: Date;
  DispatchedStartDateTime?: Date;
  SentDateTime?: Date;
  ExternalResponseID?: string;
  ExternalUserID?: string;
  APIGWExtendedID?: string;
  TraceID?: string;
}
