import { mockCampaignRecord } from '@common/repositories';
import { Given, When } from '@cucumber/cucumber';
import { createCampaign, deleteCampaign } from '@test/e2e/helpers/campaign';
import CustomWorld from '@test/e2e/support/world';

export const TEST_ORG_ID = 'UNS';

Given('a campaign exists', async function (this: CustomWorld) {
  this.campaignID = `E2E-CampaignTest-${new Date().toISOString()}`;
  const campaign = mockCampaignRecord(TEST_ORG_ID, this.campaignID);
  await createCampaign(campaign);
  this.cleanups.push(() => deleteCampaign(campaign.CompositeID));
});

Given('the campaign does not exist', function (this: CustomWorld) {
  this.campaignID = 'some-id-that-does-not-exist';
});

When('I attempt to get the campaign status', async function (this: CustomWorld) {
  this.expectedStatusCode = 200;
  this.path = `/status/campaign/${this.campaignID}`;

  await this.sendRequest('GET');
  // throw new Error(JSON.stringify(this.result, null, 2));
});
