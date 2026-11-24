import { iocGetNotificationDynamoRepository } from '@common/ioc';
import { IMessageRecord } from '@common/repositories';
import CustomWorld from '@test/e2e/support/world';

export const createNotification = async (world: CustomWorld, notification: IMessageRecord) => {
  const notificationsRepository = await iocGetNotificationDynamoRepository();
  await notificationsRepository.createRecord(notification);
};

export const deleteNotification = async (world: CustomWorld) => {
  const notificationsRepository = await iocGetNotificationDynamoRepository();
  await notificationsRepository.deleteRecord(world.notificationID);
};

export const deleteNotificationByID = async (notificationID: string) => {
  const notificationsRepository = await iocGetNotificationDynamoRepository();
  await notificationsRepository.deleteRecord(notificationID);
};

export const getNotificationsByExternalPushID = async (pushID: string) => {
  const notificationsRepository = await iocGetNotificationDynamoRepository();
  return notificationsRepository.getProcessedMessages(pushID);
};

export const deleteNotificationsByCampaign = async (pushIDs: string[], campaignID: string) => {
  for (const pushID of pushIDs) {
    const notifications = await getNotificationsByExternalPushID(pushID);
    for (const notification of notifications) {
      if (notification.CampaignID === campaignID) {
        await deleteNotificationByID(notification.NotificationID);
      }
    }
  }
};
