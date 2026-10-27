import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import * as z from 'zod';

const shape = (Object.keys(NotificationStateEnum) as (keyof typeof NotificationStateEnum)[]).reduce(
  (acc, key) => {
    acc[key] = z.number().optional();
    return acc;
  },
  {} as Record<keyof typeof NotificationStateEnum, z.ZodOptional<z.ZodNumber>>
);

export const ICampaignRecordSchema = z.object({
  CompositeID: z.string(),
  ...shape,
});

export type ICampaignRecord = z.infer<typeof ICampaignRecordSchema>;

/**
 * Test Fixtures
 */
export const mockCampaignRecord = (organisationID: string, campaignID: string): ICampaignRecord => ({
  CompositeID: `${organisationID}/${campaignID}`,
  VALIDATING: 2,
  VALIDATED: 0,
  VALIDATED_API_CALL: 1,
  VALIDATION_FAILED: 1,
  PROCESSING: 1,
  PROCESSED: 1,
  PROCESSING_FAILED: 1,
  DISPATCHING: 1,
  DISPATCHED: 1,
  DISPATCHING_FAILED: 1,
  RECEIVED: 1,
  READ: 1,
  MARKED_AS_UNREAD: 1,
  HIDDEN: 1,
});

export const mockPartialCampaignRecord = (organisationID: string, campaignID: string): ICampaignRecord => ({
  CompositeID: `${organisationID}/${campaignID}`,
  VALIDATING: 1,
});
