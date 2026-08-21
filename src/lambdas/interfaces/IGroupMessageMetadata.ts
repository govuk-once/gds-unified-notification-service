import { md5ToUuidV4 } from '@common/utils';
import { IGroupMessageSchema } from '@project/lambdas/interfaces/IGroupMessage';
import { IProcessedMessage } from '@project/lambdas/interfaces/IMessage';
import z from 'zod';

export const IGroupMessageMetadataSchema = z.object({
  GroupMessage: IGroupMessageSchema.extend({ GroupNotificationID: z.string() }),
  GroupNotificationID: z.string(),
  WorkerID: z.number(),
  CacheKey: z.string(),
  APIGWExtendedID: z.string().optional(),
  ReceivedDateTime: z.string().optional(),
  ValidatedDateTime: z.string().optional(),
});

export type IGroupMessageMetadata = z.infer<typeof IGroupMessageMetadataSchema>;

/**
 * Test Fixtures
 */
export const mockIGroupMessageMetadata = (): IGroupMessageMetadata => ({
  GroupMessage: {
    GroupNotificationID: 'GRP_01',
    Namespace: 'travel',
    Group: 'france',
    Subgroup: 'immediate',
    CampaignID: 'CAM_ID',
    OrganisationID: 'ORG01',
    NotificationTitle: 'Hey',
    NotificationBody: "You've got a message in the message centre",
    MessageTitle: 'Hi there',
    MessageBody: 'MOCK_LONG_MESSAGE',
  },
  GroupNotificationID: 'GRP_01',
  WorkerID: 0,
  CacheKey: 'Worker/GroupProcessingWorker/GRP_01/0',
  APIGWExtendedID: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
  ReceivedDateTime: '2026-01-01T12:00:00.000Z',
  ValidatedDateTime: '2026-01-01T12:00:01.000Z',
});

export const mockIFailedGroupMessageMetadata = (): IGroupMessageMetadata => {
  const groupMessageMetadata = mockIGroupMessageMetadata();
  return {
    ...groupMessageMetadata,
    GroupMessage: {
      GroupNotificationID: 'GRP_01',
      Namespace: 'travel',
      Group: 'france',
      Subgroup: 'immediate',
      CampaignID: 'CAM_ID',
      OrganisationID: 'ORG01',
      // Missed out on purpose NotificationTitle, NotificationBody
    },
  } as unknown as IGroupMessageMetadata;
};

export const mockIUnidentifiableGroupMessageMetadata = (): IGroupMessageMetadata => {
  const groupMessageMetadata = mockIGroupMessageMetadata();
  return {
    ...groupMessageMetadata,
    GroupMessage: {
      Namespace: 'travel',
      Group: 'france',
      Subgroup: 'immediate',
      CampaignID: 'CAM_ID',
      OrganisationID: 'ORG01',
      // Missed out on purpose GroupNotificationID, NotificationTitle, NotificationBody
    },
    GroupNotificationID: undefined,
  } as unknown as IGroupMessageMetadata;
};

export const mockIProcessedGroupMessage = (
  groupMessageMetadata: IGroupMessageMetadata,
  pushID: string
): IProcessedMessage => {
  const notificationID = md5ToUuidV4({
    PushID: pushID,
    OrganisationID: groupMessageMetadata.GroupMessage.OrganisationID,
    GroupNotificationID: groupMessageMetadata.GroupMessage.GroupNotificationID,
    NotificationTitle: groupMessageMetadata.GroupMessage.NotificationTitle,
    NotificationBody: groupMessageMetadata.GroupMessage.NotificationBody,
    MessageTitle: groupMessageMetadata.GroupMessage.MessageTitle,
    MessageBody: groupMessageMetadata.GroupMessage.MessageBody,
  });
  return {
    NotificationID: notificationID,
    CampaignID: groupMessageMetadata.GroupMessage.CampaignID,
    OrganisationID: groupMessageMetadata.GroupMessage.OrganisationID,
    ExternalUserID: pushID,
    NotificationTitle: groupMessageMetadata.GroupMessage.NotificationTitle,
    NotificationBody: groupMessageMetadata.GroupMessage.NotificationBody,
    MessageTitle: groupMessageMetadata.GroupMessage.MessageTitle,
    MessageBody: groupMessageMetadata.GroupMessage.MessageBody,
  };
};
