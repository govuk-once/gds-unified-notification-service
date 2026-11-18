import { Given, When } from '@cucumber/cucumber';
import { iocGetNotificationDynamoRepository } from '@common/ioc';
import { createNotification, deleteNotification } from '@test/e2e/helpers/notification';
import { e2eUUID } from '@test/e2e/helpers/uuid';
import { mockIMessageRecord_E2E, mockIMessageRecord_E2E_WithDispatchTime } from '@test/mocks';
import type CustomWorld from '@test/e2e/support/world';
import { expect } from 'vitest';

// ──────────────────────────────────────────────────
// Given
// ──────────────────────────────────────────────────

Given('a notification exists', async function (this: CustomWorld) {
  this.pushID = e2eUUID('notif');
  this.notificationID = this.pushID;

  const notification = mockIMessageRecord_E2E(this.notificationID, this.pushID);
  await createNotification(this, notification);
  this.cleanups.push(() => deleteNotification(this));
});

Given('multiple notifications exist', async function (this: CustomWorld) {
  this.pushID = e2eUUID('multi');

  const ids = [e2eUUID('new'), e2eUUID('mid'), e2eUUID('old')];
  const timestamps = ['2026-01-01T12:00:00.000Z', '2026-01-01T11:00:00.000Z', '2026-01-01T10:00:00.000Z'];
  const repo = await iocGetNotificationDynamoRepository();

  for (let i = 0; i < ids.length; i++) {
    await createNotification(this, mockIMessageRecord_E2E_WithDispatchTime(ids[i], this.pushID, timestamps[i]));
  }

  this.notificationIDs = ids;
  this.cleanups.push(async () => {
    for (const id of ids) {
      await repo.deleteRecord(id);
    }
  });
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

When('I attempt to get the notification', async function (this: CustomWorld) {
  this.expectedStatusCode = 200;
  this.expectedFields = {
    NotificationID: this.notificationID,
  };
  this.path = `/notifications/${this.notificationID}/?externalUserID=${this.pushID}`;
  await this.sendRequest('GET');
});

When('I attempt to get notifications', async function (this: CustomWorld) {
  this.expectedStatusCode = 200;
  this.expectedFields = this.notificationIDs.map((NotificationID) => ({ NotificationID }));
  this.path = `/notifications?externalUserID=${this.pushID}`;
  await this.sendRequest('GET');
});
