import { NotificationStateEnum } from '@common/models';
import { IFlexNotification } from '@project/lambdas';

export const mockIFlexNotification = (): IFlexNotification => ({
  DispatchedDateTime: '2026-01-01T12:00:03.000Z',
  MessageBody: 'Open Notification Centre to read your notifications',
  MessageTitle: 'You have a new Message',
  NotificationBody: 'Here is the Notification body.',
  NotificationID: 'efe72235-d02a-45a9-b9d4-a04ff992fcc3',
  NotificationTitle: 'You have a new Notification',
  Status: NotificationStateEnum.RECEIVED,
  Metadata: {
    Sender: {
      DisplayName: 'ORG',
    },
  },
});
