import { NotificationAdapterRequest } from '@common/services/interfaces/notificationAdapterRequest';

export interface NotificationAdapterResult {
  notification: NotificationAdapterRequest;
  success: boolean;
  requestId?: string;
  errors?: string[] | object;
}
