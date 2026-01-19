export interface IMessageRecord {
  NotificationID: string;
  UserID: string;
  MessageTitle?: string;
  MessageBody?: string;
  MessageTitleFull?: string;
  MessageBodyFull?: string;
  DepartmentID?: string;
  ReceivedDateTime?: string;
  ValidatedDateTime?: string;
  ProcessedDateTime?: string;
  DispatchedStartDateTime?: string;
  SentDateTime?: string;
  OneSignalResponseID?: string;
  OneSignalID?: string;
  APIGWExtendedID?: string;
  TraceID?: string;
}
