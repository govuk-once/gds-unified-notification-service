import { ChannelsEnum } from '@common/models';
import { NotificationAdapterRequest } from '@common/services/interfaces/notificationAdapterRequest';
import { NotificationAdapterResult } from '@common/services/interfaces/notificationAdapterResponse';

export interface NotificationAdapter {
  supportedChannels: ChannelsEnum;
  initialize(): Promise<void>;
  send(payload: NotificationAdapterRequest): Promise<NotificationAdapterResult>;
}
