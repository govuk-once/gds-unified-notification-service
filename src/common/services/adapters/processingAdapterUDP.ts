import { ConfigurationService } from '@common/services/configurationService';
import { ProcessingAdapter, ProcessingAdapterRequest, ProcessingAdapterResult } from '@common/services/interfaces';
import { SMConfigurationService } from '@common/services/smConfigurationService';
import z from 'zod';

import { ProcessingAdapterError } from '@common/models/Errors';
import { ServiceMisconfigurationError } from '@common/models/Errors/InternalServerError';
import { NoLinkingIdFound } from '@common/models/Errors/NotFoundError';
import { FetchService, isFetchResponseError } from '@common/services/FetchService';
import { FetchSigV4Service } from '@common/services/FetchSigV4Service';
import { ObservabilityService } from '@common/services/observabilityService';
import { StringParameters } from '@common/utils';

const UDPConfigSchema = z.object({
  apiAccountId: z.string(),
  apiKey: z.string(),
  apiUrl: z.string(),
  consumerRoleArn: z.string(),
  region: z.string(),
});

export class ProcessingAdapterUDP implements ProcessingAdapter {
  public client: FetchService;
  public udpConfig: z.infer<typeof UDPConfigSchema>;

  constructor(
    protected observability: ObservabilityService,
    protected config: ConfigurationService,
    protected smConfig: SMConfigurationService
  ) {}

  public async initialize(): Promise<void> {
    if (this.client == undefined && this.udpConfig == undefined) {
      // Fetch value from SSM - it's serialized JSON to allow it to be nullable
      const config = await this.config.getParameterAsType(
        StringParameters.UDP.Config.SM,
        z.string().or(z.null()),
        true
      );

      if (config == null) {
        this.observability.logger.error(
          `SSM Parameter ${StringParameters.UDP.Config.SM} cannot be null when using ProcessingAdapterUDP`
        );
        throw new ServiceMisconfigurationError();
      }

      // Fetch config from UDPs AWS Acc
      this.udpConfig = await this.smConfig.getParameterAsType(config, UDPConfigSchema, true);
      this.client = new FetchSigV4Service({
        baseUrl: this.udpConfig.apiUrl,
        defaultHeaders: {
          'x-api-key': this.udpConfig.apiKey,
        },
        credentials: {
          region: this.udpConfig.region,
          roleArn: this.udpConfig.consumerRoleArn,
          service: 'execute-api',
          externalId: 'UNS',
        },
      });
    }
  }

  public async send(request: ProcessingAdapterRequest): Promise<ProcessingAdapterResult> {
    this.observability.logger.info(`Processing using UDP adapter - mapping userID to externalUserID`, {
      userID: request.userID,
    });

    try {
      // /v1/{resourcePath+} - notifications is resource namespace that was assigned to us by flex
      const result = await this.client.get({
        // TODO: Figure out nicer way of passing that in to support multiple PSO's in the future
        path: `/v1/notifications`,
        headers: {
          'requesting-service': 'dvla',
          'requesting-service-user-id': request.userID,
        },
      });

      const data = z
        .object({
          data: z.object({
            consentStatus: z.string(),
            pushId: z.string(),
            // Backwards compatibility for testing purposes
            // NotificationId was recently renamed to PushId
            notificationId: z.string().optional(),
          }),
        })
        .parse(result.body);

      return {
        request,
        externalUserID: data.data.notificationId ?? data.data.pushId,
      };
    } catch (error) {
      this.errorHandler(request, error);
    }
  }

  private errorHandler(request: ProcessingAdapterRequest, error: unknown): never {
    this.observability.logger.error(`Processing adapter error`, { error });

    if (isFetchResponseError(error)) {
      this.observability.logger.error(`API Error data`, {
        NotificationID: request.userID,
        error: {
          name: error.name,
          status: error.status,
          message: error.message,
          response: error.body,
        },
      });

      if (error.status === 404) {
        throw new NoLinkingIdFound([`User ${request.userID} does not exist in UDP service`]);
      }

      throw new ProcessingAdapterError([error.message]);
    }
    this.observability.logger.error(`Non-api Error`, { error });
    throw error;
  }
}
