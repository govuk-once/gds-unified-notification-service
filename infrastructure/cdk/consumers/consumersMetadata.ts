import {
  ChannelsControlPreset,
  DeeplinkPreset,
  IOrganisationRecordBuilder,
  MessageRetentionPresent,
} from '@common/models/OrganisationMetadata';
import { EnvVars } from 'infrastructure/cdk/config';

export const orgMetadata = {
  // Internal test accounts
  UNS: IOrganisationRecordBuilder('UNS', {
    Channels: ChannelsControlPreset.All,
    MessageRetention: MessageRetentionPresent.OneMonth,
    DeeplinkAllowList: DeeplinkPreset.AppOnly,
  }),

  // Consumers
  DVLA: IOrganisationRecordBuilder('DVLA', {
    Channels: ChannelsControlPreset.All,
    MessageRetention: MessageRetentionPresent.OneMonth,
    DeeplinkAllowList: DeeplinkPreset.AppOnly,
  }),

  EventsAggregator: IOrganisationRecordBuilder('Foreign Travel Advice', {
    Channels: ChannelsControlPreset.Standard,
    MessageRetention: MessageRetentionPresent.OneMonth,
    DeeplinkAllowList: DeeplinkPreset.AppOnly,
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
