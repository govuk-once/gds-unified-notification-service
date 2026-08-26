import { IMessage, IMessageFields, IProcessedMessage } from '@project/lambdas';

export const mockIMessage = (OrganisationID?: string): IMessage => ({
  NotificationID: 'efe72235-d02a-45a9-b9d4-a04ff992fcc3',
  MessageBody: 'Open Notification Centre to read your notifications',
  MessageTitle: 'You have a new Message',
  NotificationBody: 'Here is the Notification body.',
  NotificationTitle: 'You have a new Notification',
  DepartmentID: 'TEST01',
  UserID: 'UserID',
  CampaignID: 'CAM_ID',
  OrganisationID: OrganisationID ?? 'ORG01',
});

export const mockIMessage_NoOrgID = (): Omit<IMessage, 'OrganisationID'> => ({
  NotificationID: 'efe72235-d02a-45a9-b9d4-a04ff992fcc4',
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
    NotificationID: 'efe72235-d02a-45a9-b9d4-a04ff992fcc5',
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

export const mockIProcessedMessage = (OrganisationID?: string): IProcessedMessage => {
  const message = mockIMessage(OrganisationID);
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

export const mockIMessageFields = (): IMessageFields => ({
  MessageTitle: 'You have a new Message',
  MessageBody: 'Open Notification Centre to read your notifications',
  NotificationTitle: 'You have a new Notification',
  NotificationBody: 'Here is the Notification body.',
});
