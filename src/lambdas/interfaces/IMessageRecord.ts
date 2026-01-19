export interface IMessageRecord {
  NotificationID: string;
  UserID: string;
  MessageTitle: string | undefined;
  MessageBody: string | undefined;
  MessageTitleFull: string | undefined;
  MessageBodyFull: string | undefined;
  DepartmentID: string | undefined;
  ReceivedDateTime: string | undefined;
  ValidatedDateTime: string | undefined;
  ProcessedDateTime: string | undefined;
  DispatchedStartDateTime: string | undefined;
  SentDateTime: string | undefined;
  OneSignalResponseID: string | undefined;
  OneSignalID: string | undefined;
  APIGWExtendedID: string | undefined;
  TraceID: string | undefined;
}
