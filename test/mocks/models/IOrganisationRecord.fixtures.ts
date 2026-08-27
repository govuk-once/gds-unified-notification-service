import { ChannelsEnum } from '@common/models';
import { IOrganisationConfig, IOrganisationRecord } from '@common/repositories';

export const mockIOrganisationRecord = (OrganisationID?: string, DisplayName?: string): IOrganisationRecord => ({
  OrganisationID: OrganisationID ?? 'ORG01',
  DisplayName: DisplayName ?? 'ORG',
  OrganisationConfig: {
    MessageRetention: {
      Allowed: false,
    },
  },
});

export const mockOrganisationConfig = (): IOrganisationConfig => ({
  MessageRetention: {
    Allowed: true,
    Min: 10,
    Max: 30,
  },
  Channels: [ChannelsEnum.PUSH_NOTIFICATION_AND_MESSAGE_CENTRE, ChannelsEnum.MESSAGE_CENTRE_ONLY],
});
