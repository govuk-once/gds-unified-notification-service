import { Logger } from '@aws-lambda-powertools/logger';
import { IMessageRecord } from '@project/lambdas/interfaces/IMessageRecord';

export const toIMessageRecord = (
  {
    recordFields,
    receivedDateTime,
    validatedDateTime,
    processedDateTime,
  }: {
    recordFields: Partial<IMessageRecord>;
    receivedDateTime?: string;
    validatedDateTime?: string;
    processedDateTime?: string;
  },
  logger: Logger
): IMessageRecord | undefined => {
  if (recordFields?.NotificationID) {
    const record: IMessageRecord = {
      NotificationID: recordFields.NotificationID,
      UserID: recordFields.UserID,
      MessageTitle: recordFields.MessageTitle,
      MessageBody: recordFields.MessageBody,
      NotificationTitle: recordFields.NotificationTitle,
      NotificationBody: recordFields.NotificationBody,
      DepartmentID: recordFields.DepartmentID,
      ExternalUserID: recordFields.ExternalUserID,
      ReceivedDateTime: receivedDateTime,
      ValidatedDateTime: validatedDateTime,
      ProcessedDateTime: processedDateTime,
      // TODO: On adding 'rejection reason' field here
    };

    return record;
  } else {
    logger.error('Failed to build MessageRecord, no NotificationID was provided.');
  }
};
