export interface IMessage {
  NotificationID: string;
  DepartmentID?: string;
  UserID: string;
  MessageTitle?: string;
  MessageBody?: string;
  MessageTitleFull?: string;
  MessageBodyFull?: string;
}

export interface IIncomingMessage extends IMessage {
  ReceivedDateTime: string;
}

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
