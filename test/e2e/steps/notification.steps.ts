import { Given, When } from '@cucumber/cucumber';
import { createNotification, deleteNotification } from '@test/e2e/helpers/notification';
import { e2eUUID } from '@test/e2e/helpers/uuid';
import type CustomWorld from '@test/e2e/support/world';

// ──────────────────────────────────────────────────
// Given
// ──────────────────────────────────────────────────

Given('a notification exists', async function (this: CustomWorld) {
  this.pushID = e2eUUID('notif');
  this.notificationID = e2eUUID('notif');
  await createNotification(this);
  this.cleanups.push(() => deleteNotification(this));
});

Given('the notification does not exist', function (this: CustomWorld) {
  this.notificationID = e2eUUID('noexs');
});

// ──────────────────────────────────────────────────
// When
// ──────────────────────────────────────────────────

When('I attempt to delete a notification', async function (this: CustomWorld) {
  this.path = `/notifications/${this.notificationID}?pushID=${this.pushID}`;
  await this.sendRequest('DELETE');
});

When('I attempt to get the status of a notification', async function (this: CustomWorld) {
  this.expectedStatusCode = 200;
  this.path = `/status/${this.notificationID}`;
  await this.sendRequest('GET');
});
