import { IMessageRecord, IProcessedMessageRecord } from '@common/repositories';
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
  ExternalUserID: message?.ExternalUserID,
  NotificationTitle: message.NotificationTitle,
  NotificationBody: message.NotificationBody,
  MessageTitle: message.MessageTitle,
  MessageBody: message.MessageBody,
  Events: metadata?.Events ?? [],
  APIGWExtendedID: metadata?.APIGWExtendedID ? 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef' : undefined,
  ReceivedDateTime: metadata?.ReceivedDateTime ? '2026-01-01T12:00:00.000Z' : undefined,
  ValidatedDateTime: metadata?.ReceivedDateTime ? '2026-01-01T12:00:01.000Z' : undefined,
  ProcessedDateTime: metadata?.ReceivedDateTime ? '2026-01-01T12:00:02.000Z' : undefined,
  DispatchedDateTime: metadata?.DispatchedDateTime ? '2026-01-01T12:00:03.000Z' : undefined,
  ExpirationDateTime: metadata?.ExpirationDateTime ? '2100-01-31T12:00:00.000Z' : undefined,
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
  ExpirationDateTime: '2100-01-31T12:00:00.000Z',
});
