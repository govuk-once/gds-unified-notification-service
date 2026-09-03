import { NotificationAdapterRequest } from '@common/services';

export const mockNotificationAdapterRequest = (): NotificationAdapterRequest => ({
  NotificationID: 'test01',
  ExternalUserID: 'sample_external_user_id',
  NotificationTitle: 'UNS Test 01 - Title',
  NotificationBody: 'UNS Test 01 - Body',
});
