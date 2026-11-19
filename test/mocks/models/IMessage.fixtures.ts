/* eslint-disable @typescript-eslint/no-unused-vars */
import { IMessage, IMessageFields, IProcessedMessage } from '@common/models/interfaces';

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

export const mockIMessage_NoOrgID = (notificationID?: string): Omit<IMessage, 'OrganisationID'> => ({
  NotificationID: notificationID ?? 'efe72235-d02a-45a9-b9d4-a04ff992fcc4',
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

export const mockIProcessedMessage_SetNotificationID = (
  notificationID: string,
  organisationID?: string
): IProcessedMessage => {
  const message = mockIMessage(organisationID);
  return {
    ...message,
    NotificationID: notificationID,
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

export const mockIMessage_NoUserID = (_notificationID?: string) => {
  const { UserID, ...rest } = mockIMessage_NoOrgID();
  return [rest];
};

export const mockIMessage_NoNotificationTitle = (_notificationID?: string) => {
  const { NotificationTitle, ...rest } = mockIMessage_NoOrgID();
  return [rest];
};

export const mockIMessage_NoNotificationBody = (_notificationID?: string) => {
  const { NotificationBody, ...rest } = mockIMessage_NoOrgID();
  return [rest];
};

export const mockIMessage_InvalidMarkdownURL = (_notificationID?: string) => [
  {
    ...mockIMessage_NoOrgID(),
    MessageBody: '# Heading\n\nThis is a [link](https://example.com) with an unapproved hostname.',
  },
];

export const mockIMessage_InvalidMarkdown = (_notificationID?: string) => [
  { ...mockIMessage_NoOrgID(), MessageBody: '    const x = 10;\n    const y = 20;' },
];

export const mockIMessage_NegativeExpiresInDays = (_notificationID?: string) => [
  { ...mockIMessage_NoOrgID(), ExpiresInDays: -1 },
];

export const mockIMessage_FloatExpiresInDays = (_notificationID?: string) => [
  { ...mockIMessage_NoOrgID(), ExpiresInDays: 0.5 },
];

export const mockIMessage_ExpiresInDaysBelowMin = (_notificationID?: string) => [
  { ...mockIMessage_NoOrgID(), ExpiresInDays: 1 },
];

export const mockIMessage_ExpiresInDaysAboveMax = (_notificationID?: string) => [
  { ...mockIMessage_NoOrgID(), ExpiresInDays: 31 },
];

export const mockIMessage_DuplicateNotificationIDs = (_notificationID?: string) => {
  const msg = mockIMessage_NoOrgID();
  return [msg, { ...msg, MessageTitle: 'Duplicate message' }];
};

export const mockIMessage_DisallowedDeeplinkHostname = (_notificationID?: string) => [
  { ...mockIMessage_NoOrgID(), DeeplinkURL: 'https://test.com' },
];

export const mockIMessage_DisallowedDeeplinkProtocol = (_notificationID?: string) => [
  { ...mockIMessage_NoOrgID(), DeeplinkURL: 'mailto://test@example.com' },
];

export const mockIMessage_ValidMarkdown = (notificationID?: string) => [
  {
    ...mockIMessage_NoOrgID(notificationID),
    MessageBody:
      'This is a **long message** containing structural details that are valid under the markdown rules. We want to ensure that *all* allowable elements function seamlessly.',
  },
];

export const mockIMessage_NoDepartmentID = (notificationID?: string) => {
  const { DepartmentID, ...rest } = mockIMessage_NoOrgID(notificationID);
  return [rest];
};

export const mockIMessage_ValidExpiresInDays = (notificationID?: string) => [
  { ...mockIMessage_NoOrgID(notificationID), ExpiresInDays: 25 },
];

export const mockIMessage_ExpiresInDaysAtMin = (notificationID?: string) => [
  { ...mockIMessage_NoOrgID(notificationID), ExpiresInDays: 2 },
];

export const mockIMessage_ExpiresInDaysAtMax = (notificationID?: string) => [
  { ...mockIMessage_NoOrgID(notificationID), ExpiresInDays: 30 },
];

export const mockIMessage_ChannelPushAndMessageCentre = (notificationID?: string) => [
  { ...mockIMessage_NoOrgID(notificationID), Channel: 'PUSH_NOTIFICATION_AND_MESSAGE_CENTRE' },
];

export const mockIMessage_ChannelMessageCentreOnly = (notificationID?: string) => [
  { ...mockIMessage_NoOrgID(notificationID), Channel: 'MESSAGE_CENTRE_ONLY' },
];

export const mockIMessageFields = (): IMessageFields => ({
  MessageTitle: 'You have a new Message',
  MessageBody: 'Open Notification Centre to read your notifications',
  NotificationTitle: 'You have a new Notification',
  NotificationBody: 'Here is the Notification body.',
});
