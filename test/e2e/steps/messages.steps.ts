/* eslint-disable vitest/no-standalone-expect */
import { defineParameterType, When } from '@cucumber/cucumber';
import { deleteNotification } from '@test/e2e/helpers/notification';
import { e2eUUID } from '@test/e2e/helpers/uuid';
import type CustomWorld from '@test/e2e/support/world';
import * as mocks from '@test/mocks';
import { expect } from 'vitest';

// ──────────────────────────────────────────────────
// Message payloads
// ──────────────────────────────────────────────────

const messageVariants: Record<string, (notificationID?: string) => unknown> = {
  // Sad path — validation failures
  'with no UserID': mocks.mockIMessage_NoUserID,
  'with no NotificationTitle': mocks.mockIMessage_NoNotificationTitle,
  'with no NotificationBody': mocks.mockIMessage_NoNotificationBody,
  'with no request body': () => undefined,
  'with an invalid URL in markdown': mocks.mockIMessage_InvalidMarkdownURL,
  'with invalid markdown': mocks.mockIMessage_InvalidMarkdown,
  'with a negative ExpiresInDays': mocks.mockIMessage_NegativeExpiresInDays,
  'with a float ExpiresInDays': mocks.mockIMessage_FloatExpiresInDays,
  'with an ExpiresInDays below the organisation minimum': mocks.mockIMessage_ExpiresInDaysBelowMin,
  'with an ExpiresInDays above the organisation maximum': mocks.mockIMessage_ExpiresInDaysAboveMax,
  'with duplicate NotificationIDs': mocks.mockIMessage_DuplicateNotificationIDs,
  'with a DeeplinkURL with a disallowed hostname': mocks.mockIMessage_DisallowedDeeplinkHostname,
  'with a DeeplinkURL with a disallowed protocol': mocks.mockIMessage_DisallowedDeeplinkProtocol,
  // Happy path — valid variations
  'with valid fields': (id?: string) => [mocks.mockIMessage_NoOrgID(id)],
  'with valid markdown': (id?: string) => mocks.mockIMessage_ValidMarkdown(id),
  'without a DepartmentID': (id?: string) => mocks.mockIMessage_NoDepartmentID(id),
  'with a valid ExpiresInDays': (id?: string) => mocks.mockIMessage_ValidExpiresInDays(id),
  'with ExpiresInDays at the organisation minimum': (id?: string) => mocks.mockIMessage_ExpiresInDaysAtMin(id),
  'with ExpiresInDays at the organisation maximum': (id?: string) => mocks.mockIMessage_ExpiresInDaysAtMax(id),
  'with channel PUSH_NOTIFICATION_AND_MESSAGE_CENTRE': (id?: string) =>
    mocks.mockIMessage_ChannelPushAndMessageCentre(id),
  'with channel MESSAGE_CENTRE_ONLY': (id?: string) => mocks.mockIMessage_ChannelMessageCentreOnly(id),
};

// ──────────────────────────────────────────────────
// Parameter types
// ──────────────────────────────────────────────────

defineParameterType({
  name: 'MessageVariant',
  regexp: new RegExp(Object.keys(messageVariants).join('|')),
  transformer: (s) => s,
});

// ──────────────────────────────────────────────────
// When: POST /send
// ──────────────────────────────────────────────────

When('I attempt to send a notification {MessageVariant}', async function (this: CustomWorld, variant: string) {
  this.expectedStatusCode = 202;
  this.path = '/send';
  this.notificationID = e2eUUID('a0b1c');
  const payload = messageVariants[variant](this.notificationID) as Record<string, unknown>[];

  await this.sendRequest('POST', payload);
  if (payload) {
    this.cleanups.push(() => deleteNotification(this));
    this.assertions.push((body) => {
      for (const msg of payload) {
        expect(body).toContainEqual(expect.objectContaining({ NotificationID: msg.NotificationID }));
      }
    });
  }
});
