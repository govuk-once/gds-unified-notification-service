import { ChannelsEnum } from '@common/models/ChannelsEnum';
import { IOrganisationConfig } from '@common/repositories';

// Shorthand configuration presets
export const MessageRetentionPresent = {
  NotAllowed: { Allowed: false },
  OneMonth: { Allowed: true, Min: 2, Max: 30 },
} as const;

export const ChannelsControlPreset = {
  None: [] as ChannelsEnum[],
  Standard: [ChannelsEnum.PUSH_NOTIFICATION_AND_MESSAGE_CENTRE] as ChannelsEnum[],
  All: [ChannelsEnum.PUSH_NOTIFICATION_AND_MESSAGE_CENTRE, ChannelsEnum.MESSAGE_CENTRE_ONLY] as ChannelsEnum[],
};

export const IOrganisationRecordBuilder = (displayName: string, props: IOrganisationConfig) => {
  return {
    DisplayName: displayName,
    OrganisationConfig: {
      ...props,
      MessageRetention: props.MessageRetention ?? MessageRetentionPresent.NotAllowed,
      Channels: props.Channels ?? ChannelsControlPreset.None,
    },
  };
};
