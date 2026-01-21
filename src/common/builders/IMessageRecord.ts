import { IMessage } from '@project/lambdas/interfaces/IMessage';
import { IMessageRecord } from '@project/lambdas/interfaces/IMessageRecord';

export const toIMessageRecord = (
  message: Partial<IMessage>,
  receivedDateTime: string,
  validatedDateTime?: string
): IMessageRecord => {
  if (message?.NotificationID) {
    const record: IMessageRecord = {
      NotificationID: message.NotificationID,
      UserID: message.UserID,
      MessageTitle: message.MessageTitle,
      MessageBody: message.MessageBody,
      NotificationTitle: message.NotificationTitle,
      NotificationBody: message.NotificationBody,
      DepartmentID: message.DepartmentID,
      ReceivedDateTime: receivedDateTime,
      ValidatedDateTime: validatedDateTime,
      // TODO: On adding 'rejection reason' field here
    };

    return record;
  } else {
    throw new Error('Failed to build MessageRecord, no NotificationID was provided.');
  }
};
