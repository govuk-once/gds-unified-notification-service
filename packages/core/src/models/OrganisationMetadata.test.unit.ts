import { ChannelsEnum } from '@common/models/ChannelsEnum';
import {
  ChannelsControlPreset,
  DeeplinkPreset,
  IOrganisationRecordBuilder,
  MessageRetentionPresent,
} from '@common/models/OrganisationMetadata';

describe('MessageRetentionPresent', () => {
  it('should define NotAllowed preset with Allowed false', () => {
    expect(MessageRetentionPresent.NotAllowed).toEqual({ Allowed: false });
  });

  it('should define OneMonth preset with correct bounds', () => {
    expect(MessageRetentionPresent.OneMonth).toEqual({ Allowed: true, Min: 2, Max: 30 });
  });
});

describe('ChannelsControlPreset', () => {
  it('should define None preset as empty array', () => {
    expect(ChannelsControlPreset.None).toEqual([]);
  });

  it('should define Standard preset with PUSH_NOTIFICATION_AND_MESSAGE_CENTRE only', () => {
    expect(ChannelsControlPreset.Standard).toEqual([ChannelsEnum.PUSH_NOTIFICATION_AND_MESSAGE_CENTRE]);
  });

  it('should define All preset with both channel types', () => {
    expect(ChannelsControlPreset.All).toEqual([
      ChannelsEnum.PUSH_NOTIFICATION_AND_MESSAGE_CENTRE,
      ChannelsEnum.MESSAGE_CENTRE_ONLY,
    ]);
  });
});

describe('DeeplinkPreset', () => {
  it('should define None preset as empty array', () => {
    expect(DeeplinkPreset.None).toEqual([]);
  });

  it('should define AppOnly preset with govuk protocol entry', () => {
    expect(DeeplinkPreset.AppOnly).toEqual([{ protocol: 'govuk:' }]);
  });
});

describe('IOrganisationRecordBuilder', () => {
  it('should build a record with the provided display name', () => {
    // Arrange & Act
    const result = IOrganisationRecordBuilder('Test Org', {});

    // Assert
    expect(result.DisplayName).toBe('Test Org');
  });

  it('should spread provided props into OrganisationConfig', () => {
    // Arrange
    const props = {
      MessageRetention: MessageRetentionPresent.OneMonth,
      Channels: ChannelsControlPreset.Standard,
      DeeplinkAllowList: DeeplinkPreset.AppOnly,
    };

    // Act
    const result = IOrganisationRecordBuilder('Test Org', props);

    // Assert
    expect(result.OrganisationConfig).toEqual(props);
  });

  it('should default MessageRetention to NotAllowed when not provided', () => {
    // Arrange & Act
    const result = IOrganisationRecordBuilder('Test Org', {});

    // Assert
    expect(result.OrganisationConfig.MessageRetention).toEqual(MessageRetentionPresent.NotAllowed);
  });

  it('should default Channels to None when not provided', () => {
    // Arrange & Act
    const result = IOrganisationRecordBuilder('Test Org', {});

    // Assert
    expect(result.OrganisationConfig.Channels).toEqual(ChannelsControlPreset.None);
  });

  it('should default DeeplinkAllowList to None when not provided', () => {
    // Arrange & Act
    const result = IOrganisationRecordBuilder('Test Org', {});

    // Assert
    expect(result.OrganisationConfig.DeeplinkAllowList).toEqual(DeeplinkPreset.None);
  });

  it('should not override MessageRetention when explicitly provided', () => {
    // Arrange
    const props = { MessageRetention: MessageRetentionPresent.OneMonth };

    // Act
    const result = IOrganisationRecordBuilder('Test Org', props);

    // Assert
    expect(result.OrganisationConfig.MessageRetention).toEqual(MessageRetentionPresent.OneMonth);
  });

  it('should not override Channels when explicitly provided', () => {
    // Arrange
    const props = { Channels: ChannelsControlPreset.All };

    // Act
    const result = IOrganisationRecordBuilder('Test Org', props);

    // Assert
    expect(result.OrganisationConfig.Channels).toEqual(ChannelsControlPreset.All);
  });

  it('should not override DeeplinkAllowList when explicitly provided', () => {
    // Arrange
    const props = { DeeplinkAllowList: DeeplinkPreset.AppOnly };

    // Act
    const result = IOrganisationRecordBuilder('Test Org', props);

    // Assert
    expect(result.OrganisationConfig.DeeplinkAllowList).toEqual(DeeplinkPreset.AppOnly);
  });
});
