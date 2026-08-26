import { IMessage, IProcessedMessage } from '@project/lambdas';
import { v4 as uuid } from 'uuid';

export const mockIMessage = (): IMessage => ({
  NotificationID: 'efe72235-d02a-45a9-b9d4-a04ff992fcc3',
  MessageBody: 'Open Notification Centre to read your notifications',
  MessageTitle: 'You have a new Message',
  NotificationBody: 'Here is the Notification body.',
  NotificationTitle: 'You have a new Notification',
  DepartmentID: 'TEST01',
  UserID: 'UserID',
  CampaignID: 'CAM_ID',
  OrganisationID: 'ORG01',
});

export const mockIMessage_NoOrgID = (): Omit<IMessage, 'OrganisationID'> => ({
  NotificationID: uuid(),
  DepartmentID: 'TEST01',
  UserID: 'UserID',
  CampaignID: 'CAM_ID',
  NotificationTitle: 'Hi there',
  NotificationBody: 'You have a new message in the message center',
  MessageTitle: 'Hi there',
  MessageBody: 'MOCK_LONG_MESSAGE',
});

export const mockFailedIMessage = (): IMessage =>
  ({
    NotificationID: uuid(),
    UserID: 'invalid-id',
    DepartmentID: 'invalid-id',
    CampaignID: 'CAMP01',
    OrganisationID: 'ORG01',
  }) as unknown as IMessage;

export const mockUnidentifiableIMessage = (): IMessage =>
  ({
    NotificationID: 'invalid-notification-id',
    UserID: 'invalid-id',
    NotificationTitle: 'Boom',
    NotificationBody: 'psst',
  }) as unknown as IMessage;

export const mockIProcessedMessage = (): IProcessedMessage => {
  const message = mockIMessage();
  return {
    ...message,
    ExternalUserID: 'test_user',
  };
};

export const mockFailedIProcessedMessage = (): IProcessedMessage => {
  const failedMessageBody = mockFailedIMessage();
  return {
    ...failedMessageBody,
    ExternalUserID: 'test_user',
  };
};
