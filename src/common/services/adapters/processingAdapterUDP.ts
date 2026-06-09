import { ConfigurationService } from '@common/services/configurationService';
import { ProcessingAdapter, ProcessingAdapterRequest, ProcessingAdapterResult } from '@common/services/interfaces';
import { SMConfigurationService } from '@common/services/smConfigurationService';
import * as axios from 'axios';
import z from 'zod';

import { ProcessingAdapterError } from '@common/models/Errors/BadGatewayError';
import { ServiceMisconfigurationError } from '@common/models/Errors/InternalServerError';
import { NoLinkingIdFound } from '@common/models/Errors/NotFoundError';
import { ObservabilityService } from '@common/services/observabilityService';
import { StringParameters } from '@common/utils';
import { aws4Interceptor } from 'aws4-axios';

const UDPConfigSchema = z.object({
  apiAccountId: z.string(),
  apiKey: z.string(),
  apiUrl: z.string(),
  consumerRoleArn: z.string(),
  region: z.string(),
});

export class ProcessingAdapterUDP implements ProcessingAdapter {
  public client: axios.Axios;
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

      // Create HTTP client
      this.client = axios.default.create({
        baseURL: this.udpConfig.apiUrl,
        headers: {
          'x-api-key': this.udpConfig.apiKey,
        },
      });

      // Add SigV4 signer
      const interceptor = aws4Interceptor({
        options: {
          region: this.udpConfig.region,
          assumeRoleArn: this.udpConfig.consumerRoleArn,
          service: 'execute-api',
        },
      });
      this.client.interceptors.request.use(interceptor);
    }
  }

  public async send(request: ProcessingAdapterRequest): Promise<ProcessingAdapterResult> {
    this.observability.logger.info(`Processing using UDP adapter - mapping userID to externalUserID`, {
      userID: request.userID,
    });

    try {
      // /v1/{resourcePath+} - notifications is resource namespace that was assigned to us by flex
      const result = await this.client.get(`/v1/notifications`, {
        headers: {
          // TODO: Figure out nicer way of passing that in to support multiple PSO's in the future
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
        .parse(result.data);

      return {
        request,
        externalUserID: data.data.notificationId ?? data.data.pushId,
      };
    } catch (error) {
      this.errorHandler(request, error);
    }
  }

  private errorHandler(request: ProcessingAdapterRequest, error: unknown): never {
    if (axios.isAxiosError(error)) {
      this.observability.logger.error(`Axios Error data`, {
        NotificationID: request.userID,
        error: {
          name: error.name,
          status: error.status,
          message: error.message,
          response: error.response?.data,
        },
      });

      if (error.response?.status === 404) {
        throw new NoLinkingIdFound([`User ${request.userID} does not exist in UDP service`]);
      }

      throw new ProcessingAdapterError([error.message]);
    } else {
      this.observability.logger.error(`Non-axios Error`, { error });
      throw error;
    }
  }
}
