import { NotificationAdapterRequest } from '@common/services/interfaces/notificationAdapterRequest';
import { NotificationAdapterResult } from '@common/services/interfaces/notificationAdapterResponse';

export interface NotificationAdapter {
  initialize(): Promise<void>;
  send(payload: NotificationAdapterRequest): Promise<NotificationAdapterResult>;
}
