import { When } from '@cucumber/cucumber';
import type CustomWorld from '@test/e2e/utils/world';

When('I attempt to get the status of a notification', async function (this: CustomWorld) {
  const notificationID = this.resolveNotificationID();

  this.expectedStatusCode = 200;
  this.path = `/status/${notificationID}`;
  await this.sendRequest('GET');
});
