/* eslint-disable vitest/no-standalone-expect */
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
// When: DELETE /notifications/:id
// ──────────────────────────────────────────────────

When('I attempt to delete the notification', async function (this: CustomWorld) {
  this.expectedStatusCode = 204;
  this.path = `/notifications/${this.notificationID}?pushID=${this.pushID}`;
  await this.sendRequest('DELETE');
});

// ──────────────────────────────────────────────────
// When: GET /notifications
// ──────────────────────────────────────────────────

When('I attempt to get notifications', async function (this: CustomWorld) {
  this.expectedStatusCode = 200;
  this.assertions.push((body) => {
    if (this.notificationIDs.length === 0) {
      expect(body).toEqual([]);
    } else {
      for (const NotificationID of this.notificationIDs) {
        expect(body).toContainEqual(expect.objectContaining({ NotificationID }));
      }
    }
  });
  this.path = `/notifications?externalUserID=${this.pushID}`;
  await this.sendRequest('GET');
});

// ──────────────────────────────────────────────────
// When: GET /notifications/:id
// ──────────────────────────────────────────────────

When('I attempt to get the notification', async function (this: CustomWorld) {
  this.expectedStatusCode = 200;
  this.assertions.push((body) => {
    expect(body).toMatchObject({ NotificationID: this.notificationID });
  });
  this.path = `/notifications/${this.notificationID}/?externalUserID=${this.pushID}`;
  await this.sendRequest('GET');
});

// ──────────────────────────────────────────────────
// When: GET /status/:id
// ──────────────────────────────────────────────────

When('I attempt to get the status of a notification', async function (this: CustomWorld) {
  this.expectedStatusCode = 200;
  const expectedStatuses = ['VALIDATED_API_CALL', 'PROCESSING', 'PROCESSED', 'DISPATCHING', 'DISPATCHED'];
  this.assertions.push((body) => {
    for (const Status of expectedStatuses) {
      expect(body).toContainEqual(expect.objectContaining({ Status, NotificationID: this.notificationID }));
    }
  });
  this.path = `/status/${this.notificationID}`;
  await this.sendRequest('GET');
});

// ──────────────────��───────────────────────────────
// When: PATCH /notifications/:id/status
// ──────────────────────────────────────────────────

When('I attempt to patch the notification', async function (this: CustomWorld) {
  this.expectedStatusCode = 202;
  this.path = `/notifications/${this.notificationID}/status?pushID=${this.pushID}`;
  await this.sendRequest('PATCH', { Status: 'READ' });
});

When('I attempt to patch the notification without a body', async function (this: CustomWorld) {
  this.path = `/notifications/${this.notificationID}/status?pushID=${this.pushID}`;
  await this.sendRequest('PATCH', {});
});
