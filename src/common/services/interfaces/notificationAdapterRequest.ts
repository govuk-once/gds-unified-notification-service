import { ChannelsEnum } from '@common/models';

export interface NotificationAdapterRequest {
  NotificationID: string;
  ExternalUserID: string;
  NotificationTitle: string;
  NotificationBody: string;
  Channel?: ChannelsEnum;
  DeeplinkURL?: string;
}
