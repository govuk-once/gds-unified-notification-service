import { IMessageFieldsSchema } from '@project/lambdas/interfaces/IMessage';
import { v4 as uuid } from 'uuid';
import z from 'zod';

// Identifiable fields from a group message used for logging
export const IIdentifiableGroupMessageSchema = z.object({
  // Generate GroupNotificationIDs if not provided
  GroupNotificationID: z.string().default(() => uuid()),
  OrganisationID: z.string(),
  CampaignID: z.string().optional(),
  Namespace: z.string(),
  Group: z.string(),
  Subgroup: z.string().optional(),
});
export type IIdentifiableGroupMessage = z.infer<typeof IIdentifiableGroupMessageSchema>;

// Group Message Fields Schemas
export const IGroupMessageSchema = z.object({
  ...IIdentifiableGroupMessageSchema.shape,
  ...IMessageFieldsSchema.shape,
});
export type IGroupMessage = z.infer<typeof IGroupMessageSchema>;

/**
 * Test Fixtures
 */
export const mockIGroupMessage = (): Omit<IGroupMessage, 'OrganisationID'> => ({
  Namespace: 'travel',
  Group: 'france',
  Subgroup: 'immediate',
  GroupNotificationID: 'TO_GROUP_ID',
  CampaignID: 'CAM_ID',
  MessageTitle: 'You have a new Message',
  MessageBody: 'Open Notification Centre to read your notifications',
  NotificationTitle: 'You have a new Notification',
  NotificationBody: 'Here is the Notification body.',
});
