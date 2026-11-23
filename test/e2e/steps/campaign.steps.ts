/* eslint-disable vitest/no-standalone-expect */
import { mockCampaignRecord } from '@common/repositories';
import { Given, Then, When } from '@cucumber/cucumber';
import {
  checkCampaignStatus,
  createCampaign,
  deleteCampaign,
  generateTestCampaignID,
  TEST_ORG_ID,
} from '@test/e2e/helpers/campaign';
import { deleteNotificationByID, getNotificationsByExternalPushID } from '@test/e2e/helpers/notification';
import { waitForExpect } from '@test/e2e/helpers/waitForExpect';
import CustomWorld from '@test/e2e/support/world';
import { expect } from 'vitest';
import { z } from 'zod';

// ──────────────────────────────────────────────────
// Given
// ──────────────────────────────────────────────────

Given('a campaign exists', async function (this: CustomWorld) {
  this.campaignID = generateTestCampaignID();
  const campaign = mockCampaignRecord(TEST_ORG_ID, this.campaignID);
  await createCampaign(campaign);
  this.cleanups.push(() => deleteCampaign(campaign.CompositeID));
});

Given('the campaign does not exist', function (this: CustomWorld) {
  this.campaignID = 'some-id-that-does-not-exist';
});

// ──────────────────────────────────────────────────
// When: GET /status/campaign/:id
// ──────────────────────────────────────────────────

When('I attempt to get the campaign status', async function (this: CustomWorld) {
  this.expectedStatusCode = 200;
  this.path = `/status/campaign/${this.campaignID}`;

  await this.sendRequest('GET');
});

// ──────────────────────────────────────────────────
// Then: campaign processing assertions
// ──────────────────────────────────────────────────

Then('all group notifications should be processed', async function (this: CustomWorld) {
  if (!this.campaignID) throw new Error('Campaign ID should be set before checking campaign status');

  const groupSendResponseSchema = z.array(
    z.object({
      GroupNotificationID: z.string(),
      UsersInGroup: z.number().int().nonnegative(),
    })
  );
  const [groupResult] = groupSendResponseSchema.parse(this.result?.body);
  if (!groupResult) throw new Error('Group-send response did not contain a result');
  if (groupResult.UsersInGroup === 0) throw new Error('Cannot verify campaign status for an empty group');

  this.path = `/status/campaign/${this.campaignID}`;
  await waitForExpect(
    this,
    async () => {
      const campaignStatus = await checkCampaignStatus(this.psoAPI, this.campaignID);
      expect(campaignStatus.PROCESSED).toBe(groupResult.UsersInGroup);
    },
    25000,
    2000
  );

  const campaign = mockCampaignRecord(TEST_ORG_ID, this.campaignID);
  this.cleanups.push(() => deleteCampaign(campaign.CompositeID));
  this.cleanups.push(async () => {
    for (const pushID of this.groupPushIDs) {
      const notifications = await getNotificationsByExternalPushID(pushID);
      for (const notification of notifications) {
        if (notification.CampaignID === this.campaignID) {
          await deleteNotificationByID(notification.NotificationID);
        }
      }
    }
  });
});
