import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { ConfigurationService } from '@common/services';
import {
  NotificationAdapter,
  NotificationAdapterRequest,
  NotificationAdapterResult,
} from '@common/services/interfaces';
import * as axios from 'axios';

interface OneSignalPushNotificationResponse {
  id: string;
  external_id: string;
  errors: {
    invalid_aliases: {
      external_id: string[];
      one_signal_id: string[];
    };
    invalid_player_ids: string[];
  };
}

interface OnesignalPushNotificationErrorResponse {
  errors: string[];
}

export class NotificationAdapterOneSignal implements NotificationAdapter {
  protected client: axios.Axios;
  protected key: string;
  protected appId: string;
  constructor(
    protected logger: Logger,
    protected metrics: Metrics,
    protected tracer: Tracer,
    protected config: ConfigurationService
  ) {}

  async initialize(): Promise<void> {
    // Initialize only if the client has not been previously initialized
    if (this.client !== undefined) {
      return;
    }

    // Fetch configs
    this.key = (await this.config.getParameter(`config/dispatch/onesignal/apikey`))!;
    this.appId = (await this.config.getParameter(`config/dispatch/onesignal/appId`))!;
    this.client = axios.default.create({
      baseURL: `https://api.onesignal.com/`,
      headers: {
        Authorization: `Key ${this.key}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async send(request: NotificationAdapterRequest): Promise<NotificationAdapterResult> {
    const metadata = {
      NotificationID: request.NotificationID,
    };
    try {
      this.logger.info(`Sending notification using OneSignal adapter`, metadata);
      const result = await this.client.post<OneSignalPushNotificationResponse>(`/notifications?c=push`, {
        app_id: this.appId,
        headings: { en: request.NotificationTitle },
        contents: { en: request.NotificationBody },
        idempotency_key: request.NotificationID,
        target_channel: 'push',
        include_aliases: { external_id: [request.ExternalUserID] },
      });
      this.logger.info(`Successfully sent notification using OneSignal adapter`, metadata);
      return {
        notification: request,
        requestId: result.data.id,
        success: true,
      };
    } catch (error) {
      if (axios.isAxiosError<OnesignalPushNotificationErrorResponse>(error)) {
        this.logger.error(`Failed to dispatch notification using OneSignal adapter`, {
          ...metadata,
          status: error.status,
          response: error.response?.data,
        });
        throw error;
      }
    }

    return {
      notification: request,
      success: false,
    };
  }
}
