import { BadRequestError, ChannelsEnum, ContentValidationError } from '@common/models';
import { IOrganisationConfig } from '@common/repositories';
import { ValidationService } from '@common/services/validationService';
import { BoolParameters } from '@common/utils';
import { iocSpies, mockDefaultConfig, mockIMessageFields, mockServicesExpectedBehaviour } from '@test/mocks';
import { mockOrganisationConfig } from '@test/mocks/models/IOrganisationRecord.fixtures';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/services/configurationService.ts', { spy: true });

describe('ValidationService', async () => {
  let instance: ValidationService;

  // Initialize mock services, clients, and repositories
  const { serviceMocks } = await iocSpies();

  // Mocking implementation of the configuration service
  let mockParameterStore = mockDefaultConfig();

  const message = mockIMessageFields();
  const organisationConfig = mockOrganisationConfig();

  beforeEach(async () => {
    // Reset all mock
    vi.clearAllMocks();

    // Mock SSM store and services responses
    const { resetMockParameterStore } = mockServicesExpectedBehaviour(serviceMocks);
    mockParameterStore = resetMockParameterStore;

    instance = new ValidationService(
      serviceMocks.contentValidationServiceMock,
      await serviceMocks.configurationServiceMock.getFeatureFlags()
    );
  });

  describe('validateExpirationForOrganisation', () => {
    it('rejects if provided ExpiresInDays has a value when MessageRetention Allowed is false', () => {
      // Arrange
      const expiresInDays = 30;
      const organisationConfig: IOrganisationConfig = {
        MessageRetention: {
          Allowed: false,
        },
      };

      // Act
      const result = () => instance.validateExpirationForOrganisation(expiresInDays, organisationConfig);

      // Assert
      expect(result).toThrow(
        new ContentValidationError([
          'Invalid input: unexpected ExpiresInDays at ., message retention is disabled for this organisation',
        ])
      );
    });

    it('rejects if provided ExpiresInDays is less than the organisation minimum', () => {
      // Arrange
      const expiresInDays = 25;
      const organisationConfig: IOrganisationConfig = {
        MessageRetention: {
          Allowed: true,
          Min: 30,
          Max: 30,
        },
      };

      // Act
      const result = () => instance.validateExpirationForOrganisation(expiresInDays, organisationConfig);

      // Assert
      expect(result).toThrow(
        new ContentValidationError([
          'Invalid input: invalid ExpiresInDays at ., message retention is less than the minimum set for this organisation 30 days',
        ])
      );
    });

    it('rejects if provided ExpiresInDays is less than the organisation maximum', () => {
      // Arrange
      const expiresInDays = 30;
      const organisationConfig: IOrganisationConfig = {
        MessageRetention: {
          Allowed: true,
          Min: 10,
          Max: 20,
        },
      };

      // Act
      const result = () => instance.validateExpirationForOrganisation(expiresInDays, organisationConfig);

      // Assert
      expect(result).toThrow(
        new ContentValidationError([
          'Invalid input: invalid ExpiresInDays at ., message retention is greater than the maximum set for this organisation 20 days',
        ])
      );
    });

    it('validates if the MessageRetention Allows is true and provided ExpiresInDays falls within the minimum and maximum range', () => {
      // Arrange
      const expiresInDays = 25;
      const organisationConfig: IOrganisationConfig = {
        MessageRetention: {
          Allowed: true,
          Min: 20,
          Max: 30,
        },
      };

      // Act
      const result = instance.validateExpirationForOrganisation(expiresInDays, organisationConfig);

      // Assert
      expect(() => result).not.toThrow(ContentValidationError);
    });

    it('validates if the provided ExpiresInDays is equal to the minimum', () => {
      // Arrange
      const expiresInDays = 20;
      const organisationConfig: IOrganisationConfig = {
        MessageRetention: {
          Allowed: true,
          Min: 20,
          Max: 30,
        },
      };

      // Act
      const result = instance.validateExpirationForOrganisation(expiresInDays, organisationConfig);

      // Assert
      expect(() => result).not.toThrow(ContentValidationError);
    });

    it('validates if the provided ExpiresInDays is equal to the maximum', () => {
      // Arrange
      const expiresInDays = 30;
      const organisationConfig: IOrganisationConfig = {
        MessageRetention: {
          Allowed: true,
          Min: 20,
          Max: 30,
        },
      };

      // Act
      const result = instance.validateExpirationForOrganisation(expiresInDays, organisationConfig);

      // Assert
      expect(() => result).not.toThrow(ContentValidationError);
    });

    it('validates if the provided ExpiresInDays is equal to the minimum and maximum', () => {
      // Arrange
      const expiresInDays = 30;
      const organisationConfig: IOrganisationConfig = {
        MessageRetention: {
          Allowed: true,
          Min: 30,
          Max: 30,
        },
      };

      // Act
      const result = instance.validateExpirationForOrganisation(expiresInDays, organisationConfig);

      // Assert
      expect(() => result).not.toThrow(ContentValidationError);
    });
  });

  describe('validateMessage', () => {
    it('should NOT throw an error when called with a message containing deeplink that is on the allowlist', () => {
      // Arrange
      const messageWithDeeplink = {
        ...message,
        MessageBody: 'https://readme.gov.uk/hello-world?q=1',
      };
      // Act
      const result = instance.messageValidation([messageWithDeeplink], organisationConfig);

      // Assert
      expect(result).toBe(undefined);
    });

    it('should throw an error when called with a message containing deeplink that is not on the allowlist', () => {
      // Arrange
      const messageWithDeeplink = {
        ...message,
        MessageBody: 'https://example.com',
      };

      // Act
      const result = () => instance.messageValidation([messageWithDeeplink], organisationConfig);

      // Assert
      expect(result).toThrow(
        new BadRequestError(['https://example.com is using example.com hostname which is not on the allow list'])
      );
    });

    it('should validate messages that contain valid markdown.', () => {
      // Arrange
      const markdownMessageBody = {
        ...message,
        MessageBody:
          'This is a **long message** containing structural details that are valid under the markdown rules. We want to ensure that *all* allowable elements function seamlessly.',
      };

      // Act
      const result = instance.messageValidation([markdownMessageBody], organisationConfig);

      // Assert
      expect(result).toBe(undefined);
    });

    it('should reject messages that contain invalid markdown.', () => {
      // Arrange
      const markdownMessageBody = {
        ...message,
        MessageBody: '    const x = 10;\n    const y = 20;',
      };

      // Act
      const result = () => instance.messageValidation([markdownMessageBody], organisationConfig);

      // Assert
      expect(result).toThrow(
        new BadRequestError(['Message body contains markdown elements which are not valid: code_block'])
      );
    });

    it('should throw an error when called with a message containing deeplink and deeplinkUrl feature is disabled', async () => {
      // Arrange
      mockParameterStore[BoolParameters.Config.FeatureFlags.DeepLinkUrl] = 'false';
      // Re-initialising with new feature flags
      const instance = new ValidationService(
        serviceMocks.contentValidationServiceMock,
        await serviceMocks.configurationServiceMock.getFeatureFlags()
      );
      const messageWithDeeplink = {
        ...message,
        DeeplinkURL: 'https://example.com',
      };

      // Act
      const result = () => instance.messageValidation([messageWithDeeplink], organisationConfig);

      // Assert
      expect(result).toThrow(new BadRequestError(['Invalid input: unexpected DeeplinkURL at .']));
    });

    it('should throw an error when called with a message containing ExpiresInDays when message retention feature is disabled', async () => {
      // Arrange
      mockParameterStore[BoolParameters.Config.FeatureFlags.MessageRetention] = 'false';
      // Re-initialising with new feature flags
      const instance = new ValidationService(
        serviceMocks.contentValidationServiceMock,
        await serviceMocks.configurationServiceMock.getFeatureFlags()
      );
      const messageWithExpiresInDays = {
        ...message,
        ExpiresInDays: 25,
      };

      // Act
      const result = () => instance.messageValidation([messageWithExpiresInDays], organisationConfig);

      // Assert
      expect(result).toThrow(new BadRequestError(['Invalid input: unexpected ExpiresInDays at .']));
    });

    it('should return 400 when ControlChannels is disabled and Channel is a valid enum value', async () => {
      // Arrange
      mockParameterStore[BoolParameters.Config.FeatureFlags.ChannelControls] = 'false';
      // Re-initialising with new feature flags
      const instance = new ValidationService(
        serviceMocks.contentValidationServiceMock,
        await serviceMocks.configurationServiceMock.getFeatureFlags()
      );
      const messageWithChannel = {
        ...message,
        Channel: ChannelsEnum.MESSAGE_CENTRE_ONLY,
      };

      // Act
      const result = () => instance.messageValidation([messageWithChannel], organisationConfig);

      // Assert
      expect(result).toThrow(new BadRequestError(['Invalid input: unexpected Channel at .']));
    });

    it('should accept a message when Channel is in the organisation allowed channels - PUSH_NOTIFICATION_AND_MESSAGE_CENTRE', () => {
      // Arrange
      const organisationConfigWithAllowedChannel = {
        Channels: [ChannelsEnum.PUSH_NOTIFICATION_AND_MESSAGE_CENTRE],
      };
      const messageWithPushChannel = {
        ...message,
        Channel: ChannelsEnum.PUSH_NOTIFICATION_AND_MESSAGE_CENTRE,
      };

      // Act
      const result = instance.messageValidation([messageWithPushChannel], organisationConfigWithAllowedChannel);

      // Assert
      expect(result).toBe(undefined);
    });

    it('should accept a message when Channel is in the organisation allowed channels - MESSAGE_CENTRE', () => {
      // Arrange
      const organisationConfigWithAllowedChannel = {
        Channels: [ChannelsEnum.MESSAGE_CENTRE_ONLY],
      };
      const messageWithMessageChannel = { ...message, Channel: ChannelsEnum.MESSAGE_CENTRE_ONLY };

      // Act
      const result = instance.messageValidation([messageWithMessageChannel], organisationConfigWithAllowedChannel);

      // Assert
      expect(result).toBe(undefined);
    });

    it('should return 400 when Channel is not in the organisation allowed channels', () => {
      // Arrange
      const organisationConfigWithAllowedChannel = {
        Channels: [ChannelsEnum.MESSAGE_CENTRE_ONLY],
      };
      const messageWithPushChannel = {
        ...message,
        Channel: ChannelsEnum.PUSH_NOTIFICATION_AND_MESSAGE_CENTRE,
      };

      // Act
      const result = () => instance.messageValidation([messageWithPushChannel], organisationConfigWithAllowedChannel);

      // Assert
      expect(result).toThrow(
        new BadRequestError(['Invalid input: invalid Channel, this channel is unsupported for this organisation'])
      );
    });

    it('should return 400 when organisation has no allowed channels configured', () => {
      // Arrange
      const organisationConfigWithNoChannel = {};
      const messageWithPushChannel = {
        ...message,
        Channel: ChannelsEnum.PUSH_NOTIFICATION_AND_MESSAGE_CENTRE,
      };

      // Act
      const result = () => instance.messageValidation([messageWithPushChannel], organisationConfigWithNoChannel);

      // Assert
      expect(result).toThrow(
        new BadRequestError(['Invalid input: invalid Channel, this channel is unsupported for this organisation'])
      );
    });

    it('should accept a message without Channel even when organisation has no allowed channels', () => {
      // Arrange
      const organisationConfigWithNoChannel = {};

      // Act
      const result = instance.messageValidation([message], organisationConfigWithNoChannel);

      // Assert
      expect(result).toBe(undefined);
    });

    it('should return 400 when organisation has empty allowed channels array and channel is provided', () => {
      // Arrange
      const organisationConfigWithNoChannel = {
        Channels: [],
      };
      const messageWithPushChannel = {
        ...message,
        Channel: ChannelsEnum.PUSH_NOTIFICATION_AND_MESSAGE_CENTRE,
      };

      // Act
      const result = () => instance.messageValidation([messageWithPushChannel], organisationConfigWithNoChannel);

      // Assert
      expect(result).toThrow(
        new BadRequestError(['Invalid input: invalid Channel, this channel is unsupported for this organisation'])
      );
    });

    it('should accept reqeuests with DeeplinkURL when it is on the allow list', () => {
      // Arrange
      const organisationConfigWithDeeplinkURL: IOrganisationConfig = {
        DeeplinkAllowList: [{ hostname: 'example.com' }, { protocol: 'https:' }],
      };
      const messageWithDeeplink = {
        ...message,
        DeeplinkURL: 'https://example.com',
      };

      // Act
      const result = instance.messageValidation([messageWithDeeplink], organisationConfigWithDeeplinkURL);

      // Assert
      expect(result).toBe(undefined);
    });
    it('should reject reqeuests with DeeplinkURL when is not on the allow list', () => {
      // Arrange
      const organisationConfigWithDeeplinkURL: IOrganisationConfig = {
        DeeplinkAllowList: [{ hostname: 'example.com' }, { protocol: 'https:' }],
      };
      const messageWithDeeplink = {
        ...message,
        DeeplinkURL: 'https://not-example.com',
      };

      // Act
      const result = () => instance.messageValidation([messageWithDeeplink], organisationConfigWithDeeplinkURL);

      // Assert
      expect(result).toThrow(
        new BadRequestError([
          'https://not-example.com is using not-example.com hostname which is not on the allow list',
        ])
      );
    });

    it('should reject reqeuests with DeeplinkURL when protocol is not on the allow list', () => {
      // Arrange
      const organisationConfigWithDeeplinkURL: IOrganisationConfig = {
        DeeplinkAllowList: [{ hostname: 'example.com' }, { protocol: 'https:' }],
      };
      const messageWithDeeplink = {
        ...message,
        DeeplinkURL: 'mailto://example@example.com',
      };

      // Act
      const result = () => instance.messageValidation([messageWithDeeplink], organisationConfigWithDeeplinkURL);

      // Assert
      expect(result).toThrow(
        new BadRequestError([
          'mailto://example@example.com is using mailto: protocol which is not allowed. Allowed protocols: govuk:,https:',
        ])
      );
    });
  });
});
