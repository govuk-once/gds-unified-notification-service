import { DispatchAdapterError } from '@common/models/Errors/BadGatewayError';
import { BaseError } from '@common/models/Errors/BaseError';
import { NoDispatchIdFound } from '@common/models/Errors/NotFoundError';
import { ConfigurationService, ObservabilityService } from '@common/services';
import {
  NotificationAdapter,
  NotificationAdapterRequest,
  NotificationAdapterResult,
} from '@common/services/interfaces';
import { StringParameters } from '@common/utils';
import * as axios from 'axios';

interface OneSignalPushNotificationResponse {
  id: string;
  external_id: string;
  errors:
    | {
        invalid_aliases: {
          external_id: string[];
          one_signal_id: string[];
        };
        invalid_player_ids: string[];
      }
    | string[];
}

interface OnesignalPushNotificationErrorResponse {
  errors: string[];
}

export class NotificationAdapterOneSignal implements NotificationAdapter {
  public client: axios.Axios;
  protected key: string;
  protected appId: string;
  protected deeplinkTemplate: string;

  constructor(
    protected observability: ObservabilityService,
    protected config: ConfigurationService
  ) {}

  public async initialize(): Promise<void> {
    // Initialize only if the client has not been previously initialized
    if (this.client !== undefined) {
      return;
    }

    // Fetch configs
    this.key = await this.config.getParameter(StringParameters.Dispatch.OneSignal.ApiKey);
    this.appId = await this.config.getParameter(StringParameters.Dispatch.OneSignal.AppId);
    this.deeplinkTemplate = await this.config.getParameter(StringParameters.Notification.DeeplinkTemplate);

    this.client = axios.default.create({
      baseURL: `https://api.onesignal.com/`,
      headers: {
        Authorization: `Key ${this.key}`,
        'Content-Type': 'application/json',
      },
    });
  }

  public async send(request: NotificationAdapterRequest): Promise<NotificationAdapterResult> {
    const metadata = {
      NotificationID: request.NotificationID,
    };

    try {
      this.observability.logger.info(`Sending notification using OneSignal adapter`, metadata);
      const result = await this.client.post<OneSignalPushNotificationResponse>(`/notifications?c=push`, {
        app_id: this.appId,
        headings: { en: request.NotificationTitle },
        contents: { en: request.NotificationBody },
        idempotency_key: request.NotificationID,
        target_channel: 'push',
        include_aliases: { external_id: [request.ExternalUserID] },
        data: {
          deeplink: this.deeplinkTemplate.replace('{id}', request.NotificationID),
        },
      });
      this.observability.logger.info(`Successfully sent notification using OneSignal adapter`, metadata);

      // Detect hidden failures
      if ((Array.isArray(result.data.errors) && result.data.errors.length > 0) || result.data.id == '') {
        this.observability.logger.error(`Failed to dispatch notification using OneSignal adapter - received 200 code`, {
          ...metadata,
          status: result.status,
          response: result.data,
        });

        if (result.status === 404) {
          throw new NoDispatchIdFound([`User ${request.ExternalUserID} does not exist in OneSignal service`]);
        }
        const errors = result.data.errors;
        const errorPayload = Array.isArray(errors)
          ? errors
          : ['Failed to dispatch notification using OneSignal adapter - received 200 code'];
        throw new DispatchAdapterError(errorPayload);
      }

      return {
        notification: request,
        requestId: result.data.id,
      };
    } catch (error) {
      this.errorHandler(request, error);
    }
  }

  private errorHandler(request: NotificationAdapterRequest, error: unknown): never {
    if (axios.isAxiosError<OnesignalPushNotificationErrorResponse>(error)) {
      this.observability.logger.error(`Failed to dispatch notification using OneSignal adapter`, {
        NotificationID: request.NotificationID,
        error: {
          name: error.name,
          status: error.status,
          message: error.message,
          response: error.response?.data,
        },
      });

      if (error.response?.status === 404) {
        throw new NoDispatchIdFound([`User ${request.ExternalUserID} not found in OneSignal`]);
      }
      throw new DispatchAdapterError([error.message]);
    }

    if (!(error instanceof BaseError)) {
      this.observability.logger.error(`Non-axios Error`, { error });
    }
    throw error;
  }
}
