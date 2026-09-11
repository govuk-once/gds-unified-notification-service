import { ConfigurationService } from '@common/services/configurationService';
import {
  NotificationAdapter,
  NotificationAdapterRequest,
  NotificationAdapterResult,
} from '@common/services/interfaces';
import { ObservabilityService } from '@common/services/observabilityService';

export class NotificationAdapterVoid implements NotificationAdapter {
  constructor(
    protected readonly observability: ObservabilityService,
    protected readonly config: ConfigurationService
  ) {}

  public static create(observability: ObservabilityService, config: ConfigurationService) {
    return new NotificationAdapterVoid(observability, config);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async send(request: NotificationAdapterRequest): Promise<NotificationAdapterResult> {
    const metadata = {
      NotificationID: request.NotificationID,
    };
    this.observability.logger.info(`Sending notification using Void adapter`, metadata);

    return {
      notification: request,
      requestId: request.ExternalUserID,
    };
  }
}
