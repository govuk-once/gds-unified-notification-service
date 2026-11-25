import { iocGetCampaignsDynamoRepository } from '@common/ioc';
import { campaignStatusSchema } from '@common/models/interfaces';
import { FetchErrorResponse, type FetchService } from '@common/services/FetchService';
import { ICampaignRecord } from '@common/repositories';
import { e2eUUID } from '@test/e2e/helpers/uuid';

export const TEST_ORG_ID = 'UNS';

// Use to generate unique campaignIDs to avoid collision between different scenarios
export const generateTestCampaignID = () => `E2E-CampaignTest-${new Date().toISOString()}-${e2eUUID('camp')}`;

export const createCampaign = async (campaignRecord: ICampaignRecord) => {
  const campaignRepository = await iocGetCampaignsDynamoRepository();
  await campaignRepository.createRecord(campaignRecord);
};

export const deleteCampaign = async (compositeID: string) => {
  const campaignRepository = await iocGetCampaignsDynamoRepository();
  await campaignRepository.deleteRecord(compositeID);
};

export const checkCampaignStatus = async (
  psoAPI: FetchService,
  campaignID: string
): Promise<{ PROCESSED: number; DISPATCHED: number }> => {
  try {
    const result = await psoAPI.get({ path: `/status/campaign/${campaignID}` });
    const campaignStatus = campaignStatusSchema.parse(result.body);
    if (campaignStatus.CampaignID !== campaignID) {
      throw new Error(`Campaign status returned ${campaignStatus.CampaignID} instead of ${campaignID}`);
    }

    const { PROCESSED, DISPATCHED } = campaignStatus.ProcessingSummary;
    return { PROCESSED, DISPATCHED };
  } catch (error) {
    if (error instanceof FetchErrorResponse && error.status === 404) {
      throw new Error(
        `Campaign ${campaignID} not found yet (404) - retrying - campaign status = ${JSON.stringify(campaignStatusSchema, null, 2)}`
      );
    }
    throw error;
  }
};
