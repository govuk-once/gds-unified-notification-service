import * as z from 'zod';

export const ICampaignRecordSchema = z.object({
  CompositeID: z.string(),
});

export type ICampaignRecord = z.infer<typeof ICampaignRecordSchema>;
