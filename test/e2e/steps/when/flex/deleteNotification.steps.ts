import { When } from '@cucumber/cucumber';
import type CustomWorld from '@test/e2e/utils/world';

When(
  'I attempt to delete an {word} notification with a {string} push ID',
  async function (this: CustomWorld, notificationState: string, pushIdState: string) {
    const notificationID = this.resolveNotificationID(notificationState);
    const pushID = this.resolvePushID(pushIdState);

    this.path = `/notifications/${notificationID}?pushID=${pushID}`;
    await this.sendRequest('DELETE');
  }
);
