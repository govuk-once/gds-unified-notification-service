import { DispatchAdapterError } from '@common/models/Errors/BadGatewayError';
import { NoDispatchIdFound } from '@common/models/Errors/NotFoundError';
import { ConfigurationService, ObservabilityService } from '@common/services';
import { FetchService, isFetchResponseError } from '@common/services/FetchService';
import {
  NotificationAdapter,
  NotificationAdapterRequest,
  NotificationAdapterResult,
} from '@common/services/interfaces';
import { StringParameters } from '@common/utils';

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

export class NotificationAdapterOneSignal implements NotificationAdapter {
  public client: FetchService;
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

    this.client = new FetchService({
      baseUrl: `https://api.onesignal.com/`,
      defaultHeaders: {
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
      const result = await this.client.post<OneSignalPushNotificationResponse>({
        path: `/notifications?c=push`,
        body: {
          app_id: this.appId,
          headings: { en: request.NotificationTitle },
          contents: { en: request.NotificationBody },
          idempotency_key: request.NotificationID,
          target_channel: 'push',
          include_aliases: { external_id: [request.ExternalUserID] },
          data: {
            deeplink: this.deeplinkTemplate.replace('{id}', request.NotificationID),
          },
        },
      });

      this.observability.logger.info(`Successfully sent notification using OneSignal adapter`, metadata);

      // Detect hidden failures
      if ((Array.isArray(result.body.errors) && result.body.errors.length > 0) || result.body.id == '') {
        this.observability.logger.error(`Failed to dispatch notification using OneSignal adapter - received 200 code`, {
          ...metadata,
          status: result.status,
          response: result.body,
        });

        if (result.status === 404) {
          throw new NoDispatchIdFound([`User ${request.ExternalUserID} does not exist in OneSignal service`]);
        }
        const errors = result.body.errors;
        const errorPayload = Array.isArray(errors)
          ? errors
          : ['Failed to dispatch notification using OneSignal adapter - received 200 code'];
        throw new DispatchAdapterError(errorPayload);
      }

      return {
        notification: request,
        requestId: result.body.id,
      };
    } catch (e) {
      return this.errorHandler(request, e);
    }
  }

  private errorHandler(request: NotificationAdapterRequest, error: unknown): never {
    if (isFetchResponseError(error)) {
      this.observability.logger.error(`Failed to dispatch notification using OneSignal adapter`, {
        NotificationID: request.NotificationID,
        error: {
          name: error.name,
          status: error.status,
          message: error.errorMessage ?? error.message,
          response: error.body,
        },
      });

      if (error.status === 404) {
        throw new NoDispatchIdFound([`User ${request.ExternalUserID} not found in OneSignal`]);
      }
      throw new DispatchAdapterError([error.errorMessage]);
    }

    throw error;
  }
}
