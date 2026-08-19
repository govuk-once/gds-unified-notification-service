import { BadRequestError } from '@common/models/Errors/BadRequestError';
import { APIHandler } from '@common/operations/httpOperation';
import { IOrganisationConfig } from '@common/repositories';
import { ConfigurationService, ContentValidationService, ObservabilityService } from '@common/services';
import { BoolParameters } from '@common/utils';
import { IMessageFields } from '@project/lambdas';
import { ZodAny, ZodType } from 'zod';

export abstract class HttpMessageValidationOperator<
  InputSchema extends ZodType = ZodAny,
  OutputSchema extends ZodType = ZodAny,
> extends APIHandler<InputSchema, OutputSchema> {
  public contentValidationService!: ContentValidationService;

  constructor(
    protected observability: ObservabilityService,
    protected config: ConfigurationService
  ) {
    super(observability);
  }

  protected async messageValidation(messages: IMessageFields[], organisationConfig: IOrganisationConfig) {
    // Retrieves feature flags to validate message configuration against
    const featureEnabledDeepLinkUrl = await this.config.getBooleanParameter(
      BoolParameters.Config.FeatureFlags.DeepLinkUrl
    );
    const featureEnabledChannelControls = await this.config.getBooleanParameter(
      BoolParameters.Config.FeatureFlags.ChannelControls
    );
    const featureEnabledMessageRetention = await this.config.getBooleanParameter(
      BoolParameters.Config.FeatureFlags.MessageRetention
    );

    for (const message of messages) {
      // Validates for unsupported markdown and urls in message body
      this.contentValidationService.validate(message.MessageBody);

      if (featureEnabledDeepLinkUrl) {
        // Validates for unsupported urls in deeplinks
        this.contentValidationService.validateUrls(message.DeeplinkURL);
      } else {
        if (message.DeeplinkURL) {
          throw new BadRequestError(['Invalid input: unexpected DeeplinkURL at .']);
        }
      }

      if (message.Channel) {
        // Validates message channel against channel controls
        if (featureEnabledChannelControls) {
          console.log(organisationConfig.Channels);
          if (!organisationConfig.Channels?.includes(message.Channel)) {
            throw new BadRequestError([
              'Invalid input: invalid Channel, this channel is unsupported for this organisation',
            ]);
          }
        } else {
          throw new BadRequestError(['Invalid input: unexpected Channel at .']);
        }
      }

      if (message.ExpiresInDays) {
        // Validates expirations in days against message retention
        if (featureEnabledMessageRetention) {
          this.contentValidationService.validateExpirationForOrganisation(message.ExpiresInDays, organisationConfig);
        } else {
          throw new BadRequestError(['Invalid input: unexpected ExpiresInDays at .']);
        }
      }
    }
  }
}
