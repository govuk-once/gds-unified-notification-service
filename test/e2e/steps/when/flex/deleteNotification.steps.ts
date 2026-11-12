import { When } from '@cucumber/cucumber';
import type CustomWorld from '@test/e2e/utils/world';

When('I attempt to delete a notification', async function (this: CustomWorld) {
  const notificationID = this.resolveNotificationID();
  const pushID = this.resolvePushID();

  this.path = `/notifications/${notificationID}?pushID=${pushID}`;
  await this.sendRequest('DELETE');
});
