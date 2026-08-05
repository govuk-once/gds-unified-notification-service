import { IMessageFields } from '@project/lambdas/interfaces/IMessage';
import z from 'zod';

// Identifiable fields from a group message used for logging
export const IIdentifiableGroupMessageSchema = z.object({
  GroupNotificationID: z.string(),
  CampaignID: z.string().optional(),
  Namespace: z.string(),
  Group: z.string(),
  Subgroup: z.string().optional(),
});
export type IIdentifiableGroupMessage = z.infer<typeof IIdentifiableGroupMessageSchema>;

// Group Message Fields Schemas
export const IGroupMessageSchema = z.object({
  ...IIdentifiableGroupMessageSchema.shape,
  ...IMessageFields.shape,
});
export type IGroupMessage = z.infer<typeof IGroupMessageSchema>;
