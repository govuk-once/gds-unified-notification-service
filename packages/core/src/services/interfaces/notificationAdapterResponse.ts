import { NotificationStateEnum } from '@common/models';
import { NotificationAdapterRequest } from '@common/services/interfaces/notificationAdapterRequest';

export interface NotificationAdapterResult {
  notification: NotificationAdapterRequest;
  requestId?: string;
  additionalStatuses?: NotificationStateEnum[];
}
