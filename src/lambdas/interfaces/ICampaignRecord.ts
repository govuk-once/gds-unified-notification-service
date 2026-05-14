import * as z from 'zod';

export const ICampaignRecordSchema = z.object({
  CompositeID: z.string(),
  VALIDATING: z.number().optional(),
  VALIDATED: z.number().optional(),
  VALIDATED_API_CALL: z.number().optional(),
  PROCESSING: z.number().optional(),
  PROCESSED: z.number().optional(),
  PROCESSING_FAILED: z.number().optional(),
  DISPATCHING: z.number().optional(),
  DISPATCHED: z.number().optional(),
  DISPATCHING_FAILED: z.number().optional(),
  RECEIVED: z.number().optional(),
  READ: z.number().optional(),
  MARKED_AS_UNREAD: z.number().optional(),
  HIDDEN: z.number().optional(),
});

export type ICampaignRecord = z.infer<typeof ICampaignRecordSchema>;
