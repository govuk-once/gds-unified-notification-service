import { IMessageRecord } from '@project/lambdas/interfaces/IMessageRecord';

export const toIMessageRecord = ({
  recordFields,
  receivedDateTime,
  validatedDateTime,
  processedDateTime,
}: {
  recordFields: Partial<IMessageRecord>;
  receivedDateTime?: string;
  validatedDateTime?: string;
  processedDateTime?: string;
}): IMessageRecord => {
  if (recordFields?.NotificationID) {
    const record: IMessageRecord = {
      NotificationID: recordFields.NotificationID,
      UserID: recordFields.UserID,
      MessageTitle: recordFields.MessageTitle,
      MessageBody: recordFields.MessageBody,
      NotificationTitle: recordFields.NotificationTitle,
      NotificationBody: recordFields.NotificationBody,
      DepartmentID: recordFields.DepartmentID,
      OneSignalID: recordFields.OneSignalID,
      ReceivedDateTime: receivedDateTime,
      ValidatedDateTime: validatedDateTime,
      ProcessedDateTime: processedDateTime,
      // TODO: On adding 'rejection reason' field here
    };

    return record;
  } else {
    throw new Error('Failed to build MessageRecord, no NotificationID was provided.');
  }
};
