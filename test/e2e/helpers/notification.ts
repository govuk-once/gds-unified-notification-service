import { iocGetNotificationDynamoRepository } from '@common/ioc';
import { mockIMessageRecord_E2E } from '@test/mocks';
import CustomWorld from '@test/e2e/support/world';

export const createNotification = async (world: CustomWorld) => {
  const notificationsRepository = await iocGetNotificationDynamoRepository();
  const messageRecord = mockIMessageRecord_E2E(world.notificationID, world.pushID);
  await notificationsRepository.createRecord(messageRecord);
};

export const deleteNotification = async (world: CustomWorld) => {
  const notificationsRepository = await iocGetNotificationDynamoRepository();
  await notificationsRepository.deleteRecord(world.notificationID);
};

export const getNotification = async (world: CustomWorld) => {
  const notificationsRepository = await iocGetNotificationDynamoRepository();
  return notificationsRepository.getRecord(world.notificationID);
};
