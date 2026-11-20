import { NotificationStateEnum } from '@common/models';
import { FetchService } from '@common/services/FetchService';
import { INotificationStatus } from '@common/models/interfaces';

export const waitUntil = async <T>(fn: () => Promise<T>, { timeout = 30000, interval = 2000 }) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      await fn();
      return;
    } catch {
      if (Date.now() + interval > deadline) throw new Error(`Timed out after ${timeout}ms`);
      await new Promise((r) => setTimeout(r, interval));
    }
  }
};

export const checkStatus = async (psoAPI: FetchService, notificationID: string) => {
  const result = await psoAPI.get({ path: `/status/${notificationID}` });
  const statuses = result.body as INotificationStatus[];
  const match = [
    NotificationStateEnum.VALIDATED_API_CALL,
    NotificationStateEnum.PROCESSING,
    // TODO: Need a way to void test notification while adapter is not VOID.
    // NotificationStateEnum.PROCESSED,
    // NotificationStateEnum.DISPATCHING
  ].every((expected) => statuses.map((s) => s.Status).includes(expected));

  if (!match) {
    throw new Error(`Missing status for ${notificationID}, got: ${statuses.map((s) => s.Status).join(', ')}`);
  }
  return statuses;
};
