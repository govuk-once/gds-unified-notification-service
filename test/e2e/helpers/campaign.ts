import { iocGetCampaignsDynamoRepository } from '@common/ioc';
import { ICampaignRecord } from '@common/repositories';

export const createCampaign = async (campaignRecord: ICampaignRecord) => {
  const campaignRepository = await iocGetCampaignsDynamoRepository();
  await campaignRepository.createRecord(campaignRecord);
};

export const deleteCampaign = async (campaignID: string) => {
  const campaignRepository = await iocGetCampaignsDynamoRepository();
  await campaignRepository.deleteRecord(campaignID);
};
