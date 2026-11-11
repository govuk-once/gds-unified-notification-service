import { When } from '@cucumber/cucumber';
import type CustomWorld from '@test/e2e/utils/world';

When(
  'I attempt to get the status of an {word} notification',
  async function (this: CustomWorld, notificationState: string) {
    const notificationID = this.resolveNotificationID(notificationState);

    this.path = `/status/${notificationID}`;
    await this.sendRequest('GET');
  }
);
