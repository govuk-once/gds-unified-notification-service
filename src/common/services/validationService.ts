import { BadRequestError, ContentValidationError } from '@common/models/Errors/BadRequestError';
import { IOrganisationConfig } from '@common/repositories';
import { ContentValidationService } from '@common/services/contentValidationService';
import { FeatureFlags } from '@common/services/interfaces';
import { filters, maps } from '@common/utils/array';
import { IMessageFields } from '@project/lambdas';

export class ValidationService {
  constructor(
    private readonly contentValidationService: ContentValidationService,
    private readonly featureFlags: FeatureFlags
  ) {}

  private createError(content: string) {
    return new ContentValidationError([content]);
  }

  public validateExpirationForOrganisation(expiresInDays: number, organisationConfig: IOrganisationConfig) {
    if (!organisationConfig.MessageRetention) {
      throw this.createError(
        'Invalid input: unexpected ExpiresInDays at ., message retention is disabled for this organisation'
      );
    }

    const { Allowed } = organisationConfig.MessageRetention;
    if (!Allowed) {
      throw this.createError(
        'Invalid input: unexpected ExpiresInDays at ., message retention is disabled for this organisation'
      );
    }

    const { Min, Max } = organisationConfig.MessageRetention;
    if (Min && expiresInDays < Min) {
      throw this.createError(
        `Invalid input: invalid ExpiresInDays at ., message retention is less than the minimum set for this organisation ${Min} days`
      );
    }
    if (Max && expiresInDays > Max) {
      throw this.createError(
        `Invalid input: invalid ExpiresInDays at ., message retention is greater than the maximum set for this organisation ${Max} days`
      );
    }
  }

  public messageValidation(messages: IMessageFields[], organisationConfig: IOrganisationConfig): void {
    for (const message of messages) {
      // Validates for unsupported markdown and urls in message body
      this.contentValidationService.validate(message.MessageBody);

      if (this.featureFlags.deeplinkUrl) {
        // Validates for unsupported urls in deeplinks - explicitly setting overrides rather than falling back on default validation provided by SSM, values in SSM are for content
        this.contentValidationService.validateUrls(message.DeeplinkURL, {
          protocols: (organisationConfig.DeeplinkAllowList ?? []).map(maps.pick('protocol')).filter(filters.isDefined),
          hostnames: (organisationConfig.DeeplinkAllowList ?? []).map(maps.pick('hostname')).filter(filters.isDefined),
        });
      } else {
        if (message.DeeplinkURL) {
          throw new BadRequestError(['Invalid input: unexpected DeeplinkURL at .']);
        }
      }

      if (message.Channel) {
        // Validates message channel against channel controls
        if (this.featureFlags.channelControls) {
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
        if (this.featureFlags.messageRetention) {
          this.validateExpirationForOrganisation(message.ExpiresInDays, organisationConfig);
        } else {
          throw new BadRequestError(['Invalid input: unexpected ExpiresInDays at .']);
        }
      }
    }
  }
}
