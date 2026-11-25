import { iocGetCampaignsDynamoRepository } from '@common/ioc';
import { campaignStatusSchema, type CampaignStatus } from '@common/models/interfaces';
import { FetchErrorResponse, type FetchService } from '@common/services/FetchService';
import { ICampaignRecord } from '@common/repositories';
import { e2eUUID } from '@test/e2e/helpers/uuid';
import { waitFor } from '@test/e2e/helpers/waitFor';

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

export const waitForCampaignInDynamo = async (compositeID: string, expectedCount: number) => {
  const campaignRepository = await iocGetCampaignsDynamoRepository();
  await waitFor(
    async () => {
      const record = await campaignRepository.getRecord(compositeID);
      if (!record) throw new Error(`Campaign ${compositeID} not found in DynamoDB`);
      const { PROCESSED, DISPATCHING, DISPATCHED } = record;
      if (!PROCESSED || PROCESSED < expectedCount) {
        throw new Error(`PROCESSED not ready (${PROCESSED ?? 0}/${expectedCount})`);
      }
      if (!DISPATCHING || DISPATCHING < expectedCount) {
        throw new Error(`DISPATCHING not ready (${DISPATCHING ?? 0}/${expectedCount})`);
      }
      if (!DISPATCHED || DISPATCHED < expectedCount) {
        throw new Error(`DISPATCHED not ready (${DISPATCHED ?? 0}/${expectedCount})`);
      }
    },
    25000,
    2000,
    `campaign ${compositeID} in DynamoDB`
  );
};

export const checkCampaignStatus = async (
  psoAPI: FetchService,
  campaignID: string
): Promise<CampaignStatus['ProcessingSummary']> => {
  try {
    const result = await psoAPI.get({ path: `/status/campaign/${campaignID}` });
    const campaignStatus = campaignStatusSchema.parse(result.body);
    if (campaignStatus.CampaignID !== campaignID) {
      throw new Error(`Campaign status returned ${campaignStatus.CampaignID} instead of ${campaignID}`);
    }

    return campaignStatus.ProcessingSummary;
  } catch (error) {
    if (error instanceof FetchErrorResponse && error.status === 404) {
      throw new Error(
        `Campaign ${campaignID} not found yet (404) - retrying - campaign status = ${JSON.stringify(campaignStatusSchema, null, 2)}`
      );
    }
    throw error;
  }
};
