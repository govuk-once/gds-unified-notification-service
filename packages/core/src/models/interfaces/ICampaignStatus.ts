import z from 'zod';

export const campaignStatusSchema = z.object({
  CampaignID: z.string(),
  DepartmentID: z.string(),
  ProcessingSummary: z.object({
    RECEIVED: z.number(),
    PROCESSED: z.number(),
    DISPATCHED: z.number(),
  }),
  UsageSummary: z.object({
    READ: z.number(),
    MARKED_AS_UNREAD: z.number(),
    HIDDEN: z.number(),
  }),
});
export type CampaignStatus = z.infer<typeof campaignStatusSchema>;
