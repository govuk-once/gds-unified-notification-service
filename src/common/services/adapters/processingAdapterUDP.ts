import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { ConfigurationService } from '@common/services/configurationService';
import { ProcessingAdapter, ProcessingAdapterRequest, ProcessingAdapterResult } from '@common/services/interfaces';
import { SMConfigurationService } from '@common/services/smConfigurationService';
import * as axios from 'axios';
import z from 'zod';

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
    protected logger: Logger,
    protected metrics: Metrics,
    protected tracer: Tracer,
    protected config: ConfigurationService,
    protected smConfig: SMConfigurationService
  ) {}

  async initialize(): Promise<void> {
    if (this.client == undefined && this.udpConfig == undefined) {
      // Fetch value from SSM - it's serialized JSON to allow it to be nullable
      const config = await this.config.getParameterAsType(
        StringParameters.UDP.Config.SM,
        z.string().or(z.null()),
        true
      );

      if (config == null) {
        throw new Error(
          `SSM Parameter ${StringParameters.UDP.Config.SM} cannot be null when using ProcessingAdapterUDP`
        );
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
    return;
  }

  async send(request: ProcessingAdapterRequest): Promise<ProcessingAdapterResult> {
    this.logger.info(`Processing using UDP adapter - mapping userID to externalUserID`, { userID: request.userID });

    // Note at the minute - this just fetches data and logs it, instead of returning it
    try {
      // /v1/{resourcePath+} - notifications is resource naspace that was assigned to us by flex
      const result = await this.client.get(`/v1/notifications`, {
        headers: {
          // TODO: Figure out nicer way of passing that in to support multiple PSO's in the future
          'requesting-service': 'dvla', //'dvla-service-gateway', //'DVLA' before
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
        success: true,
        externalUserID: data.data.notificationId ?? data.data.pushId,
      };
    } catch (e) {
      if (axios.isAxiosError(e)) {
        this.logger.error(`Axios Error data`, { e, data: e.response?.data });
      } else {
        this.logger.error(`Non-axios Error`, { e });
      }
    }

    // Fallback on 1:1 mapping
    return {
      request: request,
      success: true,
      externalUserID: request.userID,
    };
  }
}
