/* eslint-disable vitest/no-standalone-expect */
import { DataTable, defineParameterType, When } from '@cucumber/cucumber';
import { CampaignsDynamoRepository } from '@common/repositories';
import { NotificationProcessingStateEnum } from '@common/models';
import {
  deleteCampaign,
  generateTestCampaignID,
  TEST_ORG_ID,
  waitForCampaignInDynamo,
} from '@test/e2e/helpers/campaign';
import { getPushIDsForGroup } from '@test/e2e/helpers/groups';
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
  // -> These are only for /v1/send-to-group
  'with no Namespace': (id?: string) => [mocks.mockIMessage_NoOrgID(id)],
  'with no Group': (id?: string) => [mocks.mockIMessage_NoOrgID(id)],
  'with the same GroupNotificationID': mocks.mockIMessage_DuplicateGroupNotificationIDs,
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
  this.campaignID = generateTestCampaignID() + variant;
  const payload = messageVariants[variant](this.notificationID) as Record<string, unknown>[];

  for (const message of payload ?? []) {
    message.CampaignID = this.campaignID;
  }

  await this.sendRequest('POST', payload);
  if (payload && this.result?.status === 202) {
    const campaignID = this.campaignID;
    const departmentID = payload[0].DepartmentID as string;
    const compositeID = CampaignsDynamoRepository.buildCompositeID(TEST_ORG_ID, departmentID, campaignID);
    this.cleanups.push(async () => {
      await waitForCampaignInDynamo(compositeID, 1, [
        NotificationProcessingStateEnum.VALIDATED_API_CALL,
        NotificationProcessingStateEnum.PROCESSING,
        NotificationProcessingStateEnum.PROCESSED,
        NotificationProcessingStateEnum.DISPATCHING,
        NotificationProcessingStateEnum.DISPATCHED,
      ]);
      await deleteNotification(this);
      await deleteCampaign(compositeID);
    });
    this.assertions.push((body) => {
      for (const msg of payload) {
        expect(body).toContainEqual(expect.objectContaining({ NotificationID: msg.NotificationID }));
      }
    });
  }
});

// ──────────────────────────────────────────────────
// When: POST /v1/send-to-group
// ──────────────────────────────────────────────────

When(
  'I attempt to send a notification {MessageVariant} to the following group:',
  async function (this: CustomWorld, variant: string, table: DataTable) {
    this.expectedStatusCode = 202;
    this.path = '/v1/send-to-group';
    this.campaignID = generateTestCampaignID();

    const { Namespace: rawNamespace, Group, Subgroup } = table.hashes()[0];
    const Namespace = this.pushID && rawNamespace ? `${rawNamespace}-${this.pushID.slice(-8)}` : rawNamespace;
    const rawResult = messageVariants[variant]();

    if (rawResult === undefined) {
      await this.sendRequest('POST', {});
      return;
    }

    const messages = (Array.isArray(rawResult) ? rawResult : [rawResult]) as Record<string, unknown>[];

    // Convert each message into a group payload, omitting Namespace or Group for the matching validation variants
    const payload = messages.map((msg) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { NotificationID, DepartmentID, UserID, ...messageBody } = msg;
      return {
        ...messageBody,
        CampaignID: this.campaignID,
        ...(variant !== 'with no Namespace' && { Namespace }),
        ...(variant !== 'with no Group' && { Group }),
        Subgroup,
      };
    });

    await this.sendRequest('POST', payload);
    this.groupPushIDs = await getPushIDsForGroup(Namespace, Group, Subgroup);

    this.assertions.push((body) => {
      expect(body).toHaveLength(payload.length);
    });
  }
);
