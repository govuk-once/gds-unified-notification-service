import { IGroupMessage } from '@project/lambdas/interfaces/IGroupMessage';

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
