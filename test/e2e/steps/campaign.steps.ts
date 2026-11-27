import { mockCampaignRecord } from '@common/repositories';
import { NotificationProcessingStateEnum } from '@common/models';
import { IGroupMessageSendResponseSchema } from '@common/models/interfaces';
import { Given, When } from '@cucumber/cucumber';
import {
  waitForCampaignStatus,
  createCampaign,
  deleteCampaign,
  generateTestCampaignID,
  TEST_ORG_ID,
  waitForCampaignInDynamo,
} from '@test/e2e/helpers/campaign';
import { deleteNotificationsByCampaign } from '@test/e2e/helpers/notification';
import CustomWorld from '@test/e2e/support/world';

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
// When: GET /status/campaign/:id (group processing)
// ──────────────────────────────────────────────────

When('I attempt to get the campaign status for processed group notifications', function (this: CustomWorld) {
  if (!this.campaignID) throw new Error('Campaign ID should be set before checking campaign status');

  const [groupResult] = IGroupMessageSendResponseSchema.parse(this.result?.body);
  if (!groupResult) throw new Error('Group-send response did not contain a result');
  if (groupResult.UsersInGroup === 0) throw new Error('Cannot verify campaign status for an empty group');

  this.path = `/status/campaign/${this.campaignID}`;
  const expectedCount = groupResult.UsersInGroup;
  this.assertions.push(() =>
    waitForCampaignStatus(this, {
      PROCESSED: expectedCount,
      DISPATCHED: expectedCount,
    })
  );

  const campaign = mockCampaignRecord(TEST_ORG_ID, this.campaignID);
  this.cleanups.push(async () => {
    await waitForCampaignInDynamo(campaign.CompositeID, expectedCount, [
      NotificationProcessingStateEnum.PROCESSED,
      NotificationProcessingStateEnum.DISPATCHING,
      NotificationProcessingStateEnum.DISPATCHED,
    ]);
    await deleteCampaign(campaign.CompositeID);
  });
  this.cleanups.push(() => deleteNotificationsByCampaign(this.groupPushIDs, this.campaignID));
});
