import { NotificationStateEnum } from '@common/models';
import { IMessageRecord, IProcessedMessageRecord } from '@common/repositories';
import DateInSeconds from '@common/utils/dateInSeconds';
import { IAnalytics, IProcessedMessage } from '@project/lambdas';

export const mockIMessageRecord = (
  message: Omit<IProcessedMessage, 'UserID'>,
  metadata?: {
    APIGWExtendedID?: boolean;
    ReceivedDateTime?: boolean;
    ValidatedDateTime?: boolean;
    ProcessedDateTime?: boolean;
    DispatchedDateTime?: boolean;
    ExpirationDateTime?: boolean;
    Events?: IAnalytics[];
  }
): IMessageRecord => ({
  NotificationID: message.NotificationID,
  CampaignID: message.CampaignID,
  OrganisationID: message.OrganisationID,
  GroupNotificationID: message.GroupNotificationID,
  ExternalUserID: message?.ExternalUserID,
  NotificationTitle: message.NotificationTitle,
  NotificationBody: message.NotificationBody,
  MessageTitle: message.MessageTitle,
  MessageBody: message.MessageBody,
  Channel: message.Channel,
  DeeplinkURL: message.DeeplinkURL,
  Events: metadata?.Events ?? [],
  APIGWExtendedID: metadata?.APIGWExtendedID ? 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef' : undefined,
  ReceivedDateTime: metadata?.ReceivedDateTime ? '2026-01-01T12:00:00.000Z' : undefined,
  ValidatedDateTime: metadata?.ReceivedDateTime ? '2026-01-01T12:00:01.000Z' : undefined,
  ProcessedDateTime: metadata?.ReceivedDateTime ? '2026-01-01T12:00:02.000Z' : undefined,
  DispatchedDateTime: metadata?.DispatchedDateTime ? '2026-01-01T12:00:03.000Z' : undefined,
  ExpirationDateTime: metadata?.ExpirationDateTime ? DateInSeconds.toUnix('2100-01-31T12:00:00.000Z') : undefined,
});

export const mockIProcessedMessageRecord = (
  message: IProcessedMessage,
  metadata?: {
    DispatchedDateTime?: boolean;
    Events?: IAnalytics[];
  }
): IProcessedMessageRecord => ({
  NotificationID: message.NotificationID,
  CampaignID: message.CampaignID,
  OrganisationID: message.OrganisationID,
  ExternalUserID: message.ExternalUserID,
  NotificationTitle: message.NotificationTitle,
  NotificationBody: message.NotificationBody,
  MessageTitle: message.MessageTitle,
  MessageBody: message.MessageBody,
  Events: metadata?.Events ?? [],
  APIGWExtendedID: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
  ReceivedDateTime: '2026-01-01T12:00:00.000Z',
  ValidatedDateTime: '2026-01-01T12:00:01.000Z',
  ProcessedDateTime: '2026-01-01T12:00:02.000Z',
  DispatchedDateTime: metadata?.DispatchedDateTime ? '2026-01-01T12:00:03.000Z' : undefined,
  ExpirationDateTime: DateInSeconds.toUnix('2100-01-31T12:00:00.000Z'),
});

export const mockIMessageRecord_E2E = (notificationID: string, pushID: string): IMessageRecord => ({
  NotificationID: notificationID,
  MessageBody: 'Open Notification Centre to read your notifications',
  MessageTitle: 'You have a new Message',
  NotificationBody: 'Here is the Notification body.',
  NotificationTitle: 'You have a new Notification',
  DepartmentID: 'TEST01',
  UserID: 'UserID',
  ExternalUserID: pushID,
  CampaignID: 'CAM_ID',
  OrganisationID: 'UNS',
  APIGWExtendedID: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
  ReceivedDateTime: '2026-01-01T12:00:00.000Z',
  ValidatedDateTime: '2026-01-01T12:00:01.000Z',
  ProcessedDateTime: '2026-01-01T12:00:02.000Z',
  DispatchedDateTime: '2026-01-01T12:00:03.000Z',
  ExpirationDateTime: DateInSeconds.toUnix('2100-01-31T12:00:00.000Z'),
  Events: [
    {
      EventID: '1ebd114e-789e-49ba-aae8-60a699411e43',
      NotificationID: notificationID,
      OrganisationID: 'UNS',
      EventDateTime: '2026-01-01T12:00:01.000Z',
      Event: NotificationStateEnum.VALIDATED_API_CALL,
      CampaignID: 'CAM_ID',
    },
    {
      EventID: 'cb8a4811-85ee-4601-9464-4ab3c2a66f23',
      NotificationID: notificationID,
      OrganisationID: 'UNS',
      EventDateTime: '2026-01-01T12:00:02.000Z',
      Event: NotificationStateEnum.PROCESSING,
      CampaignID: 'CAM_ID',
    },
    {
      EventID: '02d1e59b-70f8-40bb-af67-554ce8c5b8ce',
      NotificationID: notificationID,
      OrganisationID: 'UNS',
      EventDateTime: '2026-01-01T12:00:03.000Z',
      Event: NotificationStateEnum.PROCESSED,
      CampaignID: 'CAM_ID',
    },
    {
      Event: NotificationStateEnum.DISPATCHING,
      CampaignID: 'CAM_ID',
      NotificationID: notificationID,
      OrganisationID: 'UNS',
      EventID: 'e747d88e-2ba2-4e78-a50c-e330358a3a47',
      EventDateTime: '2026-01-01T12:00:04.000Z',
    },
    {
      OrganisationID: 'UNS',
      EventID: 'cbebf1c2-4f8f-4077-8bfc-7b2815dc4009',
      NotificationID: notificationID,
      CampaignID: 'CAM_ID',
      EventDateTime: '2026-01-01T12:00:05.000Z',
      Event: NotificationStateEnum.DISPATCHED,
    },
  ],
});
