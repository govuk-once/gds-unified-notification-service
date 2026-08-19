import { ChannelsEnum } from '@common/models';
import { EnvVars } from 'infrastructure/cdk/config';

export const orgMetadata = {
  DVLA: {
    DisplayName: 'DVLA',
    OrganisationConfig: {
      MessageRetention: {
        Allowed: false,
      },
      Channels: [ChannelsEnum.PUSH_NOTIFICATION_AND_MESSAGE_CENTRE],
    },
  },
  UNS: {
    DisplayName: 'UNS',
    OrganisationConfig: {
      MessageRetention: {
        Allowed: true,
        Min: 2,
        Max: 30,
      },
      Channels: [ChannelsEnum.PUSH_NOTIFICATION_AND_MESSAGE_CENTRE, ChannelsEnum.MESSAGE_CENTRE_ONLY],
    },
  },
} as const;

type OrgMetadata = Record<string, { DisplayName: string; OrganisationConfig: Record<string, unknown> }>;

export const getConsumersMetadata = (config: EnvVars): OrgMetadata => {
  return Object.fromEntries(
    Object.entries(orgMetadata).map(([orgId, org]) => {
      const { Channels, MessageRetention } = org.OrganisationConfig;
      return [
        orgId,
        {
          ...org,
          OrganisationConfig: {
            ...(config.featureFlag.channelControls && { Channels }),
            ...(config.featureFlag.messageRetention && { MessageRetention }),
          },
        },
      ];
    })
  );
};
