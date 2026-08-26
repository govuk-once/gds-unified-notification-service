import { ChannelsEnum } from '@common/models';
import {
  ChannelsControlPreset,
  IOrganisationRecordBuilder,
  MessageRetentionPresent,
} from '@common/models/OrganisationMetadata';
import { EnvVars } from 'infrastructure/cdk/config';

export const orgMetadata = {
  // Internal test account
  UNS: IOrganisationRecordBuilder('UNS', {
    Channels: ChannelsControlPreset.All,
    MessageRetention: MessageRetentionPresent.OneMonth,
    DeeplinkAllowList: [
      {
        protocol: 'govuk:',
      },
      {
        protocol: 'https:',
      },
    ],
  }),

  // Consumers
  DVLA: IOrganisationRecordBuilder('DVLA', {
    Channels: [ChannelsEnum.PUSH_NOTIFICATION_AND_MESSAGE_CENTRE],
    MessageRetention: MessageRetentionPresent.NotAllowed,
  }),

  EventsAggregator: IOrganisationRecordBuilder('Foreign Travel Advice', {
    Channels: ChannelsControlPreset.All,
    MessageRetention: MessageRetentionPresent.NotAllowed,
  }),
} as const;

type OrgMetadata = Record<string, { DisplayName: string } & ReturnType<typeof IOrganisationRecordBuilder>>;

export const getConsumersMetadata = (config: EnvVars): OrgMetadata => {
  return Object.fromEntries(
    Object.entries(orgMetadata).map(([orgId, org]) => {
      return [orgId, org];
    })
  );
};
